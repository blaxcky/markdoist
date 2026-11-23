import { describe, expect, it } from "vitest";
import {
  checkClaudeKey,
  checklistErrorText,
  checklistFromText,
  CLEANUP_INSTRUCTIONS,
  DEFAULT_DICTATION,
  DictationError,
  parseDictationSettings,
  runDictation,
  suggestTitle,
  textModels,
  titleErrorText,
  type FetchLike,
} from "../src";

type ClaudeCall = { url: string; method: string; headers: Headers; body: Record<string, unknown> | null };

/** Ersatz für das globale fetch, das das Claude-SDK benutzt. */
function claudeFetch(answers: ((call: ClaudeCall) => Response | Error)[]) {
  const calls: ClaudeCall[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const call = { url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers), body };
    calls.push(call);
    const r = answers[calls.length - 1]!(call);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const reply = (text: string, stop_reason = "end_turn") =>
  json(200, {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  });

const apiError = (status: number, message: string) => json(status, { type: "error", error: { type: "error", message } });

/** OpenAI-Erkennung als FetchLike; nur der erste Aufruf ist erlaubt. */
function transcription(text: string): FetchLike {
  let n = 0;
  return async () => {
    if (n++ > 0) throw new Error("OpenAI darf nur einmal gerufen werden");
    return { ok: true, status: 200, json: async () => ({ text }) };
  };
}

const ctx = { list: "Markdoist", title: "Diktieren einbauen" };
const form = (fields: [string, string][]) => ({ fields });
const claudeSettings = { ...DEFAULT_DICTATION, textProvider: "anthropic" as const };

describe("Claude als Text-Anbieter (4.12)", () => {
  it("Bereinigung über Claude: Modell, System, Aufwand, Schlüssel", async () => {
    const { fetch, calls } = claudeFetch([() => reply('{"bereinigter_text": "Der Knopf soll rot sein."}')]);
    const r = await runDictation({
      fetch: transcription(" äh der Knopf soll rot sein "),
      key: "sk-openai",
      settings: claudeSettings,
      ctx,
      form,
      text: { provider: "anthropic", key: " sk-ant-test ", claudeFetch: fetch },
    });
    expect(r).toEqual({ text: "Der Knopf soll rot sein.", raw: "äh der Knopf soll rot sein", cleaned: true });
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe("https://api.anthropic.com/v1/messages");
    expect(c.method).toBe("POST");
    expect(c.headers.get("authorization")).toBe("Bearer sk-ant-test");
    expect(c.body).toMatchObject({
      model: "claude-haiku-5-5",
      messages: [{ role: "user", content: "<diktat>\näh der Knopf soll rot sein\n</diktat>" }],
      output_config: { effort: "low", format: { type: "json_schema", schema: { required: ["bereinigter_text"], additionalProperties: false } } },
    });
    expect(c.body!.thinking).toBeUndefined();
    expect(String(c.body!.system)).toContain(CLEANUP_INSTRUCTIONS);
    expect(String(c.body!.system)).toContain("Projekt: Markdoist");
  });

  it("eigenes Claude-Modell aus den Einstellungen", async () => {
    const { fetch, calls } = claudeFetch([() => reply("ok")]);
    await runDictation({
      fetch: transcription("roh"),
      key: "sk-openai",
      settings: { ...claudeSettings, claudeCleanupModel: "claude-sonnet-5-5" },
      ctx,
      form,
      text: { provider: "anthropic", key: "k", claudeFetch: fetch, baseUrl: "http://127.0.0.1:9/fake" },
    });
    expect(calls[0]!.url).toBe("http://127.0.0.1:9/fake/v1/messages");
    expect(calls[0]!.body!.model).toBe("claude-sonnet-5-5");
  });

  it("Ablehnung, abgeschnittene Antwort und fehlender Schlüssel ergeben den Rohtext", async () => {
    for (const answer of [() => reply("", "refusal"), () => reply("halb", "max_tokens")]) {
      const { fetch } = claudeFetch([answer]);
      const r = await runDictation({ fetch: transcription("roh"), key: "sk", settings: claudeSettings, ctx, form, text: { provider: "anthropic", key: "k", claudeFetch: fetch } });
      expect(r).toEqual({ text: "roh", raw: "roh", cleaned: false, cleanupError: "server" });
    }
    const { fetch, calls } = claudeFetch([]);
    const r = await runDictation({ fetch: transcription("roh"), key: "sk", settings: claudeSettings, ctx, form, text: { provider: "anthropic", key: " ", claudeFetch: fetch } });
    expect(r.cleanupError).toBe("nokey");
    expect(calls).toHaveLength(0);
  });

  it("HTTP 400: einmal die einfache Anfrage ohne output_config", async () => {
    const { fetch, calls } = claudeFetch([() => apiError(400, "effort: Extra inputs are not permitted"), () => reply("Sauber.")]);
    const r = await runDictation({ fetch: transcription("äh sauber"), key: "sk", settings: claudeSettings, ctx, form, text: { provider: "anthropic", key: "k", claudeFetch: fetch } });
    expect(r.text).toBe("Sauber.");
    expect(calls[0]!.body!.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(calls[1]!.body!.output_config).toBeUndefined();
    expect(calls[1]!.body!.messages).toEqual([{ role: "user", content: "<diktat>\näh sauber\n</diktat>" }]);
  });

  it("Antwortet Claude auf das Diktat statt es zu bereinigen, kommt der Rohtext (Fehlfall 23.11.2026)", async () => {
    const raw =
      "äh ich würde die Diktierfunktion gern aufteilen also beim Titel ein eigener Mikrofonknopf und da nur roh transkribieren ohne Bereinigung " +
      "und in der Beschreibung ein Knopf in der Toolbar der an der Cursorposition einfügt und da vielleicht auch die Bereinigung aber beim Titel auf keinen Fall";
    const answer =
      "Das ist gut machbar. Ich würde die Diktierfunktion so aufteilen:\n\n**1. Titel-Diktat bei der Aufgabenerstellung**\n- Neben dem Titelfeld ein eigener Mikrofon-Button.\n" +
      "- Modus „Roh“: Das Ergebnis wird nur transkribiert.\n\n**Technische Umsetzung**\n- Verarbeitungsmodus als Parameter, z. B. `mode: \"raw\" | \"notes\"`.\n\n" +
      "Soll ich dir eine konkrete Komponente für Titel- und Beschreibungsfeld skizzieren, z. B. in React oder Vue?";
    const { fetch } = claudeFetch([() => reply(JSON.stringify({ bereinigter_text: answer }))]);
    const r = await runDictation({ fetch: transcription(raw), key: "sk", settings: claudeSettings, ctx, form, text: { provider: "anthropic", key: "k", claudeFetch: fetch } });
    expect(r).toEqual({ text: raw, raw, cleaned: false, cleanupError: "server" });
  });

  it("Titel über Claude mit JSON-Schema", async () => {
    const { fetch, calls } = claudeFetch([() => reply('{"title": "Diktat bricht nach 10 Minuten ab.", "type": "bug"}')]);
    const s = await suggestTitle({ provider: "anthropic", claudeFetch: fetch, fetch: transcription(""), key: "k", model: "claude-haiku-5-5", note: "Nach zehn Minuten hört die Aufnahme auf", list: "Markdoist" });
    expect(s).toEqual({ title: "Diktat bricht nach 10 Minuten ab", devType: "bug" });
    const body = calls[0]!.body!;
    expect(body.max_tokens).toBe(1000);
    expect(body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema", schema: { required: ["title", "type"], additionalProperties: false } } });
    expect(String(body.system)).toContain("App bzw. Liste: Markdoist");
  });

  it("Titel: bei HTTP 400 die einfache Anfrage mit JSON-Anweisung", async () => {
    const { fetch, calls } = claudeFetch([() => apiError(400, "output_config.format not supported"), () => reply('```json\n{"title": "Neuer Knopf", "type": "feature"}\n```')]);
    const s = await suggestTitle({ provider: "anthropic", claudeFetch: fetch, fetch: transcription(""), key: "k", model: "m", note: "Knopf", list: "" });
    expect(s).toEqual({ title: "Neuer Knopf", devType: "feature" });
    expect(calls[1]!.body!.output_config).toBeUndefined();
    expect(String(calls[1]!.body!.system)).toContain("ausschließlich mit einem JSON-Objekt");
  });

  it("Checkliste über Claude", async () => {
    const { fetch, calls } = claudeFetch([() => reply('{"items": ["2 Milch", "- [ ] Brot", "", "Eier"]}')]);
    const items = await checklistFromText({ provider: "anthropic", claudeFetch: fetch, fetch: transcription(""), key: "k", model: "claude-haiku-5-5", text: "2 Milch, Brot und Eier", list: "Einkauf" });
    expect(items).toEqual(["2 Milch", "Brot", "Eier"]);
    expect(calls[0]!.body!.output_config).toMatchObject({ format: { schema: { required: ["items"] } } });
  });

  it("Fehler: 401, 429, Netz, fehlender Schlüssel mit Claude im Text", async () => {
    const cases: [() => Response | Error, string][] = [
      [() => apiError(401, "invalid x-api-key"), "auth"],
      [() => apiError(429, "rate limited"), "quota"],
      [() => apiError(529, "overloaded"), "server"],
      [() => new TypeError("fetch failed"), "network"],
    ];
    for (const [answer, kind] of cases) {
      const { fetch } = claudeFetch([answer]);
      const err = await suggestTitle({ provider: "anthropic", claudeFetch: fetch, fetch: transcription(""), key: "k", model: "m", note: "n", list: "" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DictationError);
      expect((err as DictationError).kind).toBe(kind);
      expect((err as DictationError).provider).toBe("anthropic");
    }
    const { fetch } = claudeFetch([() => apiError(401, "invalid x-api-key")]);
    const err401 = await suggestTitle({ provider: "anthropic", claudeFetch: fetch, fetch: transcription(""), key: "k", model: "m", note: "n", list: "" }).catch((e: unknown) => e);
    expect((err401 as DictationError).message).toBe("HTTP 401: invalid x-api-key");

    const nokey = await suggestTitle({ provider: "anthropic", fetch: transcription(""), key: "", model: "m", note: "n", list: "" }).catch((e: unknown) => e);
    expect(titleErrorText(nokey)).toBe("Für Titelvorschläge einen Claude-API-Schlüssel in den Einstellungen hinterlegen");
    const nokeyList = await checklistFromText({ provider: "anthropic", fetch: transcription(""), key: "", model: "m", text: "t", list: "" }).catch((e: unknown) => e);
    expect(checklistErrorText(nokeyList)).toBe("Für „Checkliste einfügen“ einen Claude-API-Schlüssel in den Einstellungen hinterlegen");
    // OpenAI bleibt beim bisherigen Text.
    expect(titleErrorText(new DictationError("nokey"))).toBe("Für Titelvorschläge einen OpenAI-API-Schlüssel in den Einstellungen hinterlegen");
  });

  it("Schlüssel prüfen über /v1/models", async () => {
    const { fetch, calls } = claudeFetch([() => json(200, { data: [], has_more: false, first_id: null, last_id: null }), () => apiError(401, "invalid")]);
    expect(await checkClaudeKey({ key: "k", fetch })).toEqual({ ok: true });
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/models?limit=1");
    expect(await checkClaudeKey({ key: "k", fetch })).toEqual({ ok: false, kind: "auth" });
    expect(await checkClaudeKey({ key: " ", fetch })).toEqual({ ok: false, kind: "nokey" });
  });

  it("Einstellungen: alte ergeben OpenAI, Claude mit eigenen Modellen", () => {
    expect(textModels(parseDictationSettings({ cleanupModel: "a", titleModel: "b" }))).toEqual({ provider: "openai", cleanup: "a", title: "b" });
    expect(textModels(parseDictationSettings({ textProvider: "anthropic" }))).toEqual({ provider: "anthropic", cleanup: "claude-haiku-5-5", title: "claude-haiku-5-5" });
    expect(parseDictationSettings({ textProvider: "gemini" }).textProvider).toBe("openai");
  });
});
