// Lokale Erkennung (4.12): Parakeet Ultra (Moondream, nachtrainiertes NVIDIA Parakeet TDT 0.6B v3) als int8 für
// sherpa-onnx. Das Modell steckt nicht in der App; „Modell herunterladen“ lädt die vier Dateien einzeln und prüft sie
// über SHA-256. Feste Revision, damit sich die Dateien unter der Adresse nie ändern.

export interface ModelFile {
  name: string;
  size: number;
  sha256: string;
}

export interface LocalModelInfo {
  id: string;
  /** Basis-Adresse; die Dateien liegen unter `<baseUrl>/<name>` */
  baseUrl: string;
  files: ModelFile[];
}

export const LOCAL_MODEL: LocalModelInfo = {
  id: "parakeet-ultra-int8",
  baseUrl: "https://huggingface.co/leogaudin/sherpa-onnx-nemo-parakeet-ultra-int8/resolve/f7bc472677ff70be95cdb0ef9df509fee6f5ec0b",
  files: [
    { name: "encoder.int8.onnx", size: 652_282_340, sha256: "8bd3b8dc07056def6dfd19910e9f90c9e1a4e7e20901f58bdfe2a570a8081a2a" },
    { name: "decoder.int8.onnx", size: 11_845_275, sha256: "94373c6405c8149d1c9d1e9862514e0e3e88dab1c7de18fac9d5df9c6ba5efdd" },
    { name: "joiner.int8.onnx", size: 6_355_277, sha256: "8a71aaccfdba3d451775507a889afd2257d2e754463fd81095a8c8f290f924c2" },
    { name: "tokens.txt", size: 93_939, sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d" },
  ],
};

export const LOCAL_MODEL_NAME = "Parakeet Ultra";

/** Ordner früherer Modelle, die die App beim ersten Blick auf das Modell löscht (bis 20.11.2026: Parakeet TDT 0.6B v3). */
export const LEGACY_MODEL_IDS: readonly string[] = ["parakeet-tdt-0.6b-v3-int8"];

/** Gesamtgröße in Bytes */
export function modelBytes(m: LocalModelInfo = LOCAL_MODEL): number {
  return m.files.reduce((n, f) => n + f.size, 0);
}

/** Stand des Modells auf dem Gerät */
export type LocalModelState =
  | { state: "missing" }
  | { state: "downloading"; received: number; total: number }
  | { state: "ready" }
  | { state: "error"; message: string };

/** Abtastrate, die das Modell erwartet (mono, Float32 in [-1, 1]) */
export const LOCAL_SAMPLE_RATE = 16_000;

/** sherpa-onnx-Konfiguration für den Offline-Erkenner; `dir` ist der Modellordner. */
export function sherpaConfig(dir: string, numThreads: number, join: (...p: string[]) => string = (...p) => p.join("/")) {
  return {
    featConfig: { sampleRate: LOCAL_SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: join(dir, "encoder.int8.onnx"), decoder: join(dir, "decoder.int8.onnx"), joiner: join(dir, "joiner.int8.onnx") },
      tokens: join(dir, "tokens.txt"),
      numThreads,
      provider: "cpu",
      modelType: "nemo_transducer",
      debug: 0,
    },
    decodingMethod: "greedy_search",
  };
}

/** Megabyte für Anzeigen, z. B. „≈ 640 MB“ */
export function formatMB(bytes: number): string {
  return `${Math.round(bytes / 1_048_576)} MB`;
}

/** Typ der Aufnahme, wenn der Renderer schon dekodiert hat: Float32, mono, 16 kHz (Desktop, 4.12). */
export const LOCAL_PCM_MIME = "audio/x-pcm-f32-16k";
