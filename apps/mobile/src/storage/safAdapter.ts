// Android-Speicheradapter über SAF (Plan 7.1, 7.3). Kein atomarer Austausch: Journal mit
// Vorher-/Nachher-Inhalt, Hash-Prüfung vor dem Kürzen, Zurücklesen nach dem Schreiben.
import type { FileMeta, KeyValueStore, ReadResult, RecoveryCase, Scope, StorageAdapter, WriteResult } from "@markdoist/app";
import { hashText } from "@markdoist/core";
import type { ChildDoc, ReadDoc, SafNative } from "../../modules/saf-storage/src/SafStorage.types";

export const TRASH_DIR = ".todo-trash";
const FILE_MIME = "application/octet-stream";
const DIR_MIME = "vnd.android.document/directory";
const KEEP_DONE_MS = 7 * 24 * 3600 * 1000;

type OpKind = RecoveryCase["kind"];

interface Journal {
  opId: string;
  tree: string;
  kind: OpKind;
  src: string;
  dst: string;
  /** URI des Ziels, sobald bekannt (Neuanlage, Kopie) */
  dstUri: string | null;
  srcUri: string | null;
  beforeHash: string | null;
  beforeText: string | null;
  desired: string | null;
  desiredHash: string | null;
  phase: "journaled" | "created" | "written" | "done";
  createdAt: number;
}

export type PhaseHook = (kind: OpKind, phase: string) => void;
export class CrashSimulation extends Error {}

function code(e: unknown): string {
  return (e as { code?: string })?.code ?? "";
}

function mapError(e: unknown): Exclude<WriteResult, { status: "ok" }> {
  const message = e instanceof Error ? e.message : String(e);
  switch (code(e)) {
    case "ERR_PERMISSION":
      return { status: "permission", message };
    case "ERR_MISSING":
      return { status: "missing", message };
    case "ERR_FULL":
      return { status: "full", message };
    default:
      return { status: "unknown", message };
  }
}

let counter = 0;

export class SafAdapter implements StorageAdapter {
  private docs: Record<Scope, Map<string, ChildDoc>> = { tasks: new Map(), trash: new Map() };
  private trashDocId: string | null = null;

  constructor(
    private readonly native: SafNative,
    readonly treeUri: string,
    private readonly rootDocId: string,
    private readonly hook: PhaseHook = () => {},
  ) {}

  // ---------------------------------------------------------------- Auflisten

  private async children(scope: Scope): Promise<ChildDoc[]> {
    if (scope === "tasks") {
      const all = await this.native.listChildren(this.treeUri, this.rootDocId);
      const trash = all.find((c) => c.isDir && c.name === TRASH_DIR);
      this.trashDocId = trash?.docId ?? null;
      return all;
    }
    if (!this.trashDocId) await this.children("tasks");
    if (!this.trashDocId) return [];
    return this.native.listChildren(this.treeUri, this.trashDocId);
  }

  async list(scope: Scope): Promise<FileMeta[]> {
    if (!this.native.hasPermission(this.treeUri)) {
      throw Object.assign(new Error("Freigabe für den Ordner fehlt – bitte erneut wählen"), { code: "ERR_PERMISSION" });
    }
    const docs = (await this.children(scope)).filter((c) => !c.isDir && !c.name.startsWith("."));
    this.docs[scope] = new Map(docs.map((d) => [d.name, d]));
    return docs.map((d) => ({ name: d.name, ref: `${scope}/${d.name}`, mtime: d.mtime, size: d.size }));
  }

  private split(ref: string): { scope: Scope; name: string } {
    const i = ref.indexOf("/");
    const scope = ref.slice(0, i) as Scope;
    const name = ref.slice(i + 1);
    if ((scope !== "tasks" && scope !== "trash") || !name || name.includes("/")) {
      throw Object.assign(new Error(`Ungültige Referenz ${ref}`), { code: "ERR_MISSING" });
    }
    return { scope, name };
  }

  /** Bekannte URI zu einer Referenz; nach Umbenennen nie eine alte URI weiterbenutzen. */
  private async uriOf(ref: string): Promise<string | null> {
    const { scope, name } = this.split(ref);
    if (!this.docs[scope].has(name)) await this.list(scope);
    return this.docs[scope].get(name)?.uri ?? null;
  }

  /**
   * Datei vor einer Änderung frisch lesen. Jede Auflistung fragt beim Anbieter jede Datei einzeln ab
   * und kostet bei großen Ordnern Sekunden; darum zuerst die bekannte URI, und nur wenn sie fehlt oder
   * nicht mehr zu dieser Datei gehört, einmal neu auflisten.
   */
  private async current(ref: string): Promise<{ uri: string; cur: ReadDoc } | null> {
    const { scope, name } = this.split(ref);
    const attempt = async (uri: string) => {
      try {
        const cur = await this.native.readFile(uri);
        return cur.name === undefined || cur.name === name ? { uri, cur } : null;
      } catch (e) {
        if (code(e) === "ERR_MISSING") return null;
        throw e;
      }
    };
    const known = this.docs[scope].get(name);
    const hit = known ? await attempt(known.uri) : null;
    if (hit) return hit;
    await this.list(scope);
    const fresh = this.docs[scope].get(name);
    return fresh ? attempt(fresh.uri) : null;
  }

  /** Eigene Änderung im bekannten Stand nachführen, statt den Ordner neu aufzulisten. */
  private remember(scope: Scope, name: string, doc: { uri: string; docId: string }) {
    this.docs[scope].set(name, { docId: doc.docId, uri: doc.uri, name, isDir: false, mtime: null, size: null, flags: 0 });
  }

  /** Belegt der Anbieter den Namen schon? Gezielte Abfrage, case-insensitiv wie der gemeinsame Speicher. */
  private async taken(parentDocId: string, name: string): Promise<boolean> {
    return (await this.native.findChild(this.treeUri, parentDocId, name)) !== null;
  }

  async read(ref: string): Promise<ReadResult> {
    const uri = await this.uriOf(ref);
    if (!uri) throw Object.assign(new Error(`Datei fehlt: ${ref}`), { code: "ERR_MISSING" });
    const r = await this.native.readFile(uri);
    return { text: r.text, hash: r.hash, mtime: r.mtime, invalidUtf8: r.invalidUtf8 };
  }

  async readMany(refs: string[]): Promise<(ReadResult | null)[]> {
    const docs = refs.map((ref) => {
      try {
        const { scope, name } = this.split(ref);
        return this.docs[scope].get(name) ?? null;
      } catch {
        return null;
      }
    });
    const uris = docs.filter((d): d is ChildDoc => d !== null).map((d) => d.uri);
    const read = uris.length ? await this.native.readFiles(uris) : [];
    let k = 0;
    return docs.map((d) => {
      if (!d) return null;
      const r = read[k++];
      return r ? { text: r.text, hash: r.hash, mtime: d.mtime, invalidUtf8: r.invalidUtf8 } : null;
    });
  }

  // ---------------------------------------------------------------- Journal

  private async journal(j: Journal) {
    await this.native.journalWrite(j.opId, JSON.stringify(j));
  }

  private async finish(j: Journal) {
    j.phase = "done";
    await this.journal(j);
  }

  private async begin(
    kind: OpKind,
    src: string,
    dst: string,
    before: { text: string; hash: string } | null,
    desired: string | null,
    srcUri: string | null,
    dstUri: string | null = null,
  ): Promise<Journal> {
    const j: Journal = {
      opId: `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      tree: this.treeUri,
      kind,
      src,
      dst,
      srcUri,
      dstUri,
      beforeHash: before?.hash ?? null,
      beforeText: before?.text ?? null,
      desired,
      desiredHash: desired === null ? null : hashText(desired),
      phase: "journaled",
      createdAt: Date.now(),
    };
    this.hook(kind, "before-journal");
    await this.journal(j); // schlägt das fehl, wird keine Zieldatei geöffnet
    return j;
  }

  // ---------------------------------------------------------------- Schreiben

  async write(ref: string, text: string, expectedHash: string): Promise<WriteResult> {
    let j: Journal | null = null;
    try {
      const found = await this.current(ref);
      if (!found) return { status: "missing", message: ref };
      const { uri, cur } = found;
      if (cur.hash !== expectedHash) return { status: "conflict", currentHash: cur.hash };
      j = await this.begin("write", ref, ref, { text: cur.text, hash: cur.hash }, text, uri, uri);
      // Ziel erneut prüfen, unmittelbar vor dem Kürzen.
      const again = await this.native.hashFile(uri);
      if (again !== expectedHash) {
        await this.finish(j);
        return { status: "conflict", currentHash: again };
      }
      this.hook("write", "before-truncate");
      const after = await this.native.writeFile(uri, text);
      this.hook("write", "after-write");
      if (after !== j.desiredHash) return this.unclear(j, { status: "unknown", message: "Nachher-Hash weicht ab – Wiederherstellung prüfen" });
      await this.finish(j);
      return { status: "ok", ref, name: this.split(ref).name, hash: after };
    } catch (e) {
      return this.failure(e, j);
    }
  }

  /**
   * Fehler nach Beginn eines Vorgangs: Ausgang sofort klären (7.3). Unberührtes Ziel schließt den
   * Vorgang ab; sonst bleibt das Journal offen und der Fall wird mitgeliefert.
   */
  private async failure(e: unknown, j: Journal | null): Promise<WriteResult> {
    if (e instanceof CrashSimulation) throw e;
    const r = mapError(e);
    return j ? this.unclear(j, r) : r;
  }

  private async unclear(j: Journal, r: Exclude<WriteResult, { status: "ok" }>): Promise<WriteResult> {
    let recovery: RecoveryCase | null;
    try {
      recovery = await this.assess(j, true);
    } catch {
      recovery = await this.caseOf(j, null, r.status === "conflict" ? "Vorgang unklar" : r.message);
    }
    return recovery ? { ...r, recovery } : r;
  }

  /** Neuanlage: exklusiver Name, MIME application/octet-stream, tatsächlichen Namen übernehmen. */
  async create(name: string, text: string): Promise<WriteResult> {
    let j: Journal | null = null;
    try {
      if (await this.taken(this.rootDocId, name)) return { status: "exists", message: name };
      const ref = `tasks/${name}`;
      j = await this.begin("create", ref, ref, null, text, null);
      const doc = await this.createChecked(this.rootDocId, name, j);
      if (doc.status !== "ok") return doc.result;
      this.hook("create", "after-create");
      const after = await this.native.writeFile(doc.uri, text);
      if (after !== j.desiredHash) return this.unclear(j, { status: "unknown", message: "Neuanlage nicht vollständig geschrieben" });
      j.phase = "written";
      await this.finish(j);
      this.remember("tasks", name, doc);
      return { status: "ok", ref, name, hash: after };
    } catch (e) {
      return this.failure(e, j);
    }
  }

  /** Legt ein Dokument an und stellt den exakten Namen sicher (`.md` darf nicht zu `.md.txt` werden). */
  private async createChecked(
    parentDocId: string,
    name: string,
    j: Journal,
  ): Promise<{ status: "ok"; uri: string; docId: string } | { status: "fail"; result: WriteResult }> {
    let doc = await this.native.createFile(this.treeUri, parentDocId, name, FILE_MIME);
    j.dstUri = doc.uri;
    j.phase = "created";
    await this.journal(j);
    if (doc.name !== name) {
      try {
        doc = await this.native.renameDocument(doc.uri, name);
        j.dstUri = doc.uri;
        await this.journal(j);
      } catch {
        /* Prüfung unten */
      }
      if (doc.name !== name) {
        await this.native.deleteDocument(doc.uri).catch(() => {});
        await this.finish(j);
        return { status: "fail", result: { status: "exists", message: `Anbieter vergab ${doc.name}` } };
      }
    }
    return { status: "ok", uri: doc.uri, docId: doc.docId };
  }

  private async ensureTrash(): Promise<string> {
    if (this.trashDocId) return this.trashDocId;
    const found = await this.native.findChild(this.treeUri, this.rootDocId, TRASH_DIR);
    if (found?.isDir) {
      this.trashDocId = found.docId;
      return found.docId;
    }
    const d = await this.native.createFile(this.treeUri, this.rootDocId, TRASH_DIR, DIR_MIME);
    this.trashDocId = d.docId;
    return d.docId;
  }

  private async freeName(parentDocId: string, name: string): Promise<string> {
    if (!(await this.taken(parentDocId, name))) return name;
    const m = /^(.*?)(\.md)?$/i.exec(name)!;
    for (let n = 2; n < 10000; n++) {
      const c = `${m[1]} ${n}${m[2] ?? ""}`;
      if (!(await this.taken(parentDocId, c))) return c;
    }
    throw new Error("Kein freier Name");
  }

  /** Kopieren/Löschen: Ziel vollständig schreiben und prüfen, Quelle erneut prüfen, dann löschen (7.3). */
  private async copyMove(kind: OpKind, ref: string, to: Scope, expectedHash: string): Promise<WriteResult> {
    let j: Journal | null = null;
    try {
      const { scope, name: srcName } = this.split(ref);
      const found = await this.current(ref);
      if (!found) return { status: "missing", message: ref };
      const { uri: srcUri, cur } = found;
      if (cur.hash !== expectedHash) return { status: "conflict", currentHash: cur.hash };
      const parent = to === "trash" ? await this.ensureTrash() : this.rootDocId;
      const name = await this.freeName(parent, srcName);
      const dstRef = `${to}/${name}`;
      j = await this.begin(kind, ref, dstRef, { text: cur.text, hash: cur.hash }, cur.text, srcUri);
      const doc = await this.createChecked(parent, name, j);
      if (doc.status !== "ok") return doc.result;
      this.hook(kind, "after-create");
      const after = await this.native.writeFile(doc.uri, cur.text);
      if (after !== expectedHash) return this.unclear(j, { status: "unknown", message: "Kopie nicht vollständig" });
      j.phase = "written";
      await this.journal(j);
      this.hook(kind, "after-copy");
      const again = await this.native.hashFile(srcUri);
      if (again !== expectedHash) {
        // Quelle hat sich geändert: beide Fassungen behalten, Vorgang offen melden.
        return {
          status: "conflict",
          currentHash: again,
          recovery: await this.caseOf(j, doc.uri, "Quelle wurde während des Verschiebens geändert – beide Fassungen behalten"),
        };
      }
      await this.native.deleteDocument(srcUri);
      this.hook(kind, "after-delete");
      await this.finish(j);
      this.docs[scope].delete(srcName);
      this.remember(to, name, doc);
      return { status: "ok", ref: dstRef, name, hash: after };
    } catch (e) {
      return this.failure(e, j);
    }
  }

  moveToTrash(ref: string, expectedHash: string) {
    return this.copyMove("trash", ref, "trash", expectedHash);
  }

  restoreFromTrash(ref: string, expectedHash: string) {
    return this.copyMove("restore", ref, "tasks", expectedHash);
  }

  async rename(ref: string, newName: string, expectedHash: string): Promise<WriteResult> {
    let j: Journal | null = null;
    try {
      const found = await this.current(ref);
      if (!found) return { status: "missing", message: ref };
      if (await this.taken(this.rootDocId, newName)) return { status: "exists", message: newName };
      const { uri, cur } = found;
      if (cur.hash !== expectedHash) return { status: "conflict", currentHash: cur.hash };
      const started = await this.begin("rename", ref, `tasks/${newName}`, { text: cur.text, hash: cur.hash }, null, uri);
      j = started;
      let r;
      try {
        r = await this.native.renameDocument(uri, newName);
      } catch (e) {
        // Anbieter hat abgelehnt: Quelle unverändert, Vorgang abschließen.
        if ((await this.hashOf(uri)) === expectedHash) {
          await this.finish(started);
          j = null;
        }
        throw e;
      }
      started.dstUri = r.uri;
      if (r.name !== newName) return this.unclear(started, { status: "unknown", message: `Anbieter vergab ${r.name}` });
      await this.finish(started);
      this.docs.tasks.delete(this.split(ref).name);
      this.remember("tasks", newName, r);
      return { status: "ok", ref: `tasks/${newName}`, name: newName, hash: expectedHash };
    } catch (e) {
      return this.failure(e, j);
    }
  }

  async deletePermanently(ref: string, expectedHash: string): Promise<WriteResult> {
    let j: Journal | null = null;
    try {
      const found = await this.current(ref);
      if (!found) return { status: "missing", message: ref };
      const { uri, cur } = found;
      if (cur.hash !== expectedHash) return { status: "conflict", currentHash: cur.hash };
      j = await this.begin("delete", ref, ref, { text: cur.text, hash: cur.hash }, null, uri);
      await this.native.deleteDocument(uri);
      await this.finish(j);
      const { scope, name } = this.split(ref);
      this.docs[scope].delete(name);
      return { status: "ok", ref, name, hash: expectedHash };
    } catch (e) {
      return this.failure(e, j);
    }
  }

  // ---------------------------------------------------------------- Wiederherstellung

  private async entries(): Promise<Journal[]> {
    const out: Journal[] = [];
    for (const raw of await this.native.journalList()) {
      try {
        const j = JSON.parse(raw) as Journal;
        if (j.tree === this.treeUri) out.push(j);
      } catch {
        /* unlesbarer Eintrag bleibt liegen */
      }
    }
    return out;
  }

  private async hashOf(uri: string | null): Promise<string | null> {
    if (!uri) return null;
    try {
      return await this.native.hashFile(uri);
    } catch (e) {
      if (code(e) === "ERR_MISSING") return null;
      throw e;
    }
  }

  private async textOf(uri: string | null): Promise<string | null> {
    if (!uri) return null;
    try {
      return (await this.native.readFile(uri)).text;
    } catch {
      return null;
    }
  }

  /** Ort einer Referenz für Meldungen, z. B. „Papierkorb (A.md)“. */
  private place(ref: string): string {
    const { scope, name } = this.split(ref);
    return `${scope === "trash" ? "Papierkorb" : "Aufgabenordner"} (${name})`;
  }

  /** Ziel enthält höchstens einen Anfang der zu kopierenden Fassung (abgebrochenes eigenes Schreiben). */
  private async isPartialCopy(j: Journal): Promise<boolean> {
    if (!j.dstUri || j.beforeText === null) return false;
    const cur = await this.textOf(j.dstUri);
    return cur !== null && j.beforeText.startsWith(cur);
  }

  private async caseOf(j: Journal, uri: string | null, message: string): Promise<RecoveryCase> {
    return {
      opId: j.opId,
      kind: j.kind,
      ref: j.dst,
      ...(j.src !== j.dst ? { source: j.src } : {}),
      name: this.split(j.dst).name,
      before: j.beforeText,
      desired: j.desired,
      current: await this.textOf(uri),
      message,
    };
  }

  /**
   * Einen offenen Vorgang bewerten: eindeutige Fälle abschließen (null), sonst Wiederherstellungsfall.
   * Zur Laufzeit (runtime) gilt ein unberührtes Ziel ebenfalls als abgeschlossen: Der Fehler wird
   * gemeldet, die ausstehende Änderung liegt noch bei der Oberfläche.
   */
  private async assess(j: Journal, runtime = false): Promise<RecoveryCase | null> {
    const done = async () => {
      await this.finish(j);
      return null;
    };
    if (j.kind === "write") {
      const h = await this.hashOf(j.dstUri);
      if (h === j.desiredHash) return done();
      if (h === j.beforeHash) {
        if (runtime) return done();
        return this.caseOf(j, j.dstUri, "Änderung wurde nicht gespeichert – erneut speichern?");
      }
      return this.caseOf(j, j.dstUri, h === null ? "Datei fehlt" : "Datei hat einen unerwarteten Inhalt (Ausgangs- und Zielfassung im Journal)");
    }
    if (j.kind === "create") {
      const h = await this.hashOf(j.dstUri);
      if (h !== null && h === j.desiredHash) return done();
      if (j.dstUri === null) {
        // Kein Dokument angelegt: nichts geschehen, Inhalt zum erneuten Speichern anbieten.
        if (runtime) return done();
        return this.caseOf(j, null, "Neuanlage wurde nicht abgeschlossen");
      }
      return this.caseOf(j, j.dstUri, "Neuanlage unvollständig – Datei nicht erneut anlegen, bitte prüfen");
    }
    if (j.kind === "trash" || j.kind === "restore") {
      const src = await this.hashOf(j.srcUri);
      const dst = await this.hashOf(j.dstUri);
      if (dst === j.beforeHash && src === j.beforeHash) {
        // Abbruch zwischen Kopie und Löschen: nicht erneut kopieren, Quelle nach Prüfung löschen.
        await this.native.deleteDocument(j.srcUri!);
        return done();
      }
      // Kopie vollständig, Quelle bereits entfernt: abgeschlossen.
      if (dst === j.beforeHash && src === null) return done();
      if (src === j.beforeHash) {
        // Quelle unverändert, Ziel fehlt: nichts verschoben, nichts zu entfernen.
        if (dst === null) return done();
        // Abweichendes Ziel nur löschen, wenn es nachweislich die eigene Teilkopie ist: Das Journal hat
        // es noch nicht als vollständig geschrieben protokolliert und es enthält einen Anfang der Kopie.
        // Alles andere ist eine dritte Fassung (R7) und bleibt als Fall erhalten.
        if (j.phase !== "written" && (await this.isPartialCopy(j))) {
          await this.native.deleteDocument(j.dstUri!).catch(() => {});
          return done();
        }
        return this.caseOf(
          j,
          j.dstUri,
          `${this.place(j.dst)} hat einen unerwarteten Inhalt; die Ausgangsfassung liegt unverändert in ${this.place(j.src)} – beide Fassungen behalten, bitte prüfen`,
        );
      }
      return this.caseOf(j, j.dstUri ?? j.srcUri, "Verschieben unklar – beide Orte prüfen");
    }
    if (j.kind === "rename") {
      await this.list("tasks");
      const newName = this.split(j.dst).name;
      const oldName = this.split(j.src).name;
      if (this.docs.tasks.has(newName) || this.docs.tasks.has(oldName)) return done();
      return this.caseOf(j, null, "Umbenennen unklar – Datei nicht gefunden");
    }
    // delete
    const h = await this.hashOf(j.srcUri);
    if (h === null) return done();
    if (runtime && h === j.beforeHash) return done();
    return this.caseOf(j, j.srcUri, "Endgültiges Löschen nicht abgeschlossen");
  }

  async recover(): Promise<RecoveryCase[]> {
    const cases: RecoveryCase[] = [];
    for (const j of await this.entries()) {
      if (j.phase === "done") {
        if (Date.now() - j.createdAt > KEEP_DONE_MS) await this.native.journalDelete(j.opId);
        continue;
      }
      const c = await this.assess(j);
      if (c) cases.push(c);
    }
    await this.list("tasks").catch(() => {});
    return cases;
  }

  async resolveRecovery(opId: string): Promise<void> {
    const j = (await this.entries()).find((x) => x.opId === opId);
    if (j) await this.finish(j);
  }
}

export function nativeKv(native: SafNative): KeyValueStore {
  return {
    get: (k) => native.kvGet(k),
    set: (k, v) => native.kvSet(k, v),
    delete: async (k) => {
      await native.kvDelete(k);
    },
  };
}
