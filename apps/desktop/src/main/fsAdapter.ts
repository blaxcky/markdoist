// Desktop-Speicheradapter (Plan 7.1, 7.3): atomares Ersetzen über Temp-Datei + rename,
// exklusive Neuanlage über link(), dauerhaftes Operationsjournal im App-Datenverzeichnis.
import { createHash, randomUUID } from "node:crypto";
import { constants as FS } from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import type {
  FileMeta,
  ReadResult,
  RecoveryCase,
  Scope,
  StorageAdapter,
  WriteResult,
} from "@markdoist/app";

export const TRASH_DIR = ".todo-trash";
const TMP_PREFIX = ".markdoist-";
const TMP_SUFFIX = ".todo-tmp";
/** Abgeschlossene Journal-Fassungen bleiben mindestens so lange als lokale Sicherung. */
const KEEP_DONE_MS = 7 * 24 * 3600 * 1000;

type OpKind = RecoveryCase["kind"];
type Phase = "journaled" | "tmp-written" | "linked" | "replaced" | "done";

interface JournalEntry {
  opId: string;
  kind: OpKind;
  folder: string;
  /** Quelle (relativ: tasks/… oder trash/…) */
  src: string;
  /** Ziel (relativ) */
  dst: string;
  beforeHash: string | null;
  beforeText: string | null;
  desired: string | null;
  desiredHash: string | null;
  tmp: string | null;
  phase: Phase;
  createdAt: number;
}

/** Testhaken: wird vor jeder Phase aufgerufen; Werfen simuliert einen Prozessabbruch. */
export type PhaseHook = (kind: OpKind, phase: string) => void;

export class CrashSimulation extends Error {}

function sha(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const lossy = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

function errCode(e: unknown): string | undefined {
  return (e as NodeJS.ErrnoException)?.code;
}

function mapError(e: unknown): WriteResult {
  const code = errCode(e);
  const message = e instanceof Error ? e.message : String(e);
  if (code === "ENOSPC" || code === "EDQUOT") return { status: "full", message };
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") return { status: "permission", message };
  if (code === "ENOENT") return { status: "missing", message };
  if (code === "EEXIST") return { status: "exists", message };
  return { status: "unknown", message };
}

export class FsAdapter implements StorageAdapter {
  constructor(
    readonly root: string,
    private readonly journalDir: string,
    private readonly hook: PhaseHook = () => {},
  ) {}

  // ---------------------------------------------------------------- Pfade

  private dir(scope: Scope) {
    return scope === "tasks" ? this.root : join(this.root, TRASH_DIR);
  }

  /** Prüft Referenz und Zugehörigkeit zum gewählten Ordner (7.1 Ordnergrenze). */
  private resolve(ref: string): { scope: Scope; name: string; path: string } {
    const i = ref.indexOf("/");
    const scope = ref.slice(0, i) as Scope;
    const name = ref.slice(i + 1);
    if ((scope !== "tasks" && scope !== "trash") || !name || name.includes("/") || name === "." || name === "..") {
      throw Object.assign(new Error(`Ungültige Referenz ${ref}`), { code: "EINVAL" });
    }
    return { scope, name, path: join(this.dir(scope), name) };
  }

  private async fsyncDir(dir: string) {
    const h = await fs.open(dir, FS.O_RDONLY);
    try {
      await h.sync();
    } finally {
      await h.close();
    }
  }

  private async writeDurable(path: string, data: string, flag = "w") {
    const h = await fs.open(path, flag, 0o644);
    try {
      await h.writeFile(data, "utf8");
      await h.sync();
    } finally {
      await h.close();
    }
  }

  // ---------------------------------------------------------------- Journal

  private journalPath(opId: string) {
    return join(this.journalDir, `${opId}.json`);
  }

  private async journal(e: JournalEntry) {
    await fs.mkdir(this.journalDir, { recursive: true });
    const p = this.journalPath(e.opId);
    const tmp = `${p}.tmp`;
    await this.writeDurable(tmp, JSON.stringify(e));
    await fs.rename(tmp, p);
    await this.fsyncDir(this.journalDir);
  }

  private async finish(e: JournalEntry) {
    e.phase = "done";
    await this.journal(e);
  }

  private async newEntry(
    kind: OpKind,
    src: string,
    dst: string,
    before: { text: string; hash: string } | null,
    desired: string | null,
  ): Promise<JournalEntry> {
    const opId = `${Date.now().toString(36)}-${randomUUID()}`;
    const e: JournalEntry = {
      opId,
      kind,
      folder: this.root,
      src,
      dst,
      beforeHash: before?.hash ?? null,
      beforeText: before?.text ?? null,
      desired,
      desiredHash: desired === null ? null : sha(desired),
      tmp: null,
      phase: "journaled",
      createdAt: Date.now(),
    };
    this.hook(kind, "before-journal");
    await this.journal(e);
    return e;
  }

  // ---------------------------------------------------------------- Lesen

  async list(scope: Scope): Promise<FileMeta[]> {
    let entries;
    try {
      entries = await fs.readdir(this.dir(scope), { withFileTypes: true });
    } catch (e) {
      if (scope === "trash" && errCode(e) === "ENOENT") return [];
      throw e;
    }
    const out: FileMeta[] = [];
    for (const d of entries) {
      // Nur reguläre Dateien der obersten Ebene; keine Symlinks, keine versteckten Einträge.
      if (!d.isFile() || d.name.startsWith(".")) continue;
      try {
        const st = await fs.lstat(join(this.dir(scope), d.name));
        out.push({ name: d.name, ref: `${scope}/${d.name}`, mtime: st.mtimeMs, size: st.size });
      } catch {
        /* zwischenzeitlich verschwunden */
      }
    }
    return out;
  }

  private async readRaw(path: string): Promise<{ buf: Buffer; hash: string }> {
    const buf = await fs.readFile(path);
    return { buf, hash: sha(buf) };
  }

  async read(ref: string): Promise<ReadResult> {
    const { path } = this.resolve(ref);
    const st = await fs.lstat(path);
    if (st.isSymbolicLink()) throw new Error("Symlinks werden nicht verfolgt");
    const { buf, hash } = await this.readRaw(path);
    try {
      return { text: decoder.decode(buf), hash, mtime: st.mtimeMs };
    } catch {
      return { text: lossy.decode(buf), hash, mtime: st.mtimeMs, invalidUtf8: true };
    }
  }

  private async currentHash(path: string): Promise<string | null> {
    try {
      return (await this.readRaw(path)).hash;
    } catch (e) {
      if (errCode(e) === "ENOENT") return null;
      throw e;
    }
  }

  // ---------------------------------------------------------------- Schreiben

  async write(ref: string, text: string, expectedHash: string): Promise<WriteResult> {
    let e: JournalEntry | null = null;
    try {
      const { path } = this.resolve(ref);
      const cur = await fs.readFile(path).catch((err) => {
        if (errCode(err) === "ENOENT") return null;
        throw err;
      });
      if (cur === null) return { status: "missing", message: ref };
      if (sha(cur) !== expectedHash) return { status: "conflict", currentHash: sha(cur) };
      e = await this.newEntry("write", ref, ref, { text: cur.toString("utf8"), hash: expectedHash }, text);
      const tmp = join(this.root, `${TMP_PREFIX}${e.opId.slice(-12)}${TMP_SUFFIX}`);
      e.tmp = tmp;
      this.hook("write", "before-tmp");
      await this.writeDurable(tmp, text, "wx");
      e.phase = "tmp-written";
      await this.journal(e);
      // Ziel-Hash unmittelbar vor dem Ersetzen erneut prüfen.
      const now = await this.currentHash(path);
      if (now !== expectedHash) {
        await fs.unlink(tmp).catch(() => {});
        await this.finish(e);
        return { status: "conflict", currentHash: now };
      }
      this.hook("write", "before-rename");
      await fs.rename(tmp, path);
      await this.fsyncDir(this.root);
      this.hook("write", "after-rename");
      e.phase = "replaced";
      const after = await this.currentHash(path);
      if (after === null || after !== e.desiredHash) return { status: "unknown", message: "Nachher-Hash weicht ab" };
      await this.finish(e);
      return { status: "ok", ref, name: this.resolve(ref).name, hash: after };
    } catch (err) {
      if (err instanceof CrashSimulation) throw err;
      if (e && e.tmp) await fs.unlink(e.tmp).catch(() => {});
      if (e) await this.finish(e).catch(() => {});
      return mapError(err);
    }
  }

  /** Exklusiv: link() scheitert, wenn das Ziel existiert; nie eine vorhandene Datei ersetzen. */
  async create(name: string, text: string): Promise<WriteResult> {
    let e: JournalEntry | null = null;
    try {
      const ref = `tasks/${name}`;
      const { path } = this.resolve(ref);
      e = await this.newEntry("create", ref, ref, null, text);
      const tmp = join(this.root, `${TMP_PREFIX}${e.opId.slice(-12)}${TMP_SUFFIX}`);
      e.tmp = tmp;
      await this.writeDurable(tmp, text, "wx");
      e.phase = "tmp-written";
      await this.journal(e);
      this.hook("create", "before-link");
      try {
        await fs.link(tmp, path);
      } catch (err) {
        await fs.unlink(tmp).catch(() => {});
        await this.finish(e);
        if (errCode(err) === "EEXIST") return { status: "exists", message: name };
        throw err;
      }
      this.hook("create", "after-link");
      await fs.unlink(tmp);
      await this.fsyncDir(this.root);
      await this.finish(e);
      return { status: "ok", ref, name, hash: sha(text) };
    } catch (err) {
      if (err instanceof CrashSimulation) throw err;
      if (e?.tmp) await fs.unlink(e.tmp).catch(() => {});
      if (e) await this.finish(e).catch(() => {});
      return mapError(err);
    }
  }

  private async freeName(scope: Scope, name: string): Promise<string> {
    let existing: Set<string>;
    try {
      existing = new Set((await fs.readdir(this.dir(scope))).map((n) => n.toLowerCase()));
    } catch {
      existing = new Set();
    }
    if (!existing.has(name.toLowerCase())) return name;
    const m = /^(.*?)(\.md)?$/i.exec(name)!;
    for (let n = 2; n < 10000; n++) {
      const c = `${m[1]} ${n}${m[2] ?? ""}`;
      if (!existing.has(c.toLowerCase())) return c;
    }
    throw new Error("Kein freier Name");
  }

  /** Verschieben über link (exklusiv) + Prüfung + unlink der Quelle. */
  private async move(kind: OpKind, ref: string, toScope: Scope, expectedHash: string, newName?: string): Promise<WriteResult> {
    let e: JournalEntry | null = null;
    try {
      const src = this.resolve(ref);
      if (toScope === "trash") await fs.mkdir(this.dir("trash"), { recursive: true });
      const cur = await fs.readFile(src.path).catch((err) => {
        if (errCode(err) === "ENOENT") return null;
        throw err;
      });
      if (cur === null) return { status: "missing", message: ref };
      if (sha(cur) !== expectedHash) return { status: "conflict", currentHash: sha(cur) };
      const name = newName ?? (await this.freeName(toScope, src.name));
      const dstRef = `${toScope}/${name}`;
      const dst = this.resolve(dstRef);
      e = await this.newEntry(kind, ref, dstRef, { text: cur.toString("utf8"), hash: expectedHash }, null);
      this.hook(kind, "before-link");
      try {
        await fs.link(src.path, dst.path);
      } catch (err) {
        await this.finish(e);
        if (errCode(err) === "EEXIST") return { status: "exists", message: name };
        throw err;
      }
      e.phase = "linked";
      await this.journal(e);
      this.hook(kind, "after-link");
      // Quelle erneut prüfen, erst dann löschen.
      const again = await this.currentHash(src.path);
      if (again !== expectedHash) {
        await fs.unlink(dst.path).catch(() => {});
        await this.finish(e);
        return { status: "conflict", currentHash: again };
      }
      await fs.unlink(src.path);
      await this.fsyncDir(this.dir(src.scope));
      await this.fsyncDir(this.dir(toScope));
      await this.finish(e);
      return { status: "ok", ref: dstRef, name, hash: expectedHash };
    } catch (err) {
      if (err instanceof CrashSimulation) throw err;
      if (e) await this.finish(e).catch(() => {});
      return mapError(err);
    }
  }

  moveToTrash(ref: string, expectedHash: string) {
    return this.move("trash", ref, "trash", expectedHash);
  }

  restoreFromTrash(ref: string, expectedHash: string) {
    return this.move("restore", ref, "tasks", expectedHash);
  }

  rename(ref: string, newName: string, expectedHash: string) {
    return this.move("rename", ref, "tasks", expectedHash, newName);
  }

  async deletePermanently(ref: string, expectedHash: string): Promise<WriteResult> {
    try {
      const { path } = this.resolve(ref);
      const cur = await fs.readFile(path);
      if (sha(cur) !== expectedHash) return { status: "conflict", currentHash: sha(cur) };
      const e = await this.newEntry("delete", ref, ref, { text: cur.toString("utf8"), hash: expectedHash }, null);
      await fs.unlink(path);
      await this.fsyncDir(this.dir(this.resolve(ref).scope));
      await this.finish(e);
      return { status: "ok", ref, name: this.resolve(ref).name, hash: expectedHash };
    } catch (err) {
      if (err instanceof CrashSimulation) throw err;
      return mapError(err);
    }
  }

  // ---------------------------------------------------------------- Wiederherstellung

  private async entries(): Promise<JournalEntry[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.journalDir);
    } catch {
      return [];
    }
    const out: JournalEntry[] = [];
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      try {
        const e = JSON.parse(await fs.readFile(join(this.journalDir, n), "utf8")) as JournalEntry;
        if (e.folder === this.root) out.push(e);
      } catch {
        /* unlesbarer Eintrag bleibt liegen */
      }
    }
    return out;
  }

  private async readText(rel: string): Promise<{ text: string; hash: string } | null> {
    try {
      const { buf, hash } = await this.readRaw(this.resolve(rel).path);
      return { text: buf.toString("utf8"), hash };
    } catch (e) {
      if (errCode(e) === "ENOENT") return null;
      throw e;
    }
  }

  /** Offene Vorgänge klären (7.3). Eindeutige Fälle werden abgeschlossen, unklare zurückgegeben. */
  async recover(): Promise<RecoveryCase[]> {
    const cases: RecoveryCase[] = [];
    for (const e of await this.entries()) {
      if (e.phase === "done") {
        if (Date.now() - e.createdAt > KEEP_DONE_MS) await fs.unlink(this.journalPath(e.opId)).catch(() => {});
        continue;
      }
      const caseOf = (current: string | null, message: string): RecoveryCase => ({
        opId: e.opId,
        kind: e.kind,
        ref: e.dst,
        name: this.resolve(e.dst).name,
        before: e.beforeText,
        desired: e.desired,
        current,
        message,
      });
      // Temp-Datei: Inhalt ist im Journal gesichert und darf entfernt werden.
      const cleanTmp = async () => {
        if (e.tmp) await fs.unlink(e.tmp).catch(() => {});
      };
      if (e.kind === "write") {
        const cur = await this.readText(e.dst);
        if (cur && cur.hash === e.desiredHash) {
          await cleanTmp();
          await this.finish(e);
        } else if (cur && cur.hash === e.beforeHash) {
          await cleanTmp();
          cases.push(caseOf(cur.text, "Änderung wurde nicht gespeichert – erneut speichern?"));
        } else {
          await cleanTmp();
          cases.push(caseOf(cur?.text ?? null, cur ? "Datei hat einen dritten Inhalt" : "Datei fehlt"));
        }
      } else if (e.kind === "create") {
        const cur = await this.readText(e.dst);
        await cleanTmp();
        if (cur && cur.hash === e.desiredHash) await this.finish(e);
        else cases.push(caseOf(cur?.text ?? null, "Neuanlage wurde nicht abgeschlossen"));
      } else if (e.kind === "delete") {
        const cur = await this.readText(e.src);
        if (!cur) await this.finish(e);
        else cases.push(caseOf(cur.text, "Endgültiges Löschen wurde nicht abgeschlossen"));
      } else {
        // trash / restore / rename: link + unlink
        const src = await this.readText(e.src);
        const dst = await this.readText(e.dst);
        if (src && dst && src.hash === e.beforeHash && dst.hash === e.beforeHash) {
          // Abbruch zwischen Kopie und Löschen: nicht erneut kopieren, Quelle nach Prüfung entfernen.
          await fs.unlink(this.resolve(e.src).path);
          await this.finish(e);
        } else if (!src && dst && dst.hash === e.beforeHash) {
          await this.finish(e);
        } else if (src && !dst && src.hash === e.beforeHash) {
          await this.finish(e); // nichts geschehen
        } else {
          cases.push(caseOf(dst?.text ?? src?.text ?? null, "Verschieben unklar – beide Orte prüfen"));
        }
      }
    }
    return cases;
  }

  async resolveRecovery(opId: string): Promise<void> {
    const e = (await this.entries()).find((x) => x.opId === opId);
    if (e) await this.finish(e);
  }

  // ---------------------------------------------------------------- Überwachung

  watch(onChange: (overflow: boolean) => void): () => void {
    let timer: NodeJS.Timeout | null = null;
    let closed = false;
    let watcher: { close(): Promise<void> } | null = null;
    const fire = (overflow: boolean) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChange(overflow), overflow ? 0 : 250);
    };
    void import("chokidar").then(({ watch }) => {
      if (closed) return;
      const w = watch(this.root, {
        depth: 0,
        ignoreInitial: true,
        followSymlinks: false,
        ignored: (p: string) => {
          const base = p.split("/").pop() ?? "";
          return p !== this.root && base.startsWith(".");
        },
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      });
      w.on("all", () => fire(false));
      w.on("error", () => fire(true));
      watcher = w;
    });
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      void watcher?.close();
    };
  }
}
