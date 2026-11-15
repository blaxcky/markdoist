import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LOCAL_PCM_MIME, type FetchLike, type LocalModelInfo, type LocalModelState } from "@markdoist/app";
import { DictationService, type SecretBox, type StoredDictation } from "../src/main/dictation";
import { LocalModelStore, type SttEngine } from "../src/main/localStt";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const files = { "a.onnx": "A".repeat(5000), "tokens.txt": "x 0\ny 1\n" };
const model: LocalModelInfo = {
  id: "test-model",
  baseUrl: "http://modell.test/rev",
  files: Object.entries(files).map(([name, text]) => ({ name, size: text.length, sha256: sha(text) })),
};

/** fetch, das die Dateien in Stücken streamt; `override` ersetzt einzelne Inhalte. */
function serve(override: Record<string, string> = {}, seen: string[] = []): typeof globalThis.fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push(url);
    const name = url.split("/").pop()!;
    const text = override[name] ?? (files as Record<string, string>)[name];
    if (text === undefined) return new Response("nicht da", { status: 404 });
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 1000) {
          if (init?.signal?.aborted) return c.error(new DOMException("abgebrochen", "AbortError"));
          c.enqueue(bytes.slice(i, i + 1000));
        }
        c.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof globalThis.fetch;
}

const dirs: string[] = [];
async function tmp() {
  const d = await mkdtemp(join(tmpdir(), "markdoist-model-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("Lokales Modell am Desktop (4.12)", () => {
  it("lädt alle Dateien, prüft sie und ist danach bereit", async () => {
    const root = await tmp();
    const seen: string[] = [];
    const store = new LocalModelStore(root, serve({}, seen), model);
    expect(await store.state()).toEqual({ state: "missing" });
    const progress: LocalModelState[] = [];
    expect(await store.download((s) => progress.push(s))).toEqual({ state: "ready" });
    expect(seen).toEqual(["http://modell.test/rev/a.onnx", "http://modell.test/rev/tokens.txt"]);
    expect(await readFile(join(store.dir(), "tokens.txt"), "utf8")).toBe(files["tokens.txt"]);
    expect((await readdir(store.dir())).sort()).toEqual(["a.onnx", "tokens.txt"]);
    expect(progress.at(-1)).toEqual({ state: "ready" });
    expect(progress.some((p) => p.state === "downloading" && p.total === 5000 + files["tokens.txt"].length)).toBe(true);
    // Ein zweiter Download lädt nichts mehr.
    seen.length = 0;
    await store.download();
    expect(seen).toEqual([]);
  });

  it("falsche Prüfsumme: Fehler, keine Datei bleibt liegen", async () => {
    const store = new LocalModelStore(await tmp(), serve({ "tokens.txt": "x 0\nz 1\n" }), model);
    const s = await store.download();
    expect(s).toEqual({ state: "error", message: "Prüfsumme von tokens.txt stimmt nicht" });
    expect((await readdir(store.dir())).sort()).toEqual(["a.onnx"]);
    // Nächster Versuch mit richtigem Inhalt holt nur die fehlende Datei.
    const seen: string[] = [];
    const again = new LocalModelStore(store.dir().replace(/\/test-model$/, ""), serve({}, seen), model);
    expect(await again.download()).toEqual({ state: "ready" });
    expect(seen).toEqual(["http://modell.test/rev/tokens.txt"]);
  });

  it("HTTP-Fehler, Abbrechen und Löschen", async () => {
    const root = await tmp();
    const broken = new LocalModelStore(root, (async () => new Response("", { status: 503 })) as unknown as typeof globalThis.fetch, model);
    expect(await broken.download()).toEqual({ state: "error", message: "HTTP 503 bei a.onnx" });

    let release: () => void = () => undefined;
    const slow = (async (_u: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((r) => (release = r));
      if (init?.signal?.aborted) throw new DOMException("abgebrochen", "AbortError");
      return new Response("A");
    }) as typeof globalThis.fetch;
    const store = new LocalModelStore(root, slow, model);
    const running = store.download();
    await new Promise((r) => setTimeout(r, 10));
    expect((await store.state()).state).toBe("downloading");
    store.cancel();
    release();
    // Abbruch ist kein Fehler.
    expect(await running).toEqual({ state: "missing" });

    const ok = new LocalModelStore(root, serve(), model);
    await ok.download();
    expect(await ok.remove()).toEqual({ state: "missing" });
  });
});

function box(): SecretBox {
  return { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() };
}

describe("Diktieren auf dem Gerät am Desktop (4.12)", () => {
  async function setup(ready: boolean) {
    const root = await tmp();
    const store = new LocalModelStore(root, serve(), model);
    if (ready) await store.download();
    const got: { dir: string; samples: Float32Array }[] = [];
    const engine: SttEngine = {
      transcribe: async (dir, samples) => {
        got.push({ dir, samples });
        return " Hallo vom Gerät ";
      },
    };
    const noNet: FetchLike = async () => {
      throw new Error("kein Netz erlaubt");
    };
    let stored: StoredDictation | undefined = { transcribeProvider: "local", cleanup: false };
    const svc = new DictationService(box(), () => stored, async (d) => void (stored = d), noNet, {}, undefined, { store, engine });
    return { svc, got, store };
  }

  it("erkennt PCM ohne Schlüssel und ohne Netz", async () => {
    const { svc, got, store } = await setup(true);
    const pcm = new Float32Array([0.5, -0.25, 0, 1]);
    const r = await svc.run(pcm.buffer, LOCAL_PCM_MIME, {});
    expect(r).toEqual({ ok: true, result: { text: "Hallo vom Gerät", raw: "Hallo vom Gerät", cleaned: false } });
    expect(got[0]!.dir).toBe(store.dir());
    expect([...got[0]!.samples]).toEqual([0.5, -0.25, 0, 1]);
  });

  it("ohne Modell oder mit falschem Format nomodel", async () => {
    const missing = await setup(false);
    expect(await missing.svc.run(new Float32Array(4).buffer, LOCAL_PCM_MIME, {})).toEqual({ ok: false, kind: "nomodel" });
    const ready = await setup(true);
    expect(await ready.svc.run(new Uint8Array([1, 2]).buffer, "audio/webm", {})).toEqual({ ok: false, kind: "nomodel" });
    expect(ready.got).toEqual([]);
  });
});
