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
  storage: Omit<StorageAdapter, "watch">;
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

export function ipcAdapter(): StorageAdapter {
  const s = bridge().storage;
  return {
    list: (scope) => s.list(scope),
    read: (ref) => s.read(ref),
    write: (ref, text, h) => s.write(ref, text, h),
    create: (name, text) => s.create(name, text),
    moveToTrash: (ref, h) => s.moveToTrash(ref, h),
    restoreFromTrash: (ref, h) => s.restoreFromTrash(ref, h),
    rename: (ref, n, h) => s.rename(ref, n, h),
    deletePermanently: (ref, h) => s.deletePermanently(ref, h),
    recover: () => s.recover(),
    resolveRecovery: (id) => s.resolveRecovery(id),
  };
}
