export interface PickedFolder {
  treeUri: string;
  rootDocId: string;
  name: string;
}

export interface ChildDoc {
  docId: string;
  uri: string;
  name: string;
  isDir: boolean;
  mtime: number | null;
  size: number | null;
  flags: number;
}

export interface ReadDoc {
  text: string;
  hash: string;
  invalidUtf8: boolean;
  mtime: number | null;
  size: number | null;
}

export interface CreatedDoc {
  uri: string;
  docId: string;
  name: string;
}

/** Native SAF-Bausteine (Fehler tragen `code`: ERR_PERMISSION, ERR_MISSING, ERR_FULL, ERR_IO, …). */
export interface SafNative {
  pickFolder(initialUri: string | null): Promise<PickedFolder | null>;
  hasPermission(treeUri: string): boolean;
  listChildren(treeUri: string, parentDocId: string): Promise<ChildDoc[]>;
  readFile(uri: string): Promise<ReadDoc>;
  /** Mehrere Dateien lesen; null je Datei bei Fehler; mtime ist hier null (kommt aus der Auflistung). */
  readFiles(uris: string[]): Promise<(ReadDoc | null)[]>;
  hashFile(uri: string): Promise<string>;
  writeFile(uri: string, text: string): Promise<string>;
  createFile(treeUri: string, parentDocId: string, name: string, mime: string): Promise<CreatedDoc>;
  renameDocument(uri: string, newName: string): Promise<CreatedDoc>;
  deleteDocument(uri: string): Promise<boolean>;
  journalWrite(id: string, json: string): Promise<void>;
  journalList(): Promise<string[]>;
  journalDelete(id: string): Promise<boolean>;
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvDelete(key: string): Promise<boolean>;
}
