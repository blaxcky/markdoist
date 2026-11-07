import { describe, expect, it } from "vitest";
import {
  appendDictation,
  checkKey,
  cleanupRequest,
  DEFAULT_DICTATION,
  DictationError,
  extractOutputText,
  formatDuration,
  maskKey,
  parseDictationSettings,
  runDictation,
  T,
  transcriptionFields,
  type FetchLike,
} from "../src";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(responses: ((call: Call) => { status: number; json?: unknown } | Error)[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const r = responses[calls.length - 1]!(call);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  };
  return { fetch, calls };
}

const message = (text: string) => ({
  output: [
    { type: "reasoning", summary: [] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
  ],
});

const ctx = { list: "Markdoist", title: "Diktieren einbauen" };
const form = (fields: [string, string][]) => ({ fields, file: "diktat.m4a" });

describe("Diktieren (4.9)", () => {
  it("Erkennung und Bereinigung mit den eingestellten Modellen", async () => {
    const { fetch, calls } = fakeFetch([
      () => ({ status: 200, json: { text: " äh also der Knopf soll äh rot sein " } }),
      () => ({ status: 200, json: message("Der Knopf soll rot sein.") }),
    ]);
    const phases: string[] = [];
    const r = await runDictation({ fetch, key: " sk-test ", settings: DEFAULT_DICTATION, ctx, form, onPhase: (p) => phases.push(p) });
    expect(r).toEqual({ text: "Der Knopf soll rot sein.", raw: "äh also der Knopf soll äh rot sein", cleaned: true });
    expect(phases).toEqual(["transcribing", "cleaning"]);

    expect(calls[0]!.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(calls[0]!.headers.Authorization).toBe("Bearer sk-test");
    const body0 = calls[0]!.body as ReturnType<typeof form>;
    expect(body0.file).toBe("diktat.m4a");
    expect(body0.fields).toContainEqual(["model", "gpt-transcribe"]);
    expect(body0.fields).toContainEqual(["languages[]", "de"]);
    expect(body0.fields.find(([k]) => k === "prompt")![1]).toContain("Markdoist");

    expect(calls[1]!.url).toBe("https://api.openai.com/v1/responses");
    expect(calls[1]!.headers["Content-Type"]).toBe("application/json");
    const body1 = JSON.parse(calls[1]!.body as string);
    expect(body1.model).toBe("gpt-6.1-terra");
    expect(body1.reasoning).toEqual({ effort: "low" });
    expect(body1.input).toBe("äh also der Knopf soll äh rot sein");
    expect(body1.instructions).toContain("Füllwörter");
  });

  it("eigene Basis-URL und Modelle", async () => {
    const { fetch, calls } = fakeFetch([() => ({ status: 200, json: { text: "Hallo" } }), () => ({ status: 200, json: message("Hallo.") })]);
    const settings = { transcribeModel: "neu-transcribe", cleanupModel: "neu-clean", cleanup: true };
    await runDictation({ fetch, key: "k", settings, ctx: {}, form, baseUrl: "http://127.0.0.1:9/v1" });
    expect(calls[0]!.url).toBe("http://127.0.0.1:9/v1/audio/transcriptions");
    expect((calls[0]!.body as ReturnType<typeof form>).fields).toContainEqual(["model", "neu-transcribe"]);
    expect(JSON.parse(calls[1]!.body as string).model).toBe("neu-clean");
  });

  it("ohne Bereinigung nur eine Anfrage", async () => {
    const { fetch, calls } = fakeFetch([() => ({ status: 200, json: { text: "roh" } })]);
    const r = await runDictation({ fetch, key: "k", settings: { ...DEFAULT_DICTATION, cleanup: false }, ctx, form });
    expect(r).toEqual({ text: "roh", raw: "roh", cleaned: false });
    expect(calls).toHaveLength(1);
  });

  it("scheitert die Bereinigung, kommt der Rohtext", async () => {
    const { fetch } = fakeFetch([() => ({ status: 200, json: { text: "roh" } }), () => ({ status: 500 })]);
    const r = await runDictation({ fetch, key: "k", settings: DEFAULT_DICTATION, ctx, form });
    expect(r).toEqual({ text: "roh", raw: "roh", cleaned: false, cleanupError: "server" });
    const leer = fakeFetch([() => ({ status: 200, json: { text: "roh" } }), () => ({ status: 200, json: { output: [] } })]);
    expect((await runDictation({ fetch: leer.fetch, key: "k", settings: DEFAULT_DICTATION, ctx, form })).cleaned).toBe(false);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "quota"],
    [504, "timeout"],
    [500, "server"],
  ] as const)("HTTP %i bei der Erkennung ergibt %s", async (status, kind) => {
    const { fetch } = fakeFetch([() => ({ status })]);
    await expect(runDictation({ fetch, key: "k", settings: DEFAULT_DICTATION, ctx, form })).rejects.toMatchObject({ kind });
  });

  it("Netzfehler, fehlender Schlüssel und leere Erkennung", async () => {
    const net = fakeFetch([() => new TypeError("Network request failed")]);
    await expect(runDictation({ fetch: net.fetch, key: "k", settings: DEFAULT_DICTATION, ctx, form })).rejects.toMatchObject({ kind: "network" });
    const none = fakeFetch([]);
    await expect(runDictation({ fetch: none.fetch, key: "  ", settings: DEFAULT_DICTATION, ctx, form })).rejects.toMatchObject({ kind: "nokey" });
    expect(none.calls).toHaveLength(0);
    const empty = fakeFetch([() => ({ status: 200, json: { text: "  " } })]);
    await expect(runDictation({ fetch: empty.fetch, key: "k", settings: DEFAULT_DICTATION, ctx, form })).rejects.toBeInstanceOf(DictationError);
  });

  it("Zeitüberschreitung bricht die Anfrage ab", async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    await expect(runDictation({ fetch, key: "k", settings: DEFAULT_DICTATION, ctx, form, timeoutMs: 10 })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("Ausgabetext aus mehreren Teilen, ohne Reasoning", () => {
    expect(
      extractOutputText({
        output: [
          { type: "reasoning" },
          { type: "message", content: [{ type: "output_text", text: "A " }, { type: "refusal", refusal: "x" }, { type: "output_text", text: "B" }] },
        ],
      }),
    ).toBe("A B");
    expect(() => extractOutputText({})).toThrow(DictationError);
  });

  it("Kontext in der Bereinigung", () => {
    expect(cleanupRequest("x", DEFAULT_DICTATION, ctx).instructions).toContain("Projekt: Markdoist");
    expect(cleanupRequest("x", DEFAULT_DICTATION, {}).instructions).not.toContain("Kontext");
    expect(transcriptionFields(DEFAULT_DICTATION, {})).toHaveLength(3);
  });

  it("anhängen an die Notiz", () => {
    expect(appendDictation("", "Neu.")).toBe("Neu.\n");
    expect(appendDictation("Alt.", "Neu.")).toBe("Alt.\n\nNeu.\n");
    expect(appendDictation("Alt.\n\n\n", " Neu. ")).toBe("Alt.\n\nNeu.\n");
    expect(appendDictation("- [ ] a\n", "Neu.")).toBe("- [ ] a\n\nNeu.\n");
    expect(appendDictation("Alt.", "  ")).toBe("Alt.");
  });

  it("Einstellungen, Maske, Dauer, Texte", () => {
    expect(parseDictationSettings(null)).toEqual(DEFAULT_DICTATION);
    expect(parseDictationSettings({ transcribeModel: " x ", cleanupModel: "", cleanup: false })).toEqual({
      transcribeModel: "x",
      cleanupModel: "gpt-6.1-terra",
      cleanup: false,
    });
    expect(maskKey("sk-proj-abcdefghijklmnop1234")).toBe("sk-…1234");
    expect(maskKey("kurz")).toBe("…rz");
    expect(formatDuration(65_400)).toBe("1:05");
    expect(T.dictation.errors.auth).toBe("API-Schlüssel ungültig");
  });

  it("Schlüssel prüfen", async () => {
    const ok = fakeFetch([() => ({ status: 200, json: { data: [] } })]);
    expect(await checkKey(ok.fetch, "k")).toEqual({ ok: true });
    expect(ok.calls[0]).toMatchObject({ url: "https://api.openai.com/v1/models", method: "GET" });
    const bad = fakeFetch([() => ({ status: 401 })]);
    expect(await checkKey(bad.fetch, "k")).toEqual({ ok: false, kind: "auth" });
  });
});
