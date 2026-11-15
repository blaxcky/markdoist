// Lokale Erkennung (4.12): NVIDIA Parakeet TDT 0.6B v3 (int8) für sherpa-onnx. Das Modell steckt nicht in der
// App; „Modell herunterladen“ lädt die vier Dateien einzeln und prüft sie über SHA-256. Feste Revision, damit
// sich die Dateien unter der Adresse nie ändern.

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
  id: "parakeet-tdt-0.6b-v3-int8",
  baseUrl: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/ed5d745623472f97cfc2e6c2916ee248798fc5a8",
  files: [
    { name: "encoder.int8.onnx", size: 652_282_294, sha256: "1afbe69c1ffdabee94755f42e4daf1d93549131a3da11356bda84fcef0f2c479" },
    { name: "decoder.int8.onnx", size: 11_845_274, sha256: "0222a86147299d4dee90edf95b6d13827edb42ad8b7c9cf0b2582f030937c0b5" },
    { name: "joiner.int8.onnx", size: 6_355_277, sha256: "cbd02f3696e9944970111fb439d9c3fd365a80374565f13f2b9c7007d253fc98" },
    { name: "tokens.txt", size: 93_939, sha256: "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d" },
  ],
};

export const LOCAL_MODEL_NAME = "NVIDIA Parakeet TDT 0.6B v3";

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
