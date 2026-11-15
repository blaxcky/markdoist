import { describe, expect, it } from "vitest";
import {
  checkApiKey,
  DEFAULT_DICTATION,
  DictationError,
  geminiMime,
  parseDictationSettings,
  runDictation,
  transcribeTarget,
  transcriptionFields,
  type FetchLike,
  type UploadLike,
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

const ctx = { list: "Markdoist", title: "Diktieren einbauen" };
const groq = { ...DEFAULT_DICTATION, transcribeProvider: "groq" as const, cleanup: false };
const gemini = { ...DEFAULT_DICTATION, transcribeProvider: "gemini" as const, cleanup: false };
const audio = { mime: "audio/mp4", base64: async () => "QUJD" };
const geminiReply = (text: string) => ({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] });

describe("Erkennung bei Groq und Gemini (4.12)", () => {
  it("Groq: Whisper-Feld language, eigenes Modell, Groq-URL", async () => {
    expect(transcriptionFields(groq, ctx)).toEqual([
      ["model", "whisper-large-v3-turbo"],
      ["language", "de"],
      ["prompt", "Diktierte Notiz zu einer Programmieraufgabe. Projekt: Markdoist. Eintrag: Diktieren einbauen."],
    ]);
    const seen: { url: string; headers: Record<string, string>; fields: [string, string][] }[] = [];
    const upload: UploadLike = async (url, init) => {
      seen.push({ url, headers: init.headers, fields: init.fields });
      return { ok: true, status: 200, json: async () => ({ text: " Hallo Groq " }) };
    };
    const { fetch } = fakeFetch([]);
    const r = await runDictation({ fetch, upload, key: "gsk_test", settings: groq, ctx });
    expect(r).toEqual({ text: "Hallo Groq", raw: "Hallo Groq", cleaned: false });
    expect(seen[0]!.url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(seen[0]!.headers.Authorization).toBe("Bearer gsk_test");
  });

  it("Gemini: Aufnahme im JSON, Sprache und Vokabular, Schlüssel als x-goog-api-key", async () => {
    const { fetch, calls } = fakeFetch([() => ({ status: 200, json: geminiReply(" Der Knopf soll rot sein ") })]);
    const r = await runDictation({ fetch, key: " AIza-test ", settings: gemini, ctx, audio });
    expect(r.text).toBe("Der Knopf soll rot sein");
    const c = calls[0]!;
    expect(c.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent");
    expect(c.headers["x-goog-api-key"]).toBe("AIza-test");
    expect(c.headers.Authorization).toBeUndefined();
    expect(JSON.parse(String(c.body))).toEqual({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/m4a", data: "QUJD" } }] }],
      generationConfig: { audioTranscriptionConfig: { languageCodes: ["de-DE"], customVocabulary: ["Markdoist", "Diktieren einbauen"] } },
    });
  });

  it("Gemini: eigenes Modell und Basis-URL, WebM bleibt WebM", async () => {
    const { fetch, calls } = fakeFetch([() => ({ status: 200, json: geminiReply("ok") })]);
    await runDictation({ fetch, key: "k", settings: { ...gemini, geminiModel: "models/gemini-x" }, ctx: {}, audio: { mime: "audio/webm;codecs=opus", base64: async () => "" }, baseUrl: "http://127.0.0.1:9/v1beta" });
    expect(calls[0]!.url).toBe("http://127.0.0.1:9/v1beta/models/gemini-x:generateContent");
    const body = JSON.parse(String(calls[0]!.body)) as { contents: { parts: { inlineData: { mimeType: string } }[] }[]; generationConfig: { audioTranscriptionConfig: Record<string, unknown> } };
    expect(body.contents[0]!.parts[0]!.inlineData.mimeType).toBe("audio/webm");
    expect(body.generationConfig.audioTranscriptionConfig.customVocabulary).toBeUndefined();
    expect(geminiMime("audio/x-m4a")).toBe("audio/m4a");
  });

  it("Gemini: leer, gesperrt, ungültiger Schlüssel (400), fehlender Schlüssel", async () => {
    const empty = fakeFetch([() => ({ status: 200, json: { candidates: [{ content: { parts: [] } }] } })]);
    await expect(runDictation({ fetch: empty.fetch, key: "k", settings: gemini, ctx, audio })).rejects.toMatchObject({ kind: "empty" });
    const blocked = fakeFetch([() => ({ status: 200, json: { promptFeedback: { blockReason: "OTHER" } } })]);
    await expect(runDictation({ fetch: blocked.fetch, key: "k", settings: gemini, ctx, audio })).rejects.toMatchObject({ kind: "server", message: "Abgelehnt: OTHER" });
    const bad = fakeFetch([() => ({ status: 400, json: { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } } })]);
    await expect(runDictation({ fetch: bad.fetch, key: "k", settings: gemini, ctx, audio })).rejects.toMatchObject({ kind: "auth", status: 400 });
    const err = await runDictation({ fetch: bad.fetch, key: " ", settings: gemini, ctx, audio }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DictationError);
    expect(err).toMatchObject({ kind: "nokey", provider: "gemini" });
  });

  it("Schlüssel prüfen je Anbieter", async () => {
    const { fetch, calls } = fakeFetch([() => ({ status: 200, json: { data: [] } }), () => ({ status: 200, json: { models: [] } }), () => ({ status: 401, json: {} })]);
    expect(await checkApiKey("groq", { fetch, key: "gsk" })).toEqual({ ok: true });
    expect(await checkApiKey("gemini", { fetch, key: "AIza" })).toEqual({ ok: true });
    expect(await checkApiKey("openai", { fetch, key: "sk" })).toEqual({ ok: false, kind: "auth" });
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.groq.com/openai/v1/models",
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      "https://api.openai.com/v1/models",
    ]);
    expect(calls[1]!.headers["x-goog-api-key"]).toBe("AIza");
    expect(await checkApiKey("gemini", { fetch, key: "" })).toEqual({ ok: false, kind: "nokey" });
  });

  it("Einstellungen: alte ergeben OpenAI, Modelle je Anbieter", () => {
    expect(transcribeTarget(parseDictationSettings({ transcribeModel: "x" }))).toEqual({ provider: "openai", model: "x" });
    expect(transcribeTarget(parseDictationSettings({ transcribeProvider: "groq" }))).toEqual({ provider: "groq", model: "whisper-large-v3-turbo" });
    expect(transcribeTarget(parseDictationSettings({ transcribeProvider: "gemini", geminiModel: " g " }))).toEqual({ provider: "gemini", model: "g" });
    expect(parseDictationSettings({ transcribeProvider: "mistral" }).transcribeProvider).toBe("openai");
  });

  it("Auf dem Gerät: ohne Schlüssel und Netz, ohne Erkenner nomodel", async () => {
    const local = { ...DEFAULT_DICTATION, transcribeProvider: "local" as const, cleanup: false };
    const { fetch, calls } = fakeFetch([]);
    const r = await runDictation({ fetch, key: "", settings: local, ctx, localTranscribe: async () => " Hallo lokal " });
    expect(r).toEqual({ text: "Hallo lokal", raw: "Hallo lokal", cleaned: false });
    expect(calls).toHaveLength(0);
    await expect(runDictation({ fetch, key: "", settings: local, ctx })).rejects.toMatchObject({ kind: "nomodel" });
    await expect(runDictation({ fetch, key: "", settings: local, ctx, localTranscribe: async () => "  " })).rejects.toMatchObject({ kind: "empty" });
    await expect(runDictation({ fetch, key: "", settings: local, ctx, localTranscribe: async () => Promise.reject(new Error("onnx kaputt")) })).rejects.toMatchObject({ kind: "server", message: "onnx kaputt" });
    expect(transcribeTarget(parseDictationSettings({ transcribeProvider: "local" }))).toEqual({ provider: "local", model: "parakeet-tdt-0.6b-v3-int8" });
  });
});
