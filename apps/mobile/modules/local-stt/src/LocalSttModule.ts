// Lokale Erkennung am Handy (Plan 4.12): natives Modul mit sherpa-onnx. Fehlt es (z. B. Expo Go oder eine
// Prozessorarchitektur ohne Bibliothek), gibt es keine lokale Erkennung.
import { requireOptionalNativeModule, type EventSubscription } from "expo";
import type { ModelFile } from "@markdoist/app";

export interface LocalSttNative {
  isAvailable(): boolean;
  isComplete(id: string, files: ModelFile[]): Promise<boolean>;
  /** Lädt fehlende Dateien; wirft ERR_CANCELLED, ERR_HTTP, ERR_CHECKSUM … */
  download(id: string, baseUrl: string, files: ModelFile[]): Promise<void>;
  cancel(): void;
  remove(id: string): Promise<void>;
  /** Lädt das Modell vorab (beim Start der Aufnahme). */
  warm(id: string): Promise<void>;
  /** Erkennt eine Aufnahme (file://…m4a); das Modell muss vollständig sein. */
  transcribe(id: string, fileUri: string): Promise<string>;
  addListener(event: "onProgress", fn: (p: { received: number; total: number }) => void): EventSubscription;
}

export default requireOptionalNativeModule<LocalSttNative>("LocalStt");
