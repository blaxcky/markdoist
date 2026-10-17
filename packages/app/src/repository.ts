// Index, Abgleich und Schreibpfad über einem StorageAdapter (Plan 7.1, 7.3, 4.4, 7.6).
import {
  actionDependencies,
  adoptFileText,
  applyPlan,
  buildIndex,
  deepEqual,
  fileNameForTitle,
  freeName,
  newTaskText,
  planAction,
  readTaskFile,
  sanitizeTitle,
  ulid,
  type ActionContext,
  type Clock,
  type Index,
  type IndexedFile,
  type NewTaskInput,
  type Plan,
  type Task,
  type TaskAction,
  type YamlValue,
} from "@markdoist/core";
import type { FileMeta, KeyValueStore, ReadResult, RecoveryCase, StorageAdapter, WriteResult } from "./storage";
import { writeResultMessage } from "./texts";

export type Outcome =
  | { status: "ok"; message?: string; ref?: string }
  | { status: "noop" }
  | { status: "blocked"; message: string }
  | { status: "conflict"; message: string; ref: string; mine?: string; theirs?: string }
  | { status: "error"; message: string };

export interface UndoEntry {
  id: string;
  kind: "edit" | "create" | "trash" | "restore" | "rename";
  label: string;
  /** Referenz nach der Aktion */
  ref: string;
  /** Hash nach der Aktion */
  afterHash: string;
  /** exakter Inhalt vor der Aktion (bei edit) */
  beforeText?: string;
  /** Name vor der Aktion (rename) */
  beforeName?: string;
}

export interface Draft {
  folder: string;
  ref: string;
  id: string | null;
  baseHash: string;
  baseText: string;
  text: string;
  updatedAt: number;
}

export interface RepoState {
  index: Index;
  files: Map<string, IndexedFile>;
  trash: FileMeta[];
  /** true, solange angezeigte Daten noch nicht vollständig gegen die Dateien geprüft sind */
  unverified: boolean;
  scanning: boolean;
  /** letzter Fehler beim Einlesen; Index bleibt dann veraltet und schreibgeschützt */
  readError: string | null;
  undo: UndoEntry[];
  recovery: RecoveryCase[];
  drafts: Draft[];
  /** Kennzahlen des letzten Abgleichs (Anzeige und Leistungsmessung, M7) */
  lastScan: { files: number; read: number; ms: number; full: boolean; readMs: number; parseMs: number } | null;
  /** Dauer bis zur Anzeige aus dem Cache beim Öffnen (ms), null ohne Cache */
  cacheLoadMs: number | null;
  /** Fortschritt eines laufenden Abgleichs */
  scanProgress: { done: number; total: number } | null;
}

const UNDO_LIMIT = 50;
const MAX_ATTEMPTS = 3;

export interface RepositoryOptions {
  adapter: StorageAdapter;
  kv: KeyValueStore;
  /** Ordneridentität (für Entwürfe, Undo und Cache) */
  folder: string;
  clock: () => Clock;
  random?: (bytes: Uint8Array) => void;
  batchSize?: number;
}

/** Map, die jede Änderung zählt – damit der Index nur bei geänderten Dateien neu entsteht. */
class TrackedMap<K, V> extends Map<K, V> {
  version = 0;
  override set(k: K, v: V) {
    this.version++;
    return super.set(k, v);
  }
  override delete(k: K) {
    this.version++;
    return super.delete(k);
  }
  override clear() {
    this.version++;
    super.clear();
  }
}

export class Repository {
  private readonly adapter: StorageAdapter;
  private readonly kv: KeyValueStore;
  readonly folder: string;
  private readonly clock: () => Clock;
  private readonly random?: (bytes: Uint8Array) => void;
  private readonly batchSize: number;
  private files = new TrackedMap<string, IndexedFile>();
  private indexCache: { version: number; clockTick: number; index: Index } | null = null;
  private clockTick = 0;
  private progressOnly = false;
  private metas = new Map<string, FileMeta>();
  private trash: FileMeta[] = [];
  private undoStack: UndoEntry[] = [];
  private recovery: RecoveryCase[] = [];
  private drafts: Draft[] = [];
  private unverified = true;
  private scanning: Promise<void> | null = null;
  private readError: string | null = null;
  private lastScan: RepoState["lastScan"] = null;
  private scanProgress: RepoState["scanProgress"] = null;
  private cacheLoadMs: number | null = null;
  private scanCancelled = false;
  private listeners = new Set<() => void>();
  private queues = new Map<string, Promise<unknown>>();
  /** Generation je Datei: Undo/Ordnerwechsel machen wartende Aufträge ungültig */
  private generations = new Map<string, number>();
  private closed = false;
  private state: RepoState;

  constructor(opts: RepositoryOptions) {
    this.adapter = opts.adapter;
    this.kv = opts.kv;
    this.folder = opts.folder;
    this.clock = opts.clock;
    this.random = opts.random;
    this.batchSize = opts.batchSize ?? 50;
    this.state = this.snapshot();
  }

  // -------------------------------------------------------------------------
  // Zustand

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getState(): RepoState {
    return this.state;
  }

  private currentIndex(): Index {
    const c = this.indexCache;
    if (c && c.version === this.files.version && c.clockTick === this.clockTick) return c.index;
    // Reine Fortschrittsmeldungen eines Abgleichs bauen den Index nicht neu auf.
    if (c && this.progressOnly) return c.index;
    const index = buildIndex([...this.files.values()], this.clock());
    this.indexCache = { version: this.files.version, clockTick: this.clockTick, index };
    return index;
  }

  private snapshot(): RepoState {
    return {
      index: this.currentIndex(),
      files: new Map(this.files),
      trash: [...this.trash],
      unverified: this.unverified,
      scanning: this.scanning !== null,
      readError: this.readError,
      undo: [...this.undoStack],
      recovery: [...this.recovery],
      drafts: [...this.drafts],
      lastScan: this.lastScan,
      scanProgress: this.scanProgress,
      cacheLoadMs: this.cacheLoadMs,
    };
  }

  private emit() {
    this.state = this.snapshot();
    for (const l of this.listeners) l();
  }

  /** Neu auswerten, z. B. bei Mitternacht oder Zeitzonenwechsel (3.3). */
  refreshClock() {
    this.clockTick++;
    this.emit();
  }

  private newId = () => ulid(this.clock().now().epochMilliseconds, this.random);

  private ctx(): ActionContext {
    const c = this.clock();
    return { at: c.now(), timeZone: c.timeZone, newId: this.newId };
  }

  private key(k: string) {
    return `${this.folder}:${k}`;
  }

  // -------------------------------------------------------------------------
  // Start, Cache, Wiederherstellung

  /** Lädt Cache, Undo und Entwürfe; klärt offene Vorgänge; startet den vollständigen Abgleich. */
  async open(): Promise<void> {
    const t0 = Date.now();
    await this.loadCache();
    if (this.files.size) {
      this.emit(); // Anzeige aus dem Cache, noch als ungeprüft markiert
      this.cacheLoadMs = Date.now() - t0;
    }
    try {
      this.undoStack = JSON.parse((await this.kv.get(this.key("undo"))) ?? "[]");
    } catch {
      this.undoStack = [];
    }
    await this.loadDrafts();
    this.recovery = await this.adapter.recover();
    this.emit();
    await this.scan();
  }

  close() {
    this.closed = true;
    for (const k of this.generations.keys()) this.bump(k);
  }

  private async loadCache() {
    try {
      const raw = await this.kv.get(this.key("cache"));
      if (!raw) return;
      const entries = JSON.parse(raw) as {
        meta: FileMeta;
        text: string;
        hash: string;
        parsed?: { data: Record<string, YamlValue>; hasAnchors: boolean };
      }[];
      for (const e of entries) {
        this.metas.set(e.meta.ref, e.meta);
        this.files.set(
          e.meta.ref,
          readTaskFile({ ref: e.meta.ref, name: e.meta.name, text: e.text, hash: e.hash, mtime: e.meta.mtime, preParsed: e.parsed }),
        );
      }
      this.unverified = true;
    } catch {
      // Defekter Cache ist jederzeit aus den Dateien rekonstruierbar.
      this.files.clear();
      this.metas.clear();
    }
  }

  private async saveCache() {
    const entries = [...this.files.values()].map((f) => ({
      meta: this.metas.get(f.ref) ?? { name: f.name, ref: f.ref, mtime: f.mtime, size: null },
      text: f.text,
      hash: f.hash,
      ...(f.kind === "task" ? { parsed: { data: f.data, hasAnchors: f.hasAnchors } } : {}),
    }));
    try {
      await this.kv.set(this.key("cache"), JSON.stringify(entries));
    } catch {
      /* Cache ist nur eine Beschleunigung */
    }
  }

  async resolveRecovery(opId: string) {
    await this.adapter.resolveRecovery(opId);
    this.recovery = this.recovery.filter((r) => r.opId !== opId);
    this.emit();
    await this.scan();
  }

  // -------------------------------------------------------------------------
  // Einlesen (7.1) – schreibt nie

  scan(opts: { full?: boolean } = {}): Promise<void> {
    if (this.scanning) return this.scanning;
    this.scanCancelled = false;
    this.scanning = this.doScan(opts.full ?? true).finally(() => {
      this.scanning = null;
      this.scanProgress = null;
      this.emit();
    });
    this.emit();
    return this.scanning;
  }

  private async doScan(full: boolean) {
    const t0 = Date.now();
    let metas: FileMeta[];
    try {
      metas = (await this.adapter.list("tasks")).filter(isTaskFileName);
    } catch (e) {
      // Fehler sind keine Löschungen: letzter Stand bleibt sichtbar.
      this.readError = `Ordner konnte nicht gelesen werden: ${errMessage(e)}`;
      return;
    }
    try {
      this.trash = (await this.adapter.list("trash")).filter((m) => m.name.toLowerCase().endsWith(".md"));
    } catch {
      /* Papierkorb fehlt oder ist nicht lesbar */
    }
    const seen = new Set<string>();
    const toRead: FileMeta[] = [];
    for (const m of metas) {
      seen.add(m.ref);
      const old = this.metas.get(m.ref);
      const known = this.files.get(m.ref);
      const changed =
        !old || !known || m.mtime === null || m.size === null || old.mtime !== m.mtime || old.size !== m.size;
      if (full || changed) toRead.push(m);
      else this.metas.set(m.ref, m);
    }
    let readFailures = 0;
    let readMs = 0;
    let parseMs = 0;
    this.scanProgress = { done: 0, total: toRead.length };
    for (let i = 0; i < toRead.length; i += this.batchSize) {
      if (this.closed) return;
      if (this.scanCancelled) {
        // Abgebrochen: nichts entfernen, Anzeige bleibt als ungeprüft markiert.
        this.readError = "Abgleich abgebrochen – Anzeige ist nicht vollständig geprüft";
        return;
      }
      const batch = toRead.slice(i, i + this.batchSize);
      const tRead = Date.now();
      // Stapelweise lesen, wenn der Adapter das kann (SAF: ein Native-Aufruf je Stapel).
      const results: (ReadResult | null)[] = this.adapter.readMany
        ? await this.adapter.readMany(batch.map((m) => m.ref))
        : await Promise.all(batch.map((m) => this.adapter.read(m.ref).catch(() => null)));
      readMs += Date.now() - tRead;
      const tParse = Date.now();
      batch.forEach((m, j) => {
        const r = results[j];
        if (!r) {
          readFailures++;
          return;
        }
        const mtime = r.mtime ?? m.mtime;
        this.metas.set(m.ref, { ...m, mtime });
        this.files.set(
          m.ref,
          readTaskFile({ ref: m.ref, name: m.name, text: r.text, hash: r.hash, mtime, invalidUtf8: r.invalidUtf8 }),
        );
      });
      parseMs += Date.now() - tParse;
      this.scanProgress = { done: Math.min(i + this.batchSize, toRead.length), total: toRead.length };
      if (toRead.length > this.batchSize) {
        this.progressOnly = true;
        try {
          this.emit();
        } finally {
          this.progressOnly = false;
        }
      }
    }
    for (const ref of [...this.files.keys()]) {
      if (!seen.has(ref)) {
        this.files.delete(ref);
        this.metas.delete(ref);
      }
    }
    this.readError = readFailures ? `${readFailures} Datei(en) konnten nicht gelesen werden` : null;
    if (full && !readFailures) this.unverified = false;
    this.lastScan = { files: metas.length, read: toRead.length, ms: Date.now() - t0, full, readMs, parseMs };
    await this.saveCache();
  }

  /** Laufenden Abgleich abbrechen (7.1). */
  cancelScan() {
    this.scanCancelled = true;
  }

  // -------------------------------------------------------------------------
  // Serialisierung je Datei

  private bump(ref: string) {
    this.generations.set(ref, (this.generations.get(ref) ?? 0) + 1);
  }

  private enqueue<T>(ref: string, job: () => Promise<T>): Promise<T | Outcome> {
    const gen = this.generations.get(ref) ?? 0;
    const prev = this.queues.get(ref) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        if (this.closed) return { status: "blocked", message: "Ordner wurde gewechselt" } as Outcome;
        if ((this.generations.get(ref) ?? 0) !== gen) {
          return { status: "blocked", message: "Auftrag verworfen (Undo oder Ordnerwechsel)" } as Outcome;
        }
        return job();
      });
    this.queues.set(ref, next);
    return next;
  }

  // -------------------------------------------------------------------------
  // Aktionen

  findTask(key: string): Task | null {
    for (const f of this.files.values()) if (f.kind === "task" && (f.key === key || f.ref === key)) return f;
    return null;
  }

  perform(ref: string, action: TaskAction, label = "Änderung"): Promise<Outcome> {
    return this.enqueue(ref, () => this.doPerform(ref, action, label)) as Promise<Outcome>;
  }

  private async doPerform(ref: string, action: TaskAction, label: string): Promise<Outcome> {
    if (this.readError && this.unverified) return { status: "blocked", message: "Ordner nicht erreichbar – schreibgeschützt" };
    const current = this.files.get(ref);
    if (!current || current.kind !== "task") return { status: "error", message: "Aufgabe nicht gefunden" };
    const ctx = this.ctx(); // fester Aktionszeitpunkt, auch für Wiederholungen
    let base: Task = current;
    let plan: Plan = planAction(base, action, ctx);
    if (plan.kind === "noop") return { status: "noop" };
    if (plan.kind === "blocked") return { status: "blocked", message: plan.message };
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Direkt vor dem Schreiben erneut lesen (7.3).
      let fresh;
      try {
        fresh = await this.adapter.read(ref);
      } catch (e) {
        await this.scan({ full: false });
        return { status: "error", message: `Datei nicht mehr vorhanden oder nicht lesbar: ${errMessage(e)}` };
      }
      if (fresh.hash !== base.hash) {
        const ft = readTaskFile({ ref, name: base.name, text: fresh.text, hash: fresh.hash, mtime: fresh.mtime });
        if (ft.kind !== "task") {
          this.files.set(ref, ft);
          this.emit();
          return { status: "conflict", ref, message: "Datei wurde extern ungültig geändert" };
        }
        const plan2 = planAction(ft, action, ctx);
        const deps = actionDependencies(action, plan);
        const independent =
          deps.fields.every((k) => deepEqual(base.data[k], ft.data[k])) && (!deps.body || base.body === ft.body);
        this.files.set(ref, ft);
        if (plan2.kind === "noop") {
          this.emit();
          return { status: "noop" };
        }
        if (!independent || plan2.kind === "blocked") {
          this.emit();
          return {
            status: "conflict",
            ref,
            message: "Die Datei wurde inzwischen geändert – Änderung nicht übernommen",
            theirs: fresh.text,
          };
        }
        base = ft;
        plan = plan2;
      }
      const applied = applyPlan(base.text, plan);
      if (!applied.ok) return { status: "error", message: `Selbstprüfung fehlgeschlagen: ${applied.message}` };
      const res = await this.adapter.write(ref, applied.text, base.hash);
      if (res.status === "ok") {
        this.setFile(ref, base.name, applied.text, res.hash);
        await this.pushUndo({ id: this.newId(), kind: "edit", label, ref, afterHash: res.hash, beforeText: base.text });
        this.emit();
        return { status: "ok", ...(plan.kind === "edit" && plan.note ? { message: plan.note } : {}) };
      }
      if (res.status === "conflict") continue; // erneut lesen und prüfen
      return { status: "error", message: writeResultMessage(res) };
    }
    return { status: "conflict", ref, message: "Datei ändert sich laufend – bitte erneut versuchen" };
  }

  private setFile(ref: string, name: string, text: string, hash: string) {
    const mtime = Date.now();
    this.files.set(ref, readTaskFile({ ref, name, text, hash, mtime }));
    this.metas.set(ref, { ref, name, mtime: null, size: null }); // unbekannt → nächster Abgleich liest
  }

  /** Neue Eingangsaufgabe (4.1). Übernimmt keinen Termin aus der Ansicht. */
  async create(input: NewTaskInput): Promise<Outcome> {
    if (!input.title.trim()) return { status: "blocked", message: "Titel fehlt" };
    const ctx = this.ctx();
    const { id, text } = newTaskText(input, ctx);
    const names = new Set([...this.files.values()].map((f) => f.name.toLowerCase()));
    for (let attempt = 0; attempt < 5; attempt++) {
      const name = fileNameForTitle(input.title, (n) => names.has(n.toLowerCase()), id.slice(-6));
      const res = await this.adapter.create(name, text);
      if (res.status === "ok") {
        this.setFile(res.ref, res.name, text, res.hash);
        await this.pushUndo({ id: this.newId(), kind: "create", label: "Neue Aufgabe", ref: res.ref, afterHash: res.hash });
        this.emit();
        return { status: "ok", ref: res.ref };
      }
      if (res.status === "exists") {
        names.add(name.toLowerCase());
        continue;
      }
      return { status: "error", message: writeResultMessage(res) };
    }
    return { status: "error", message: "Kein freier Dateiname" };
  }

  /** „Als Aufgabe übernehmen“ für eine Datei ohne Frontmatter (3.1). */
  adopt(ref: string): Promise<Outcome> {
    return this.enqueue(ref, async () => {
      const f = this.files.get(ref);
      if (!f || f.kind !== "unrecognized") return { status: "blocked", message: "Datei ist keine unerkannte Datei" };
      const text = adoptFileText(f.name, f.text, this.ctx());
      const res = await this.adapter.write(ref, text, f.hash);
      if (res.status !== "ok") return { status: "error", message: writeResultMessage(res) };
      this.setFile(ref, f.name, text, res.hash);
      await this.pushUndo({ id: this.newId(), kind: "edit", label: "Als Aufgabe übernommen", ref, afterHash: res.hash, beforeText: f.text });
      this.emit();
      return { status: "ok" };
    }) as Promise<Outcome>;
  }

  /** Löschen = in den Papierkorb (4.4). */
  moveToTrash(ref: string): Promise<Outcome> {
    return this.enqueue(ref, async () => {
      const f = this.files.get(ref);
      if (!f) return { status: "error", message: "Datei nicht gefunden" };
      const res = await this.adapter.moveToTrash(ref, f.hash);
      if (res.status !== "ok") return this.failed(res);
      this.files.delete(ref);
      this.metas.delete(ref);
      this.bump(ref);
      await this.pushUndo({ id: this.newId(), kind: "trash", label: "Gelöscht", ref: res.ref, afterHash: res.hash });
      await this.refreshTrash();
      this.emit();
      return { status: "ok", ref: res.ref };
    }) as Promise<Outcome>;
  }

  async restoreFromTrash(trashRef: string): Promise<Outcome> {
    let read;
    try {
      read = await this.adapter.read(trashRef);
    } catch (e) {
      return { status: "error", message: errMessage(e) };
    }
    const res = await this.adapter.restoreFromTrash(trashRef, read.hash);
    if (res.status !== "ok") return this.failed(res);
    this.setFile(res.ref, res.name, read.text, res.hash);
    await this.pushUndo({ id: this.newId(), kind: "restore", label: "Wiederhergestellt", ref: res.ref, afterHash: res.hash });
    await this.refreshTrash();
    this.emit();
    return { status: "ok", ref: res.ref };
  }

  /** „Papierkorb leeren“: nur die bestätigten Dateien mit unverändertem Hash (7.3). Kein Undo. */
  async emptyTrash(confirmed: { ref: string; hash: string }[]): Promise<Outcome> {
    let failed = 0;
    for (const c of confirmed) {
      const res = await this.adapter.deletePermanently(c.ref, c.hash);
      if (res.status !== "ok") failed++;
    }
    await this.refreshTrash();
    this.emit();
    return failed
      ? { status: "error", message: `${failed} Datei(en) wurden inzwischen geändert und nicht gelöscht` }
      : { status: "ok" };
  }

  async trashHashes(): Promise<{ ref: string; name: string; hash: string }[]> {
    const out = [];
    for (const m of this.trash) {
      try {
        const r = await this.adapter.read(m.ref);
        out.push({ ref: m.ref, name: m.name, hash: r.hash });
      } catch {
        /* übersprungen */
      }
    }
    return out;
  }

  private async refreshTrash() {
    try {
      this.trash = (await this.adapter.list("trash")).filter((m) => m.name.toLowerCase().endsWith(".md"));
    } catch {
      /* ignorieren */
    }
  }

  /** „Dateinamen an Titel angleichen“ (3.1). */
  renameToTitle(ref: string): Promise<Outcome> {
    return this.enqueue(ref, async () => {
      const f = this.files.get(ref);
      if (!f || f.kind !== "task") return { status: "error", message: "Aufgabe nicht gefunden" };
      const desired = sanitizeTitle(f.fields.title);
      if (!desired) return { status: "blocked", message: "Titel ergibt keinen gültigen Dateinamen" };
      if (`${desired}.md` === f.name) return { status: "noop" };
      const names = new Set([...this.files.values()].filter((x) => x !== f).map((x) => x.name.toLowerCase()));
      const name = fileNameForTitle(f.fields.title, (n) => names.has(n.toLowerCase()), (f.fields.id ?? "x").slice(-6));
      if (name === f.name) return { status: "noop" };
      const res = await this.adapter.rename(ref, name, f.hash);
      if (res.status !== "ok") return this.failed(res);
      this.files.delete(ref);
      this.metas.delete(ref);
      this.bump(ref);
      this.setFile(res.ref, res.name, f.text, res.hash);
      await this.pushUndo({ id: this.newId(), kind: "rename", label: "Umbenannt", ref: res.ref, afterHash: res.hash, beforeName: f.name });
      this.emit();
      return { status: "ok", ref: res.ref };
    }) as Promise<Outcome>;
  }

  private failed(res: WriteResult): Outcome {
    if (res.status === "conflict") {
      void this.scan({ full: false });
      return { status: "conflict", ref: "", message: "Die Datei wurde inzwischen geändert" };
    }
    return { status: "error", message: writeResultMessage(res) };
  }

  // -------------------------------------------------------------------------
  // Konfliktvarianten (7.4)

  /** Ganze Variante behalten; die übrigen wandern nach geprüftem Abschluss in den Papierkorb. */
  async keepVariant(keepRef: string, discardRefs: string[]): Promise<Outcome> {
    const keep = this.files.get(keepRef);
    if (!keep) return { status: "error", message: "Variante nicht gefunden" };
    try {
      const k = await this.adapter.read(keepRef);
      if (k.hash !== keep.hash) return { status: "conflict", ref: keepRef, message: "Gewählte Variante wurde geändert" };
    } catch (e) {
      return { status: "error", message: errMessage(e) };
    }
    let failed = 0;
    for (const ref of discardRefs) {
      const f = this.files.get(ref);
      if (!f) continue;
      const res = await this.adapter.moveToTrash(ref, f.hash);
      if (res.status === "ok") {
        this.files.delete(ref);
        this.metas.delete(ref);
      } else failed++;
    }
    await this.refreshTrash();
    this.emit();
    return failed
      ? { status: "error", message: `${failed} Variante(n) blieben stehen, weil sie geändert wurden` }
      : { status: "ok" };
  }

  /** Beide behalten: die Kopie erhält ausdrücklich eine neue ID. */
  keepBoth(variantRef: string): Promise<Outcome> {
    return this.perform(variantRef, { type: "assignNewId" }, "Kopie mit neuer ID");
  }

  // -------------------------------------------------------------------------
  // Undo (4.4)

  private async pushUndo(e: UndoEntry) {
    this.undoStack.push(e);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.splice(0, this.undoStack.length - UNDO_LIMIT);
    await this.kv.set(this.key("undo"), JSON.stringify(this.undoStack));
  }

  async undo(): Promise<Outcome> {
    const e = this.undoStack[this.undoStack.length - 1];
    if (!e) return { status: "noop" };
    let current;
    try {
      current = await this.adapter.read(e.ref);
    } catch {
      return { status: "blocked", message: "Rückgängig nicht möglich: Datei fehlt" };
    }
    if (current.hash !== e.afterHash) {
      return { status: "blocked", message: "Rückgängig nicht möglich: Datei wurde seitdem geändert" };
    }
    this.bump(e.ref); // wartende Aufträge auf dieser Datei verwerfen
    let res: WriteResult;
    switch (e.kind) {
      case "edit":
        res = await this.adapter.write(e.ref, e.beforeText ?? "", e.afterHash);
        break;
      case "create":
        res = await this.adapter.moveToTrash(e.ref, e.afterHash);
        break;
      case "trash":
        res = await this.adapter.restoreFromTrash(e.ref, e.afterHash);
        break;
      case "restore":
        res = await this.adapter.moveToTrash(e.ref, e.afterHash);
        break;
      case "rename":
        res = await this.adapter.rename(e.ref, e.beforeName ?? "", e.afterHash);
        break;
    }
    if (res.status !== "ok") return this.failed(res);
    this.undoStack.pop();
    await this.kv.set(this.key("undo"), JSON.stringify(this.undoStack));
    await this.scan({ full: false });
    return { status: "ok", message: `Rückgängig: ${e.label}` };
  }

  // -------------------------------------------------------------------------
  // Lokale Entwürfe (7.6)

  private async loadDrafts() {
    try {
      this.drafts = JSON.parse((await this.kv.get(this.key("drafts"))) ?? "[]");
    } catch {
      this.drafts = [];
    }
  }

  private async saveDrafts() {
    await this.kv.set(this.key("drafts"), JSON.stringify(this.drafts));
  }

  /** Entwurf fortlaufend sichern, unabhängig vom späteren Dateischreiben. */
  async saveDraft(ref: string, text: string): Promise<void> {
    const f = this.files.get(ref);
    if (!f || f.kind !== "task") return;
    const existing = this.drafts.find((d) => d.ref === ref);
    if (existing) {
      existing.text = text;
      existing.updatedAt = Date.now();
    } else {
      this.drafts.push({ folder: this.folder, ref, id: f.fields.id, baseHash: f.hash, baseText: f.body, text, updatedAt: Date.now() });
    }
    await this.saveDrafts();
    this.emit();
  }

  async discardDraft(ref: string): Promise<void> {
    this.drafts = this.drafts.filter((d) => d.ref !== ref);
    await this.saveDrafts();
    this.emit();
  }

  /** Body aus Entwurf in die Datei schreiben; Entwurf bleibt bei Fehler/Konflikt erhalten. */
  async commitDraft(ref: string): Promise<Outcome> {
    const d = this.drafts.find((x) => x.ref === ref);
    if (!d) return { status: "noop" };
    const f = this.files.get(ref);
    if (!f || f.kind !== "task") {
      return { status: "conflict", ref, message: "Datei fehlt – Entwurf bleibt erhalten", mine: d.text };
    }
    if (f.hash !== d.baseHash && f.body !== d.baseText) {
      return { status: "conflict", ref, message: "Datei wurde extern geändert", mine: d.text, theirs: f.body };
    }
    const r = await this.perform(ref, { type: "setBody", body: d.text }, "Notiz geändert");
    if (r.status === "ok" || r.status === "noop") await this.discardDraft(ref);
    else if (r.status === "conflict") return { ...r, mine: d.text };
    return r;
  }

  /**
   * Bewusste Entscheidung bei einem Textkonflikt (7.3):
   * „mine“ schreibt den Entwurf auf die aktuelle Dateifassung, „file“ verwirft den Entwurf,
   * „both“ speichert den Entwurf als neue Datei und lässt die Datei unverändert.
   */
  async resolveDraftConflict(ref: string, choice: "mine" | "file" | "both"): Promise<Outcome> {
    const d = this.drafts.find((x) => x.ref === ref);
    if (!d) return { status: "noop" };
    if (choice === "file") {
      await this.discardDraft(ref);
      return { status: "ok", message: "Entwurf verworfen" };
    }
    const f = this.files.get(ref);
    if (choice === "both" || !f || f.kind !== "task") {
      const title = f && f.kind === "task" ? `${f.fields.title} (Entwurf)` : "Wiederhergestellter Entwurf";
      return this.saveDraftAsNew(ref, title);
    }
    // „Meine Version“: auf die zuletzt verglichene Dateifassung beziehen; der Hash muss noch passen.
    d.baseHash = f.hash;
    d.baseText = f.body;
    await this.saveDrafts();
    return this.commitDraft(ref);
  }

  /** Entwürfe, deren Datei nicht mehr existiert (7.1, 7.6). */
  orphanDrafts(): Draft[] {
    return this.drafts.filter((d) => !this.files.has(d.ref));
  }

  /**
   * Wiederherstellungsfall übernehmen: gewünschte Fassung auf die aktuelle Datei schreiben.
   * Nur auf ausdrücklichen Wunsch; die aktuelle Fassung wird über ihren Hash abgesichert.
   */
  async applyRecovery(opId: string): Promise<Outcome> {
    const c = this.recovery.find((r) => r.opId === opId);
    if (!c || c.desired === null) return { status: "blocked", message: "Keine gewünschte Fassung vorhanden" };
    let res: WriteResult;
    try {
      const cur = await this.adapter.read(c.ref);
      res = await this.adapter.write(c.ref, c.desired, cur.hash);
    } catch {
      // Datei fehlt: als neue Datei anlegen statt still neu zu erzeugen.
      res = await this.adapter.create(freeName(c.name, (n) => [...this.files.values()].some((f) => f.name.toLowerCase() === n.toLowerCase())), c.desired);
    }
    if (res.status !== "ok") return this.failed(res);
    await this.resolveRecovery(opId);
    return { status: "ok", message: "Fassung übernommen" };
  }

  /** Entwurf als neue Datei speichern (nach externer Löschung, 7.1). */
  async saveDraftAsNew(ref: string, title: string): Promise<Outcome> {
    const d = this.drafts.find((x) => x.ref === ref);
    if (!d) return { status: "noop" };
    const r = await this.create({ title, note: d.text });
    if (r.status === "ok") await this.discardDraft(ref);
    return r;
  }
}

export function isTaskFileName(m: FileMeta): boolean {
  return !m.name.startsWith(".") && m.name.toLowerCase().endsWith(".md");
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export { freeName };
