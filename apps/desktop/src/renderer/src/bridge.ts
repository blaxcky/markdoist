// Brücke zum Main-Prozess: StorageAdapter und Schlüssel-Wert-Speicher über IPC.
import { DictationError, type DictationContext, type DictationErrorKind, type DictationResult, type DictationSettings, type KeyValueStore, type StorageAdapter, type TitleSuggester, type TitleSuggestion } from "@markdoist/app";

export interface Settings {
  folder: string | null;
  theme: "system" | "light" | "dark";
}

/** Diktieren (4.9); der Schlüssel selbst bleibt im Main-Prozess */
export interface DictationStatus {
  hasKey: boolean;
  masked: string | null;
  insecure: boolean;
  settings: DictationSettings;
}

interface Bridge {
  info(): Promise<{ version: string }>;
  settings: { get(): Promise<Settings>; setTheme(t: Settings["theme"]): Promise<Settings> };
  folder: { choose(): Promise<Settings>; set(folder: string): Promise<Settings> };
  /** ICS-Datei wählen und lesen (Müllabfuhr-Import, 4.7); null = abgebrochen */
  ics: { choose(): Promise<{ name: string; text?: string; error?: string } | null> };
  openExternal(url: string): Promise<void>;
  /** Text in die Zwischenablage legen (Kopieren eines Programmier-Eintrags, 4.8) */
  copyText(text: string): Promise<void>;
  /** Speicheroperationen; erstes Argument ist der Ordner des aufrufenden Repositorys (7.1). */
  storage: {
    [K in Exclude<keyof StorageAdapter, "watch" | "readMany">]: (
      folder: string,
      ...args: Parameters<StorageAdapter[K]>
    ) => ReturnType<StorageAdapter[K]>;
  };
  kv: KeyValueStore;
  dictation: {
    status(): Promise<DictationStatus>;
    setKey(key: string): Promise<DictationStatus>;
    clearKey(): Promise<DictationStatus>;
    check(): Promise<{ ok: true } | { ok: false; kind: DictationErrorKind }>;
    setSettings(s: Partial<DictationSettings>): Promise<DictationStatus>;
    run(audio: ArrayBuffer, mime: string, ctx: DictationContext): Promise<{ ok: true; result: DictationResult } | { ok: false; kind: DictationErrorKind }>;
    onPhase(fn: (p: "transcribing" | "cleaning") => void): () => void;
    /** Titel und Art eines Programmier-Eintrags (4.10); `force` = „Neu vorschlagen“ */
    title(note: string, list: string, force: boolean): Promise<{ ok: true; suggestion: TitleSuggestion } | { ok: false; kind: DictationErrorKind | "off"; detail?: string; status?: number }>;
    /** „Checkliste einfügen“ (4.11): Einträge aus unformatiertem Text */
    checklist(text: string, list: string): Promise<{ ok: true; items: string[] } | { ok: false; kind: DictationErrorKind; detail?: string; status?: number }>;
  };
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

/** Titelvorschlag über den Main-Prozess (4.10); null, wenn abgeschaltet. Fehler kommen als `DictationError`. */
async function suggestVia(note: string, list: string, force: boolean): Promise<TitleSuggestion | null> {
  const r = await bridge().dictation.title(note, list, force);
  if (r.ok) return r.suggestion;
  if (r.kind === "off") return null;
  throw new DictationError(r.kind, r.detail, r.status);
}

export const suggestTitleAuto: TitleSuggester = (note, list) => suggestVia(note, list, false);

/** „Neu vorschlagen“: fragt auch bei abgeschaltetem Automatismus. */
export const suggestTitleForced: TitleSuggester = (note, list) => suggestVia(note, list, true);

/** „Checkliste einfügen“ über den Main-Prozess (4.11). Fehler kommen als `DictationError`. */
export async function checklistVia(text: string, list: string): Promise<string[]> {
  const r = await bridge().dictation.checklist(text, list);
  if (r.ok) return r.items;
  throw new DictationError(r.kind, r.detail, r.status);
}
