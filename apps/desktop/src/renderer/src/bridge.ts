// Brücke zum Main-Prozess: StorageAdapter und Schlüssel-Wert-Speicher über IPC.
import type { KeyValueStore, StorageAdapter } from "@markdoist/app";

export interface Settings {
  folder: string | null;
  theme: "system" | "light" | "dark";
}

interface Bridge {
  info(): Promise<{ version: string }>;
  settings: { get(): Promise<Settings>; setTheme(t: Settings["theme"]): Promise<Settings> };
  folder: { choose(): Promise<Settings>; set(folder: string): Promise<Settings> };
  openExternal(url: string): Promise<void>;
  /** Speicheroperationen; erstes Argument ist der Ordner des aufrufenden Repositorys (7.1). */
  storage: {
    [K in Exclude<keyof StorageAdapter, "watch" | "readMany">]: (
      folder: string,
      ...args: Parameters<StorageAdapter[K]>
    ) => ReturnType<StorageAdapter[K]>;
  };
  kv: KeyValueStore;
  onStorageChanged(fn: (overflow: boolean) => void): () => void;
  onFocus(fn: () => void): () => void;
}

declare global {
  interface Window {
    markdoist: Bridge;
  }
}

export const bridge = (): Bridge => window.markdoist;

/** Adapter für genau einen Ordner: Nach einem Ordnerwechsel weist der Hauptprozess seine Aufrufe ab (7.1, AK-36). */
export function ipcAdapter(folder: string): StorageAdapter {
  const s = bridge().storage;
  return {
    list: (scope) => s.list(folder, scope),
    read: (ref) => s.read(folder, ref),
    write: (ref, text, h) => s.write(folder, ref, text, h),
    create: (name, text) => s.create(folder, name, text),
    moveToTrash: (ref, h) => s.moveToTrash(folder, ref, h),
    restoreFromTrash: (ref, h) => s.restoreFromTrash(folder, ref, h),
    rename: (ref, n, h) => s.rename(folder, ref, n, h),
    deletePermanently: (ref, h) => s.deletePermanently(folder, ref, h),
    recover: () => s.recover(folder),
    resolveRecovery: (id) => s.resolveRecovery(folder, id),
  };
}
