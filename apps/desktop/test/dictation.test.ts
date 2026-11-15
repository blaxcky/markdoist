import { describe, expect, it } from "vitest";
import type { FetchLike } from "@markdoist/app";
import { DictationService, type SecretBox, type StoredDictation } from "../src/main/dictation";

// Ersatz für safeStorage: „verschlüsselt“ durch Umdrehen, damit Klartext nie in der Ablage steht.
function box(available = true, backend = "gnome_libsecret"): SecretBox {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from([...s].reverse().join(""), "utf8"),
    decryptString: (b) => [...b.toString("utf8")].reverse().join(""),
    getSelectedStorageBackend: () => backend,
  };
}

function setup(b = box(), fetch: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({}) }), claudeFetch?: typeof globalThis.fetch) {
  let stored: StoredDictation | undefined;
  const svc = new DictationService(
    b,
    () => stored,
    async (d) => {
      stored = d;
    },
    fetch,
    { openai: "http://127.0.0.1:1/v1" },
    claudeFetch,
  );
  return { svc, stored: () => stored };
}

const KEY = "sk-proj-geheim-1234567890-abcd";

describe("Diktieren am Desktop (4.9)", () => {
  it("speichert den Schlüssel verschlüsselt und zeigt nur die Maske", async () => {
    const { svc, stored } = setup();
    expect(svc.status()).toMatchObject({ hasKey: false, masked: null, insecure: false });
    const st = await svc.setKey(`  ${KEY} `);
    expect(st).toMatchObject({ hasKey: true, masked: "sk-…abcd", insecure: false });
    expect(JSON.stringify(st)).not.toContain("geheim");
    expect(JSON.stringify(stored())).not.toContain("geheim");
    expect(Buffer.from(stored()!.keyEnc!, "base64").toString()).not.toContain("geheim");
    expect(svc.key()).toBe(KEY);
  });

  it("ohne Schlüsselbund: Klartext mit Hinweis", async () => {
    const { svc, stored } = setup(box(false));
    const st = await svc.setKey(KEY);
    expect(st.insecure).toBe(true);
    expect(stored()!.keyPlain).toBe(true);
    expect(svc.key()).toBe(KEY);
    expect(setup(box(true, "basic_text")).svc.status().insecure).toBe(true);
  });

  it("Entfernen behält die Modelle", async () => {
    const { svc, stored } = setup();
    await svc.setKey(KEY);
    await svc.setSettings({ transcribeModel: "x-transcribe", cleanup: false });
    const st = await svc.clearKey();
    expect(st.hasKey).toBe(false);
    expect(stored()).toEqual({
      transcribeModel: "x-transcribe",
      cleanupModel: "gpt-6.1-terra",
      cleanup: false,
      titleModel: "gpt-6-luna",
      autoTitle: true,
      textProvider: "openai",
      claudeCleanupModel: "claude-haiku-5-5",
      claudeTitleModel: "claude-haiku-5-5",
    });
    expect(svc.settings().transcribeModel).toBe("x-transcribe");
  });

  it("nicht entschlüsselbarer Schlüssel gilt als fehlend", async () => {
    const b = box();
    const { svc } = setup({ ...b, decryptString: () => { throw new Error("kaputt"); } });
    await svc.setKey(KEY);
    expect(svc.status().hasKey).toBe(false);
  });

  it("run schickt Audio mit Dateiname und Typ und liefert das Ergebnis", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, body: init.body });
      const json = url.endsWith("/audio/transcriptions") ? { text: "äh hallo" } : { output: [{ type: "message", content: [{ type: "output_text", text: "Hallo." }] }] };
      return { ok: true, status: 200, json: async () => json };
    };
    const { svc } = setup(box(), fetch);
    await svc.setKey(KEY);
    const phases: string[] = [];
    const r = await svc.run(new Uint8Array([1, 2, 3]).buffer, "audio/webm;codecs=opus", { list: "Markdoist", title: "T" }, (p) => phases.push(p));
    expect(r).toEqual({ ok: true, result: { text: "Hallo.", raw: "äh hallo", cleaned: true } });
    expect(phases).toEqual(["transcribing", "cleaning"]);
    expect(calls[0]!.url).toBe("http://127.0.0.1:1/v1/audio/transcriptions");
    const form = calls[0]!.body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe("diktat.webm");
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(3);
    expect(form.get("model")).toBe("gpt-transcribe");
  });

  it("run ohne Schlüssel und bei 401", async () => {
    const { svc } = setup(box(), async () => ({ ok: false, status: 401, json: async () => ({}) }));
    expect(await svc.run(new ArrayBuffer(1), "audio/webm", {})).toEqual({ ok: false, kind: "nokey" });
    await svc.setKey(KEY);
    expect(await svc.run(new ArrayBuffer(1), "kein/typ\nx", {})).toEqual({ ok: false, kind: "auth" });
    expect(await svc.check()).toEqual({ ok: false, kind: "auth" });
  });
});

describe("Checkliste einfügen am Desktop (4.11)", () => {
  it("nutzt Schlüssel und Titelmodell und liefert die Einträge", async () => {
    const calls: { url: string; body: Record<string, unknown>; auth: string | undefined }[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown>, auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: '{"items": ["2 Milch", "Eier"]}' }] }] }) };
    };
    const { svc } = setup(box(), fetch);
    await svc.setKey(KEY);
    await svc.setSettings({ titleModel: "listen-modell" });
    expect(await svc.checklist("2 Milch und Eier bitte", "Einkauf")).toEqual({ ok: true, items: ["2 Milch", "Eier"] });
    expect(calls[0]!.url).toBe("http://127.0.0.1:1/v1/responses");
    expect(calls[0]!.auth).toBe(`Bearer ${KEY}`);
    expect(calls[0]!.body.model).toBe("listen-modell");
    expect(String(calls[0]!.body.instructions)).toContain("Liste: Einkauf");
  });

  it("ohne Schlüssel nokey, Fehler von OpenAI mit Status", async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Incorrect API key" } }) });
    const { svc } = setup(box(), fetch);
    expect(await svc.checklist("Milch", "")).toEqual({ ok: false, kind: "nokey", detail: "nokey", provider: "openai" });
    await svc.setKey(KEY);
    expect(await svc.checklist("Milch", "")).toEqual({ ok: false, kind: "auth", detail: "HTTP 401: Incorrect API key", status: 401 });
  });
});

describe("Anbieter am Desktop (4.12)", () => {
  const ANT = "sk-ant-api03-geheim-9876";
  const claudeReply = (text: string) =>
    new Response(
      JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("Schlüssel je Anbieter getrennt, verschlüsselt und maskiert", async () => {
    const { svc, stored } = setup();
    await svc.setKey(KEY);
    const st = await svc.setKey(ANT, "anthropic");
    expect(st.keys).toEqual({ openai: { hasKey: true, masked: "sk-…abcd" }, anthropic: { hasKey: true, masked: "sk-…9876" } });
    expect(JSON.stringify(stored())).not.toContain("geheim");
    expect(svc.key("anthropic")).toBe(ANT);
    const after = await svc.clearKey("anthropic");
    expect(after.keys.anthropic.hasKey).toBe(false);
    expect(after.hasKey).toBe(true);
    expect(stored()!.keys).toBeUndefined();
    // Unbekannter Anbieter aus dem Renderer gilt als OpenAI.
    expect((await svc.clearKey("x" as never)).hasKey).toBe(false);
  });

  it("Titel und Checkliste über Claude mit dem Claude-Schlüssel", async () => {
    const calls: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
    const claudeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return calls.length === 1 ? claudeReply('{"title": "Knopf rot", "type": "feature"}') : claudeReply('{"items": ["Milch"]}');
    }) as typeof globalThis.fetch;
    const openai: FetchLike = async () => {
      throw new Error("OpenAI darf nicht gerufen werden");
    };
    const { svc } = setup(box(), openai, claudeFetch);
    await svc.setKey(ANT, "anthropic");
    await svc.setSettings({ textProvider: "anthropic", claudeTitleModel: "claude-sonnet-5-5" });
    expect(await svc.suggestTitle("Der Knopf soll rot sein", "Markdoist")).toEqual({ ok: true, suggestion: { title: "Knopf rot", devType: "feature" } });
    expect(await svc.checklist("Milch bitte", "Einkauf")).toEqual({ ok: true, items: ["Milch"] });
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]!.auth).toBe(`Bearer ${ANT}`);
    expect(calls[0]!.body.model).toBe("claude-sonnet-5-5");
    expect(calls[1]!.body.model).toBe("claude-sonnet-5-5");
  });

  it("ohne Claude-Schlüssel nokey mit Anbieter", async () => {
    const { svc } = setup();
    await svc.setKey(KEY);
    await svc.setSettings({ textProvider: "anthropic" });
    expect(await svc.suggestTitle("n", "", true)).toEqual({ ok: false, kind: "nokey", detail: "nokey", provider: "anthropic" });
  });
});
