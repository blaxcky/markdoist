// Fachlicher Speichervertrag beider Plattformen (Plan 2.1, 7.3).
// Die Plattform verantwortet ihr dauerhaftes Operationsjournal und die Wiederherstellung.

export type Scope = "tasks" | "trash";

export interface FileMeta {
  name: string;
  ref: string;
  /** Hinweis, kein Inhaltsnachweis; bei SAF ggf. unbekannt */
  mtime: number | null;
  size: number | null;
}

export interface ReadResult {
  text: string;
  hash: string;
  mtime: number | null;
  invalidUtf8?: boolean;
}

export type WriteResult =
  | { status: "ok"; ref: string; name: string; hash: string }
  /** aktueller Hash weicht von der erwarteten Ausgangsfassung ab */
  | { status: "conflict"; currentHash: string | null }
  | { status: "permission"; message: string }
  | { status: "missing"; message: string }
  | { status: "full"; message: string }
  /** Ziel existiert bereits (exklusive Neuanlage) */
  | { status: "exists"; message: string }
  /** unklarer Ausgang: vor erneutem Versuch Journal prüfen */
  | { status: "unknown"; message: string };

export interface RecoveryCase {
  opId: string;
  kind: "write" | "create" | "trash" | "restore" | "rename" | "delete";
  ref: string;
  name: string;
  /** Inhalt vor dem Vorgang (falls bekannt) */
  before: string | null;
  /** gewünschter Inhalt */
  desired: string | null;
  /** aktueller Inhalt am Ziel (null = fehlt) */
  current: string | null;
  message: string;
}

export interface StorageAdapter {
  /** Wirft bei Fehlern – eine fehlgeschlagene Auflistung ist nie ein leerer Ordner (7.1). */
  list(scope: Scope): Promise<FileMeta[]>;
  read(ref: string): Promise<ReadResult>;
  write(ref: string, text: string, expectedHash: string): Promise<WriteResult>;
  /** Exklusive Neuanlage in der obersten Ebene; liefert den tatsächlich vergebenen Namen. */
  create(name: string, text: string): Promise<WriteResult>;
  moveToTrash(ref: string, expectedHash: string): Promise<WriteResult>;
  restoreFromTrash(ref: string, expectedHash: string): Promise<WriteResult>;
  rename(ref: string, newName: string, expectedHash: string): Promise<WriteResult>;
  deletePermanently(ref: string, expectedHash: string): Promise<WriteResult>;
  /** Offene Vorgänge klären, bevor neue Schreibaktionen starten. */
  recover(): Promise<RecoveryCase[]>;
  /** Vorgang nach Nutzerentscheidung abschließen (Fassung übernommen oder verworfen). */
  resolveRecovery(opId: string): Promise<void>;
  /** nur Desktop */
  watch?(onChange: (overflow: boolean) => void): () => void;
}

/** Gerätelokaler Schlüssel-Wert-Speicher für Undo-Journal, Entwürfe und Cache. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
  }
  async delete(key: string) {
    this.data.delete(key);
  }
}
