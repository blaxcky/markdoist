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

function setup(b = box(), fetch: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({}) })) {
  let stored: StoredDictation | undefined;
  const svc = new DictationService(
    b,
    () => stored,
    async (d) => {
      stored = d;
    },
    fetch,
    "http://127.0.0.1:1/v1",
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
    expect(stored()).toEqual({ transcribeModel: "x-transcribe", cleanupModel: "gpt-6.1-terra", cleanup: false, titleModel: "gpt-6-luna", autoTitle: true });
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
