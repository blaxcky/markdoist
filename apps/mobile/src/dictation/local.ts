// Lokale Erkennung am Handy (4.12): Modell laden, Stand für die Einstellungen, Erkennung einer Aufnahme.
import { useEffect, useState } from "react";
import { DictationError, LOCAL_MODEL, modelBytes, type LocalModelState } from "@markdoist/app";
import LocalStt from "../../modules/local-stt/src/LocalSttModule";

/** Gibt es auf diesem Gerät eine lokale Erkennung (natives Modul und Bibliothek für die Architektur)? */
export function localAvailable(): boolean {
  try {
    return !!LocalStt?.isAvailable();
  } catch {
    return false;
  }
}

let current: LocalModelState | null = null;
const listeners = new Set<(s: LocalModelState) => void>();
const set = (s: LocalModelState) => {
  current = s;
  listeners.forEach((l) => l(s));
};

export async function modelReady(): Promise<boolean> {
  if (!LocalStt) return false;
  try {
    return await LocalStt.isComplete(LOCAL_MODEL.id, LOCAL_MODEL.files);
  } catch {
    return false;
  }
}

export async function modelState(): Promise<LocalModelState> {
  if (current?.state === "downloading") return current;
  const s: LocalModelState = (await modelReady()) ? { state: "ready" } : current?.state === "error" ? current : { state: "missing" };
  current = s;
  return s;
}

export async function downloadModel(): Promise<LocalModelState> {
  if (!LocalStt || current?.state === "downloading") return modelState();
  const total = modelBytes();
  set({ state: "downloading", received: 0, total });
  const sub = LocalStt.addListener("onProgress", (p) => set({ state: "downloading", received: p.received, total: p.total }));
  try {
    await LocalStt.download(LOCAL_MODEL.id, LOCAL_MODEL.baseUrl, LOCAL_MODEL.files);
    set({ state: "ready" });
  } catch (e) {
    const code = (e as { code?: string }).code;
    // Abbrechen ist kein Fehler.
    set(code === "ERR_CANCELLED" ? { state: "missing" } : { state: "error", message: e instanceof Error ? e.message : String(e) });
  } finally {
    sub.remove();
  }
  return current!;
}

export function cancelDownload(): void {
  LocalStt?.cancel();
}

export async function removeModel(): Promise<LocalModelState> {
  await LocalStt?.remove(LOCAL_MODEL.id);
  set({ state: "missing" });
  return current!;
}

/** Erkennt eine Aufnahme auf dem Gerät. Ohne vollständiges Modell `nomodel`. */
export async function transcribeLocal(uri: string): Promise<string> {
  if (!LocalStt || !(await modelReady())) throw new DictationError("nomodel");
  return LocalStt.transcribe(LOCAL_MODEL.id, uri);
}

/** Meldet Änderungen am Modell (fertig geladen, gelöscht); Rückgabe meldet ab. */
export function onModelChange(l: (s: LocalModelState) => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** Stand des Modells für die Einstellungen, mit Fortschritt während des Downloads. */
export function useLocalModel(): LocalModelState | null {
  const [s, setS] = useState<LocalModelState | null>(current);
  useEffect(() => {
    let alive = true;
    void modelState().then((x) => alive && setS(x));
    const l = (x: LocalModelState) => alive && setS(x);
    listeners.add(l);
    return () => {
      alive = false;
      listeners.delete(l);
    };
  }, []);
  return s;
}
