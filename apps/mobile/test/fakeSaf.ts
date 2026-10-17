// Simulierte SAF-Schicht für Tests (Node). Verhält sich wie der lokale Speicheranbieter,
// optional mit der bekannten Eigenheit, dass `.md` zu `.md.txt` wird.
import { createHash } from "node:crypto";
import type { ChildDoc, CreatedDoc, ReadDoc, SafNative } from "../modules/saf-storage/src/SafStorage.types";

interface Doc {
  id: string;
  parent: string | null;
  name: string;
  isDir: boolean;
  bytes: Buffer;
  mtime: number;
}

const err = (code: string, msg: string) => Object.assign(new Error(msg), { code });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export class FakeSaf implements SafNative {
  docs = new Map<string, Doc>();
  journal = new Map<string, string>();
  kv = new Map<string, string>();
  permission = true;
  appendTxt = false;
  /** wirft vor dem Aufruf dieser Methode einmal */
  failOnce: Record<string, string> = {};
  private seq = 0;
  private clock = 1;
  readonly tree = "content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FAufgaben";

  constructor() {
    this.docs.set("root", { id: "root", parent: null, name: "Aufgaben", isDir: true, bytes: Buffer.alloc(0), mtime: 0 });
  }

  uri(id: string) {
    return `${this.tree}/document/${id}`;
  }
  idOf(uri: string) {
    const id = uri.split("/document/")[1]!;
    if (!this.docs.has(id)) throw err("ERR_MISSING", `fehlt ${uri}`);
    return id;
  }
  private maybeFail(name: string) {
    const c = this.failOnce[name];
    if (c) {
      delete this.failOnce[name];
      throw err(c, `injiziert ${name}`);
    }
  }

  /** Testhilfe: Datei direkt anlegen/ändern (wie ein externes Programm). */
  put(name: string, text: string | Buffer, parent = "root") {
    const existing = [...this.docs.values()].find((d) => d.parent === parent && d.name === name);
    const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8");
    if (existing) {
      existing.bytes = bytes;
      existing.mtime = this.clock++;
      return existing.id;
    }
    const id = `d${this.seq++}`;
    this.docs.set(id, { id, parent, name, isDir: false, bytes, mtime: this.clock++ });
    return id;
  }
  dir(name: string, parent = "root") {
    return [...this.docs.values()].find((d) => d.parent === parent && d.name === name && d.isDir)?.id ?? null;
  }
  files(parent = "root") {
    return [...this.docs.values()].filter((d) => d.parent === parent && !d.isDir).map((d) => d.name).sort();
  }
  text(name: string, parent = "root") {
    return [...this.docs.values()].find((d) => d.parent === parent && d.name === name)?.bytes.toString("utf8") ?? null;
  }

  async pickFolder() {
    return { treeUri: this.tree, rootDocId: "root", name: "Aufgaben" };
  }
  hasPermission() {
    return this.permission;
  }
  async listChildren(_t: string, parent: string): Promise<ChildDoc[]> {
    this.maybeFail("listChildren");
    if (!this.permission) throw err("ERR_PERMISSION", "keine Freigabe");
    return [...this.docs.values()]
      .filter((d) => d.parent === parent)
      .map((d) => ({ docId: d.id, uri: this.uri(d.id), name: d.name, isDir: d.isDir, mtime: d.mtime, size: d.bytes.length, flags: 0 }));
  }
  async readFile(uri: string): Promise<ReadDoc> {
    this.maybeFail("readFile");
    const d = this.docs.get(this.idOf(uri))!;
    let invalid = false;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(d.bytes);
    } catch {
      invalid = true;
      text = d.bytes.toString("utf8");
    }
    return { text, hash: sha(d.bytes), invalidUtf8: invalid, mtime: d.mtime, size: d.bytes.length };
  }
  async hashFile(uri: string) {
    return sha(this.docs.get(this.idOf(uri))!.bytes);
  }
  async writeFile(uri: string, text: string) {
    this.maybeFail("writeFile");
    const d = this.docs.get(this.idOf(uri))!;
    d.bytes = Buffer.from(text, "utf8"); // "wt": vollständig gekürzt, keine Restbytes
    d.mtime = this.clock++;
    return sha(d.bytes);
  }
  async createFile(_t: string, parent: string, name: string, mime: string): Promise<CreatedDoc> {
    this.maybeFail("createFile");
    const isDir = mime === "vnd.android.document/directory";
    let n = !isDir && this.appendTxt && mime !== "text/markdown" ? `${name}.txt` : name;
    const taken = (x: string) => [...this.docs.values()].some((d) => d.parent === parent && d.name === x);
    if (taken(n)) {
      const base = n;
      for (let i = 1; taken(n); i++) n = base.replace(/(\.[^.]*)?$/, ` (${i})$1`);
    }
    const id = `d${this.seq++}`;
    this.docs.set(id, { id, parent, name: n, isDir, bytes: Buffer.alloc(0), mtime: this.clock++ });
    return { uri: this.uri(id), docId: id, name: n };
  }
  async renameDocument(uri: string, newName: string): Promise<CreatedDoc> {
    this.maybeFail("renameDocument");
    const d = this.docs.get(this.idOf(uri))!;
    if ([...this.docs.values()].some((x) => x.parent === d.parent && x.name === newName && x !== d)) throw err("ERR_IO", "existiert");
    d.name = newName;
    return { uri, docId: d.id, name: newName };
  }
  async deleteDocument(uri: string) {
    this.maybeFail("deleteDocument");
    this.docs.delete(this.idOf(uri));
    return true;
  }
  async journalWrite(id: string, json: string) {
    this.maybeFail("journalWrite");
    this.journal.set(id, json);
  }
  async journalList() {
    return [...this.journal.values()];
  }
  async journalDelete(id: string) {
    return this.journal.delete(id);
  }
  async kvGet(k: string) {
    return this.kv.get(k) ?? null;
  }
  async kvSet(k: string, v: string) {
    this.kv.set(k, v);
  }
  async kvDelete(k: string) {
    return this.kv.delete(k);
  }
}
