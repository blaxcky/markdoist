// Lokale Erkennung am Desktop (4.12): Modell herunterladen und prüfen, Erkennung mit sherpa-onnx im
// Main-Prozess. `decodeAsync` rechnet in einem Thread des Add-ons, die Oberfläche bleibt bedienbar.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { LOCAL_MODEL, LOCAL_SAMPLE_RATE, modelBytes, sherpaConfig, type LocalModelInfo, type LocalModelState } from "@markdoist/app";

/** Teil der Erkennung, den der Dienst braucht (für Tests ersetzbar). */
export interface SttEngine {
  transcribe(dir: string, samples: Float32Array): Promise<string>;
}

type Progress = (s: LocalModelState) => void;

export class LocalModelStore {
  private ctrl: AbortController | null = null;
  private progress: { received: number; total: number } | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly root: string,
    private readonly fetchFn: typeof globalThis.fetch = globalThis.fetch,
    readonly model: LocalModelInfo = LOCAL_MODEL,
  ) {}

  dir(): string {
    return join(this.root, this.model.id);
  }

  private async complete(): Promise<boolean> {
    for (const f of this.model.files) {
      try {
        if ((await stat(join(this.dir(), f.name))).size !== f.size) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  async state(): Promise<LocalModelState> {
    if (this.progress) return { state: "downloading", ...this.progress };
    if (await this.complete()) return { state: "ready" };
    if (this.lastError) return { state: "error", message: this.lastError };
    return { state: "missing" };
  }

  /**
   * Lädt alle fehlenden Dateien. Jede Datei wird erst als `.part` geschrieben und nach bestandener
   * SHA-256-Prüfung umbenannt; eine fertige Datei mit richtiger Größe gilt damit als geprüft.
   */
  async download(onProgress?: Progress): Promise<LocalModelState> {
    if (this.ctrl) return this.state();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.lastError = null;
    const total = modelBytes(this.model);
    let done = 0;
    let lastEmit = 0;
    const emit = (force = false) => {
      const now = Date.now();
      if (!force && now - lastEmit < 250) return;
      lastEmit = now;
      onProgress?.({ state: "downloading", received: done, total });
    };
    this.progress = { received: 0, total };
    try {
      await mkdir(this.dir(), { recursive: true });
      for (const f of this.model.files) {
        const target = join(this.dir(), f.name);
        const have = await stat(target).catch(() => null);
        if (have?.size === f.size) {
          done += f.size;
          this.progress = { received: done, total };
          emit(true);
          continue;
        }
        const part = `${target}.part`;
        const res = await this.fetchFn(`${this.model.baseUrl}/${f.name}`, { signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} bei ${f.name}`);
        const hash = createHash("sha256");
        const out = createWriteStream(part);
        try {
          for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
            hash.update(chunk);
            if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", r));
            done += chunk.byteLength;
            this.progress = { received: done, total };
            emit();
          }
        } finally {
          await new Promise<void>((r) => out.end(r));
        }
        if (hash.digest("hex") !== f.sha256) {
          await rm(part, { force: true });
          throw new Error(`Prüfsumme von ${f.name} stimmt nicht`);
        }
        await rename(part, target);
      }
      this.progress = null;
      const s = await this.state();
      onProgress?.(s);
      return s;
    } catch (e) {
      this.progress = null;
      // Abbruch ist kein Fehler; angefangene `.part`-Dateien werden beim nächsten Versuch überschrieben.
      this.lastError = ctrl.signal.aborted ? null : e instanceof Error ? e.message : String(e);
      const s = await this.state();
      onProgress?.(s);
      return s;
    } finally {
      this.ctrl = null;
    }
  }

  cancel(): void {
    this.ctrl?.abort();
  }

  async remove(): Promise<LocalModelState> {
    this.cancel();
    this.lastError = null;
    await rm(this.dir(), { recursive: true, force: true });
    return this.state();
  }
}

interface SherpaStream {
  acceptWaveform(w: { samples: Float32Array; sampleRate: number }): void;
}
interface SherpaRecognizer {
  createStream(): SherpaStream;
  decodeAsync(s: SherpaStream): Promise<{ text?: string }>;
}
interface SherpaModule {
  OfflineRecognizer: { createAsync(config: unknown): Promise<SherpaRecognizer> };
}

/** Erkennung mit sherpa-onnx. Das Modell (≈ 1 GB im Speicher) wird nach 5 Minuten ohne Diktat freigegeben. */
export class SherpaEngine implements SttEngine {
  private rec: Promise<SherpaRecognizer> | null = null;
  private loadedDir: string | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;

  async transcribe(dir: string, samples: Float32Array): Promise<string> {
    if (this.idle) clearTimeout(this.idle);
    if (!this.rec || this.loadedDir !== dir) {
      this.loadedDir = dir;
      this.rec = (async () => {
        // Erst beim ersten Diktat laden: Fehlt die Bibliothek, startet die App trotzdem.
        const mod = (await import("sherpa-onnx-node")) as unknown as SherpaModule & { default?: SherpaModule };
        const sherpa = mod.default ?? mod;
        const threads = Math.max(1, Math.min(4, availableParallelism() - 1));
        return sherpa.OfflineRecognizer.createAsync(sherpaConfig(dir, threads, join));
      })();
      this.rec.catch(() => {
        this.rec = null;
      });
    }
    try {
      const rec = await this.rec;
      const stream = rec.createStream();
      stream.acceptWaveform({ samples, sampleRate: LOCAL_SAMPLE_RATE });
      const r = await rec.decodeAsync(stream);
      return typeof r?.text === "string" ? r.text : "";
    } finally {
      this.idle = setTimeout(() => {
        this.rec = null;
        this.loadedDir = null;
      }, 5 * 60_000);
      this.idle.unref?.();
    }
  }
}

/** Nur für E2E-Tests: liefert festen Text statt einer echten Erkennung. */
export class FakeEngine implements SttEngine {
  constructor(private readonly text: string) {}
  async transcribe(_dir: string, samples: Float32Array): Promise<string> {
    return samples.length ? this.text : "";
  }
}
