// Index, Abgleich und Schreibpfad über einem StorageAdapter (Plan 7.1, 7.3, 4.4, 7.6).
import {
  actionDependencies,
  adoptFileText,
  applyPlan,
  buildIndex,
  deepEqual,
  fileNameForTitle,
  freeName,
  hashText,
  newTaskText,
  NEW_LIST_DATA,
  planAction,
  readTaskFile,
  sanitizeTitle,
  SUPPORTED_FORMAT_VERSION,
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
  /** undoable: true genau dann, wenn die Aktion einen Undo-Eintrag angelegt hat (4.4) */
  | { status: "ok"; message?: string; ref?: string; undoable?: boolean }
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
  /** steigt mit jedem saveDraft; ältere gespeicherte Entwürfe haben noch keine (R1) */
  rev?: number;
  /** Hash der Dateifassung, mit der zuletzt ein Konflikt festgestellt wurde (7.3) */
  conflictHash?: string;
}

export interface RepoState {
  /** true, bis der Cache beim Öffnen geladen ist; leere Ansichten sind dann noch nicht aussagekräftig */
  loading: boolean;
  index: Index;
  files: Map<string, IndexedFile>;
  trash: FileMeta[];
  /** true, solange angezeigte Daten noch nicht vollständig gegen die Dateien geprüft sind */
  unverified: boolean;
  scanning: boolean;
  /** letzter Fehler beim Einlesen; Index bleibt dann veraltet und schreibgeschützt */
  readError: string | null;
  /** Verzeichnisabfrage fehlgeschlagen: letzter Stand sichtbar, aber schreibgeschützt bis zum nächsten Abgleich (7.1) */
  stale: boolean;
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
/** Zurückwechseln nach längerer Pause gleicht vollständig ab, sonst schnell (7.1). */
export const FULL_SCAN_AFTER_MS = 30 * 60_000;

export interface RepositoryOptions {
  adapter: StorageAdapter;
  kv: KeyValueStore;
  /** Ordneridentität (für Entwürfe, Undo und Cache) */
  folder: string;
  clock: () => Clock;
  random?: (bytes: Uint8Array) => void;
  batchSize?: number;
  /** Fortschritt eines Abgleichs erst nach dieser Laufzeit zeigen (7.1); Standard 1 s */
  progressDelayMs?: number;
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
  private readonly progressDelayMs: number;
  private scanStartedAt = 0;
  private files = new TrackedMap<string, IndexedFile>();
  private indexCache: { version: number; clockTick: number; hiddenTick: number; index: Index } | null = null;
  private clockTick = 0;
  /** schon ausgeblendet, Verschieben in den Papierkorb läuft noch (4.4) */
  private hidden = new Set<string>();
  private hiddenTick = 0;
  /** eigene Neuanlage oder Löschung im Hintergrund: Ein Abgleich lässt diese Referenzen unangetastet */
  private inflight = new Set<string>();
  private progressOnly = false;
  private metas = new Map<string, FileMeta>();
  private trash: FileMeta[] = [];
  private undoStack: UndoEntry[] = [];
  private recovery: RecoveryCase[] = [];
  private drafts: Draft[] = [];
  private unverified = true;
  private loading = true;
  /** Dateistand und Metadaten seit dem letzten Laden oder Schreiben des Caches geändert */
  private savedVersion = -1;
  private metaDirty = false;
  private scanning: Promise<void> | null = null;
  private scanningFull = false;
  /** nachzuholender Vollabgleich, angefordert während eines Teilabgleichs (7.1) */
  private fullFollowUp: Promise<void> | null = null;
  private stale = false;
  /** extern umbenannte Referenzen: alt → neu (Zuordnung über ID, 7.1) */
  private renamed = new Map<string, string>();
  private readError: string | null = null;
  private lastScan: RepoState["lastScan"] = null;
  private scanProgress: RepoState["scanProgress"] = null;
  private cacheLoadMs: number | null = null;
  private scanCancelled = false;
  /** während eines Abgleichdurchgangs lokal geänderte Referenzen (R2) */
  private touchedDuringScan: Set<string> | null = null;
  private listeners = new Set<() => void>();
  private queues = new Map<string, Promise<unknown>>();
  /** laufende Nummer jedes eingereihten Auftrags */
  private seq = 0;
  /** Grenze je Datei: Aufträge bis zu dieser Nummer verwirft Undo, Verschieben oder Ordnerwechsel */
  private cutoffs = new Map<string, number>();
  /** laufende Rücknahme je Datei; später eingereihte Aufträge derselben Datei warten darauf (R5) */
  private undoing = new Map<string, Promise<void>>();
  /** Rücknahmen laufen nacheinander: Auswahl und Ausführung eines Eintrags bilden eine Einheit (R5) */
  private undoChain: Promise<unknown> = Promise.resolve();
  private closed = false;
  private state: RepoState;

  constructor(opts: RepositoryOptions) {
    this.adapter = opts.adapter;
    this.kv = opts.kv;
    this.folder = opts.folder;
    this.clock = opts.clock;
    this.random = opts.random;
    this.batchSize = opts.batchSize ?? 50;
    this.progressDelayMs = opts.progressDelayMs ?? 1000;
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
    if (this.indexValid()) return c!.index;
    // Reine Fortschrittsmeldungen eines Abgleichs bauen den Index nicht neu auf.
    if (c && this.progressOnly) return c.index;
    const files = [...this.files.values()].filter((f) => !this.hidden.has(f.ref));
    const index = buildIndex(files, this.clock());
    this.indexCache = { version: this.files.version, clockTick: this.clockTick, hiddenTick: this.hiddenTick, index };
    return index;
  }

  private indexValid(): boolean {
    const c = this.indexCache;
    return !!c && c.version === this.files.version && c.clockTick === this.clockTick && c.hiddenTick === this.hiddenTick;
  }

  private hide(ref: string) {
    this.hidden.add(ref);
    this.hiddenTick++;
  }

  private unhide(ref: string): boolean {
    if (!this.hidden.delete(ref)) return false;
    this.hiddenTick++;
    return true;
  }

  /** Ausgeblendete Datei endgültig entfernen; der Index enthält sie schon nicht mehr und bleibt gültig. */
  private dropHidden(ref: string) {
    const valid = this.indexValid();
    this.dropFile(ref);
    this.unhide(ref);
    if (valid) this.indexCache = { ...this.indexCache!, version: this.files.version, hiddenTick: this.hiddenTick };
  }

  private filesCache: { version: number; map: Map<string, IndexedFile> } | null = null;

  private filesCopy(): Map<string, IndexedFile> {
    if (this.filesCache && this.filesCache.version === this.files.version) return this.filesCache.map;
    const map = new Map(this.files);
    this.filesCache = { version: this.files.version, map };
    return map;
  }

  private snapshot(): RepoState {
    return {
      loading: this.loading,
      index: this.currentIndex(),
      files: this.filesCopy(),
      trash: [...this.trash],
      unverified: this.unverified,
      scanning: this.scanning !== null,
      readError: this.readError,
      stale: this.stale,
      undo: [...this.undoStack],
      recovery: [...this.recovery],
      drafts: [...this.drafts],
      lastScan: this.lastScan,
      // Kurze Abgleiche bleiben unsichtbar.
      scanProgress: this.progressVisible() ? this.scanProgress : null,
      cacheLoadMs: this.cacheLoadMs,
    };
  }

  private emit() {
    this.state = this.snapshot();
    for (const l of this.listeners) l();
  }

  private progressVisible() {
    return Date.now() - this.scanStartedAt >= this.progressDelayMs;
  }

  /** Zurückwechseln (3.3, 7.1): Heute neu auswerten; nach längerer Pause vollständig, sonst schnell abgleichen. */
  resume(awayMs: number): Promise<void> {
    this.refreshClock();
    return this.scan({ full: awayMs > FULL_SCAN_AFTER_MS });
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
    this.loading = false;
    this.emit(); // Anzeige aus dem Cache, noch als ungeprüft markiert
    if (this.files.size) this.cacheLoadMs = Date.now() - t0;
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
    for (const k of this.queues.keys()) this.bump(k);
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
        invalidUtf8?: boolean;
      }[];
      for (const e of entries) {
        this.metas.set(e.meta.ref, e.meta);
        this.files.set(
          e.meta.ref,
          readTaskFile({
            ref: e.meta.ref,
            name: e.meta.name,
            text: e.text,
            hash: e.hash,
            mtime: e.meta.mtime,
            preParsed: e.parsed,
            invalidUtf8: e.invalidUtf8,
          }),
        );
      }
      this.unverified = true;
      this.savedVersion = this.files.version;
    } catch {
      // Defekter Cache ist jederzeit aus den Dateien rekonstruierbar.
      this.files.clear();
      this.metas.clear();
    }
  }

  /** Metadaten setzen und merken, ob der Cache dadurch veraltet. */
  private putMeta(m: FileMeta) {
    const old = this.metas.get(m.ref);
    if (!old || old.name !== m.name || old.mtime !== m.mtime || old.size !== m.size) this.metaDirty = true;
    this.metas.set(m.ref, m);
  }

  private async saveCache() {
    // Unveränderten Stand nicht erneut serialisieren und schreiben.
    if (this.savedVersion === this.files.version && !this.metaDirty) return;
    const version = this.files.version;
    // Laufende eigene Vorgänge erst nach ihrem Abschluss sichern (vorläufige Neuanlage).
    const skipped = [...this.files.keys()].some((ref) => this.inflight.has(ref));
    this.metaDirty = skipped;
    const entries = [...this.files.values()].filter((f) => !this.inflight.has(f.ref)).map((f) => ({
      meta: this.metas.get(f.ref) ?? { name: f.name, ref: f.ref, mtime: f.mtime, size: null },
      text: f.text,
      hash: f.hash,
      ...(f.kind === "task" ? { parsed: { data: f.data, hasAnchors: f.hasAnchors } } : {}),
      // Ungültige Kodierung auch aus dem Cache als solche zeigen (R4).
      ...(hasInvalidUtf8(f) ? { invalidUtf8: true } : {}),
    }));
    try {
      await this.kv.set(this.key("cache"), JSON.stringify(entries));
      if (!skipped) this.savedVersion = version;
    } catch {
      this.metaDirty = true;
      /* Cache ist nur eine Beschleunigung */
    }
  }

  async resolveRecovery(opId: string) {
    await this.adapter.resolveRecovery(opId);
    this.recovery = this.recovery.filter((r) => r.opId !== opId);
    this.emit();
    await this.scan();
  }

  /** Fehlschlag mit offenem Journalvorgang sofort als Wiederherstellungsfall zeigen (7.3). */
  private noteFailure(res: WriteResult): boolean {
    if (res.status === "ok" || !res.recovery) return false;
    const c = res.recovery;
    this.recovery = [...this.recovery.filter((r) => r.opId !== c.opId), c];
    this.emit();
    return true;
  }

  // -------------------------------------------------------------------------
  // Einlesen (7.1) – schreibt nie

  scan(opts: { full?: boolean } = {}): Promise<void> {
    const full = opts.full ?? true;
    if (this.scanning) {
      if (!full || this.scanningFull) return this.scanning;
      // Vollabgleich während eines Teilabgleichs angefordert: anschließend nachholen (7.1).
      this.fullFollowUp ??= this.scanning.then(() => {
        this.fullFollowUp = null;
        return this.scan({ full: true });
      });
      return this.fullFollowUp;
    }
    this.scanCancelled = false;
    this.scanningFull = full;
    this.scanStartedAt = Date.now();
    this.scanning = this.doScan(full).finally(() => {
      this.scanning = null;
      this.scanProgress = null;
      this.emit();
    });
    this.emit();
    return this.scanning;
  }

  private async doScan(full: boolean) {
    const t0 = Date.now();
    const first = await this.scanOnce(full);
    if (!first) return;
    let failures = first.readFailures;
    // Dateien, die während des Abgleichs lokal angelegt, umbenannt oder geschrieben wurden, gezielt
    // nachlesen: Ihr lokaler Stand war jünger als das Abgleichergebnis (R2).
    for (let i = 0, pending = first.pending; pending && i < MAX_ATTEMPTS; i++) {
      const next = await this.scanOnce(false);
      if (!next) return;
      failures += next.readFailures;
      pending = next.pending;
    }
    this.readError = failures ? `${failures} Datei(en) konnten nicht gelesen werden` : null;
    // Auch ein schneller Abgleich gilt als Prüfung (7.1).
    if (!first.readFailures) this.unverified = false;
    this.lastScan = { ...first.stats, ms: Date.now() - t0, full };
    await this.saveCache();
  }

  /**
   * Ein Abgleichdurchgang. null bei Abbruch oder nicht lesbarem Ordner (readError ist dann gesetzt).
   * `pending`: Dateien wurden während des Durchgangs lokal geändert; ihr Stand blieb unangetastet,
   * ihre Metadaten gelten als unbekannt, damit ein Teilabgleich sie erneut liest (R2).
   */
  private async scanOnce(full: boolean): Promise<{
    pending: boolean;
    readFailures: number;
    stats: { files: number; read: number; readMs: number; parseMs: number };
  } | null> {
    const touched = new Set<string>();
    this.touchedDuringScan = touched;
    try {
      let metas: FileMeta[];
      try {
        metas = (await this.adapter.list("tasks")).filter(isTaskFileName);
      } catch (e) {
        // Fehler sind keine Löschungen: letzter Stand bleibt sichtbar, aber schreibgeschützt.
        this.readError = `Ordner konnte nicht gelesen werden: ${errMessage(e)}`;
        this.stale = true;
        return null;
      }
      this.stale = false;
      try {
        this.trash = (await this.adapter.list("trash")).filter((m) => m.name.toLowerCase().endsWith(".md"));
      } catch {
        /* Papierkorb fehlt oder ist nicht lesbar */
      }
      const known = new Set(this.files.keys());
      const seen = new Set<string>();
      const toRead: FileMeta[] = [];
      for (const m of metas) {
        seen.add(m.ref);
        if (touched.has(m.ref) || this.inflight.has(m.ref)) continue;
        const old = this.metas.get(m.ref);
        const knownFile = this.files.get(m.ref);
        const changed =
          !old || !knownFile || m.mtime === null || m.size === null || old.mtime !== m.mtime || old.size !== m.size;
        if (full || changed) toRead.push(m);
        else this.putMeta(m);
      }
      let readFailures = 0;
      let readMs = 0;
      let lastProgress = 0;
      let parseMs = 0;
      this.scanProgress = { done: 0, total: toRead.length };
      for (let i = 0; i < toRead.length; i += this.batchSize) {
        if (this.closed) return null;
        if (this.scanCancelled) {
          // Abgebrochen: nichts entfernen, Anzeige bleibt als ungeprüft markiert.
          this.readError = "Abgleich abgebrochen – Anzeige ist nicht vollständig geprüft";
          return null;
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
          // Inzwischen lokal geändert: Das Leseergebnis kann älter sein und überschreibt nichts (R2).
          if (touched.has(m.ref) || this.inflight.has(m.ref)) return;
          const r = results[j];
          if (!r) {
            readFailures++;
            return;
          }
          const mtime = r.mtime ?? m.mtime;
          this.putMeta({ ...m, mtime });
          // Unveränderten Inhalt nicht neu auswerten: Dasselbe Objekt hält Index und Zwischenergebnisse gültig.
          const prev = this.files.get(m.ref);
          if (prev && prev.hash === r.hash && prev.mtime === mtime && prev.name === m.name && !r.invalidUtf8 && !hasInvalidUtf8(prev)) return;
          this.files.set(m.ref, fileFromRead(m.ref, m.name, r, mtime));
        });
        parseMs += Date.now() - tParse;
        this.scanProgress = { done: Math.min(i + this.batchSize, toRead.length), total: toRead.length };
        // Fortschritt höchstens alle 300 ms melden; jede Meldung lässt die Oberfläche rendern.
        if (toRead.length > this.batchSize && this.progressVisible() && Date.now() - lastProgress >= 300) {
          lastProgress = Date.now();
          this.progressOnly = true;
          try {
            this.emit();
          } finally {
            this.progressOnly = false;
          }
        }
      }
      // Die Verzeichnisliste stammt vom Beginn des Durchgangs: Lokal seither angelegte oder
      // umbenannte Dateien fehlen darin und sind nicht verschwunden (R2).
      const gone = [...this.files.keys()].filter((ref) => !seen.has(ref) && !touched.has(ref) && !this.inflight.has(ref));
      if (gone.length) await this.followRenames(gone, new Set([...known, ...touched]));
      for (const ref of gone) {
        if (touched.has(ref)) continue;
        this.files.delete(ref);
        this.metas.delete(ref);
      }
      for (const ref of touched) {
        const f = this.files.get(ref);
        if (f) this.putMeta({ ref, name: f.name, mtime: null, size: null });
        else this.metas.delete(ref);
      }
      return {
        pending: touched.size > 0,
        readFailures,
        stats: { files: metas.length, read: toRead.length, readMs, parseMs },
      };
    } finally {
      if (this.touchedDuringScan === touched) this.touchedDuringScan = null;
    }
  }

  /**
   * Externe Umbenennung über die ID zuordnen (7.1): Eine verschwundene Datei gilt nur dann als
   * umbenannt, wenn genau eine neu aufgetauchte Datei dieselbe ID trägt und keine andere.
   */
  private async followRenames(gone: string[], known: Set<string>) {
    const byId = new Map<string, string[]>();
    for (const f of this.files.values()) {
      if (f.kind !== "task" || !f.fields.id) continue;
      byId.set(f.fields.id, [...(byId.get(f.fields.id) ?? []), f.ref]);
    }
    let changed = false;
    for (const old of gone) {
      const f = this.files.get(old);
      const id = f?.kind === "task" ? f.fields.id : null;
      if (!id) continue;
      const others = (byId.get(id) ?? []).filter((r) => r !== old);
      if (others.length !== 1 || known.has(others[0]!)) continue;
      changed = this.remapRef(old, others[0]!) || changed;
    }
    if (changed) await this.persistRefs();
  }

  /** Lokale Referenzen (Entwürfe, bei externer Umbenennung auch Undo) auf eine neue Referenz umstellen. */
  private remapRef(oldRef: string, newRef: string, undo = true): boolean {
    this.renamed.set(oldRef, newRef);
    let changed = false;
    if (!this.drafts.some((d) => d.ref === newRef)) {
      for (const d of this.drafts) {
        if (d.ref === oldRef) {
          d.ref = newRef;
          changed = true;
        }
      }
    }
    for (const e of undo ? this.undoStack : []) {
      if (e.ref === oldRef) {
        e.ref = newRef;
        changed = true;
      }
    }
    return changed;
  }

  private async persistRefs() {
    await this.saveDrafts();
    await this.kv.set(this.key("undo"), JSON.stringify(this.undoStack));
  }

  /**
   * Aktuelle Referenz zu einer früheren (nach Umbenennung über dieselbe ID, 7.1).
   * null, wenn die Datei nicht mehr eindeutig zuzuordnen ist.
   */
  resolveRef(oldRef: string): string | null {
    let ref = oldRef;
    for (let i = 0; i < 100; i++) {
      if (this.files.has(ref)) return ref;
      const next = this.renamed.get(ref);
      if (!next) return null;
      ref = next;
    }
    return null;
  }

  /** Laufenden Abgleich abbrechen (7.1). */
  cancelScan() {
    this.scanCancelled = true;
  }

  // -------------------------------------------------------------------------
  // Serialisierung je Datei

  /** Alle bis `upTo` eingereihten, noch wartenden Aufträge dieser Datei verwerfen. */
  private bump(ref: string, upTo = this.seq) {
    this.cutoffs.set(ref, Math.max(this.cutoffs.get(ref) ?? 0, upTo));
  }

  private enqueue<T>(ref: string, job: () => Promise<T>): Promise<T | Outcome> {
    const seq = ++this.seq;
    const prev = this.queues.get(ref) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        // Eine laufende Rücknahme auf derselben Datei zuerst abschließen lassen (R5).
        for (let u = this.undoing.get(ref); u; u = this.undoing.get(ref)) await u;
        if (this.closed) return { status: "blocked", message: "Ordner wurde gewechselt" } as Outcome;
        if (seq <= (this.cutoffs.get(ref) ?? 0)) {
          return { status: "blocked", message: "Auftrag verworfen (Undo oder Ordnerwechsel)" } as Outcome;
        }
        return job();
      });
    this.queues.set(ref, next);
    return next;
  }

  /**
   * Gemeinsame Vorbedingungen jeder Schreibaktion: Ordner erreichbar (7.1) und kein offener
   * Wiederherstellungsfall auf den betroffenen Dateien (7.3).
   */
  private writeBlock(...refs: string[]): Outcome | null {
    if (this.closed) return { status: "blocked", message: "Ordner wurde gewechselt" };
    if (this.stale) {
      return { status: "blocked", message: "Ordner nicht erreichbar – angezeigter Stand ist veraltet und schreibgeschützt. Bitte neu einlesen." };
    }
    if (this.readError && this.unverified) return { status: "blocked", message: "Ordner nicht erreichbar – schreibgeschützt" };
    const c = this.recovery.find((r) => refs.includes(r.ref) || (r.source !== undefined && refs.includes(r.source)));
    if (c) {
      return { status: "blocked", message: `Offener Wiederherstellungsfall für „${c.name}“ – bitte zuerst unter Probleme klären` };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Aktionen

  findTask(key: string): Task | null {
    for (const f of this.files.values()) if (f.kind === "task" && (f.key === key || f.ref === key)) return f;
    return null;
  }

  perform(ref: string, action: TaskAction, label = "Änderung"): Promise<Outcome> {
    return this.performWith(ref, action, label);
  }

  /** strictHash: nur auf genau diese Dateifassung anwenden, keine unabhängige Übertragung (7.3 Konfliktdialog). */
  private performWith(ref: string, action: TaskAction, label: string, strictHash?: string): Promise<Outcome> {
    const ctx = this.ctx(); // fester Aktionszeitpunkt ab dem Einreihen, auch für Wiederholungen (7.3)
    return this.enqueue(ref, () => this.doPerform(ref, action, label, ctx, strictHash)) as Promise<Outcome>;
  }

  private async doPerform(
    ref: string,
    action: TaskAction,
    label: string,
    ctx: ActionContext,
    strictHash?: string,
  ): Promise<Outcome> {
    const block = this.writeBlock(ref);
    if (block) return block;
    const current = this.files.get(ref);
    if (!current || current.kind !== "task") return { status: "error", message: "Aufgabe nicht gefunden" };
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
      if (strictHash !== undefined && (fresh.hash !== strictHash || base.hash !== strictHash)) {
        // Inzwischen eine weitere Änderung: erneut entscheiden lassen, nichts übergehen.
        this.putFile(ref, fileFromRead(ref, base.name, fresh));
        this.emit();
        return { status: "conflict", ref, message: "Die Datei wurde seit dem Vergleich erneut geändert", theirs: fresh.text };
      }
      // Ungültige Kodierung löst auch bei gleichem Hash den Schreibschutz aus: Der dekodierte Text
      // enthält Ersatzzeichen und darf nie zurückgeschrieben werden (R4).
      if (fresh.hash !== base.hash || fresh.invalidUtf8) {
        const ft = fileFromRead(ref, base.name, fresh);
        if (ft.kind !== "task") {
          this.putFile(ref, ft);
          this.emit();
          return { status: "conflict", ref, message: "Datei wurde extern ungültig geändert" };
        }
        const plan2 = planAction(ft, action, ctx);
        const deps = actionDependencies(action, plan);
        const independent =
          deps.fields.every((k) => deepEqual(base.data[k], ft.data[k])) && (!deps.body || base.body === ft.body);
        this.putFile(ref, ft);
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
        const saved = this.pushUndo({ id: this.newId(), kind: "edit", label, ref, afterHash: res.hash, beforeText: base.text });
        this.emit();
        await saved;
        return { status: "ok", undoable: true, ...(plan.kind === "edit" && plan.note ? { message: plan.note } : {}) };
      }
      if (res.status === "conflict" && !res.recovery) continue; // erneut lesen und prüfen
      return this.failed(res);
    }
    return { status: "conflict", ref, message: "Datei ändert sich laufend – bitte erneut versuchen" };
  }

  private setFile(ref: string, name: string, text: string, hash: string, invalidUtf8?: boolean) {
    this.putFile(ref, fileFromRead(ref, name, { text, hash, mtime: Date.now(), invalidUtf8 }));
    this.metas.set(ref, { ref, name, mtime: null, size: null }); // unbekannt → nächster Abgleich liest
  }

  /** Lokal festgestellter Stand einer Datei; ein gleichzeitig laufender Abgleich überschreibt ihn nicht (R2). */
  private putFile(ref: string, f: IndexedFile) {
    this.files.set(ref, f);
    this.touch(ref);
  }

  /** Datei lokal aus dem Index nehmen (verschoben oder umbenannt); ebenfalls vor laufendem Abgleich geschützt (R2). */
  private dropFile(ref: string) {
    this.files.delete(ref);
    this.metas.delete(ref);
    this.touch(ref);
  }

  /** Lokale Änderung an einer Datei während eines laufenden Abgleichs vormerken (R2). */
  private touch(ref: string) {
    this.touchedDuringScan?.add(ref);
  }

  /**
   * Neue Eingangsaufgabe (4.1) bzw. Liste (4.6). Übernimmt keinen Termin aus der Ansicht.
   * Die Aufgabe erscheint sofort; `shown` meldet ihre Referenz, bevor geschrieben wird (4.4).
   * Schlägt das Schreiben fehl, verschwindet sie wieder und das Ergebnis nennt den Titel.
   */
  async create(input: NewTaskInput, shown?: (ref: string) => void): Promise<Outcome> {
    const block = this.writeBlock();
    if (block) return block;
    if (!input.title.trim()) return { status: "blocked", message: "Titel fehlt" };
    const ctx = this.ctx();
    const { id, text } = newTaskText(input, ctx);
    const note = input.note ?? "";
    const problem = verifyGenerated(text, {
      id,
      title: input.title.trim(),
      body: note === "" ? "" : note.endsWith("\n") ? note : `${note}\n`,
      data:
        input.kind === "list"
          ? { ...NEW_LIST_DATA, priority: undefined, due: undefined, scheduled: undefined }
          : { due: input.due ?? undefined, scheduled: input.scheduled ?? undefined },
    });
    if (problem) return { status: "error", message: `Selbstprüfung fehlgeschlagen: ${problem} – nichts geschrieben` };
    const names = new Set([...this.files.values()].map((f) => f.name.toLowerCase()));
    // Namen offener Wiederherstellungsfälle nicht erneut vergeben (7.3).
    for (const r of this.recovery) if (r.ref.startsWith("tasks/")) names.add(r.name.toLowerCase());
    const pick = () => fileNameForTitle(input.title, (n) => names.has(n.toLowerCase()), id.slice(-6));
    const first = pick();
    const ref = `tasks/${first}`;
    const hash = hashText(text);
    // Vorläufig anzeigen; spätere Aktionen auf diese Aufgabe reihen sich hinter das Schreiben ein.
    this.setFile(ref, first, text, hash);
    this.inflight.add(ref);
    this.emit();
    shown?.(ref);
    let out: Outcome;
    try {
      out = (await this.enqueue(ref, async (): Promise<Outcome> => {
        const blocked = this.writeBlock();
        if (blocked) return blocked;
        let name = first;
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await this.adapter.create(name, text);
          if (res.status === "ok") {
            // Der vorläufige Eintrag gilt weiter, wenn Ort und Inhalt stimmen: kein zweiter Indexaufbau.
            if (res.ref !== ref || res.name !== first || res.hash !== hash) {
              this.dropFile(ref);
              this.setFile(res.ref, res.name, text, res.hash);
            }
            // Ein laufender Abgleich hat die Datei noch nicht gelistet: nicht als verschwunden werten (R2).
            this.touch(res.ref);
            const label = input.kind === "list" ? "Neue Liste" : "Neue Aufgabe";
            const saved = this.pushUndo({ id: this.newId(), kind: "create", label, ref: res.ref, afterHash: res.hash });
            this.emit();
            await saved;
            return { status: "ok", ref: res.ref, undoable: true };
          }
          if (res.status === "exists" && !res.recovery) {
            names.add(name.toLowerCase());
            name = pick();
            continue;
          }
          return this.failed(res);
        }
        return { status: "error", message: "Kein freier Dateiname" };
      })) as Outcome;
    } catch (e) {
      out = { status: "error", message: errMessage(e) };
    } finally {
      this.inflight.delete(ref);
    }
    if (out.status === "ok" || out.status === "noop") return out;
    this.dropFile(ref);
    this.emit();
    return { ...out, message: `„${input.title.trim()}“ nicht angelegt – ${out.message}` };
  }

  /** „Als Aufgabe übernehmen“ für eine Datei ohne Frontmatter (3.1). */
  adopt(ref: string): Promise<Outcome> {
    const at = this.ctx(); // fester Aktionszeitpunkt ab dem Einreihen (7.3)
    return this.enqueue(ref, async () => {
      const block = this.writeBlock(ref);
      if (block) return block;
      const f = this.files.get(ref);
      if (!f || f.kind !== "unrecognized") return { status: "blocked", message: "Datei ist keine unerkannte Datei" };
      let id = "";
      const text = adoptFileText(f.name, f.text, {
        ...at,
        newId: () => (id = at.newId()),
      });
      const problem = verifyGenerated(text, {
        id,
        title: f.name.replace(/\.md$/i, ""),
        body: f.text.startsWith("﻿") ? f.text.slice(1) : f.text,
      });
      if (problem) return { status: "error", message: `Selbstprüfung fehlgeschlagen: ${problem} – nichts geschrieben` };
      const res = await this.adapter.write(ref, text, f.hash);
      if (res.status !== "ok") {
        return this.failed(res);
      }
      this.setFile(ref, f.name, text, res.hash);
      const saved = this.pushUndo({ id: this.newId(), kind: "edit", label: "Als Aufgabe übernommen", ref, afterHash: res.hash, beforeText: f.text });
      this.emit();
      await saved;
      return { status: "ok", undoable: true };
    }) as Promise<Outcome>;
  }

  /**
   * Löschen = in den Papierkorb (4.4). Die Aufgabe verschwindet sofort aus den Ansichten; das
   * Verschieben läuft im Hintergrund. Schlägt es fehl, erscheint sie wieder.
   */
  moveToTrash(ref: string): Promise<Outcome> {
    const early = this.files.has(ref) && !this.writeBlock(ref) && !this.hidden.has(ref);
    if (early) {
      this.hide(ref);
      this.inflight.add(ref);
      this.emit();
    }
    const run = this.enqueue(ref, async () => {
      const block = this.writeBlock(ref);
      if (block) return block;
      const f = this.files.get(ref);
      if (!f) return { status: "error", message: "Datei nicht gefunden" };
      const res = await this.adapter.moveToTrash(ref, f.hash);
      if (res.status !== "ok") {
        return this.failed(res);
      }
      this.dropHidden(ref);
      this.bump(ref);
      const saved = this.pushUndo({ id: this.newId(), kind: "trash", label: "Gelöscht", ref: res.ref, afterHash: res.hash });
      this.trashed(res.ref, res.name);
      this.emit();
      await saved;
      return { status: "ok", ref: res.ref, undoable: true };
    }) as Promise<Outcome>;
    if (!early) return run;
    return run.finally(() => {
      this.inflight.delete(ref);
      if (this.unhide(ref)) this.emit();
    });
  }

  async restoreFromTrash(trashRef: string): Promise<Outcome> {
    const block = this.writeBlock(trashRef);
    if (block) return block;
    let read;
    try {
      read = await this.adapter.read(trashRef);
    } catch (e) {
      return { status: "error", message: errMessage(e) };
    }
    const res = await this.adapter.restoreFromTrash(trashRef, read.hash);
    if (res.status !== "ok") return this.failed(res);
    this.setFile(res.ref, res.name, read.text, res.hash, read.invalidUtf8);
    const saved = this.pushUndo({ id: this.newId(), kind: "restore", label: "Wiederhergestellt", ref: res.ref, afterHash: res.hash });
    this.trash = this.trash.filter((m) => m.ref !== trashRef);
    this.emit();
    await saved;
    return { status: "ok", ref: res.ref, undoable: true };
  }

  /** „Papierkorb leeren“: nur die bestätigten Dateien mit unverändertem Hash (7.3). Endgültig, kein Undo. */
  async emptyTrash(confirmed: { ref: string; hash: string }[]): Promise<Outcome> {
    const block = this.writeBlock(...confirmed.map((c) => c.ref));
    if (block) return block;
    let failed = 0;
    for (const c of confirmed) {
      const res = await this.adapter.deletePermanently(c.ref, c.hash);
      if (res.status !== "ok") {
        failed++;
        this.noteFailure(res);
      }
    }
    await this.refreshTrash();
    this.emit();
    return failed
      ? { status: "error", message: `${failed} Datei(en) wurden inzwischen geändert und nicht gelöscht` }
      : { status: "ok", undoable: false };
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

  /** Eigenes Verschieben in den Papierkorb nachführen; neu auflisten kostet auf Android Sekunden. */
  private trashed(ref: string, name: string) {
    if (!name.toLowerCase().endsWith(".md")) return;
    this.trash = [...this.trash.filter((m) => m.ref !== ref), { name, ref, mtime: null, size: null }];
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
      const block = this.writeBlock(ref);
      if (block) return block;
      const f = this.files.get(ref);
      if (!f || f.kind !== "task") return { status: "error", message: "Aufgabe nicht gefunden" };
      const desired = sanitizeTitle(f.fields.title);
      if (!desired) return { status: "blocked", message: "Titel ergibt keinen gültigen Dateinamen" };
      if (`${desired}.md` === f.name) return { status: "noop" };
      const names = new Set([...this.files.values()].filter((x) => x !== f).map((x) => x.name.toLowerCase()));
      const name = fileNameForTitle(f.fields.title, (n) => names.has(n.toLowerCase()), (f.fields.id ?? "x").slice(-6));
      if (name === f.name) return { status: "noop" };
      const res = await this.adapter.rename(ref, name, f.hash);
      if (res.status !== "ok") {
        return this.failed(res);
      }
      this.dropFile(ref);
      this.bump(ref);
      this.setFile(res.ref, res.name, f.text, res.hash);
      // Eigene Umbenennung: Undo-Einträge behalten ihren Ort, das Rückgängigmachen stellt ihn wieder her.
      const drafts = this.remapRef(ref, res.ref, false) ? this.saveDrafts() : null;
      const saved = this.pushUndo({ id: this.newId(), kind: "rename", label: "Umbenannt", ref: res.ref, afterHash: res.hash, beforeName: f.name });
      this.emit();
      await drafts;
      await saved;
      return { status: "ok", ref: res.ref, undoable: true };
    }) as Promise<Outcome>;
  }

  private failed(res: WriteResult): Outcome {
    const open = this.noteFailure(res);
    const hint = open ? " – Wiederherstellungsfall unter Probleme" : "";
    if (res.status === "conflict") {
      void this.scan({ full: false });
      return { status: "conflict", ref: "", message: `Die Datei wurde inzwischen geändert${hint}` };
    }
    return { status: "error", message: `${writeResultMessage(res)}${hint}` };
  }

  // -------------------------------------------------------------------------
  // Konfliktvarianten (7.4)

  /** Ganze Variante behalten; die übrigen wandern nach geprüftem Abschluss in den Papierkorb. Kein Undo. */
  async keepVariant(keepRef: string, discardRefs: string[]): Promise<Outcome> {
    const block = this.writeBlock(keepRef, ...discardRefs);
    if (block) return block;
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
        this.dropFile(ref);
      } else {
        failed++;
        this.noteFailure(res);
      }
    }
    await this.refreshTrash();
    this.emit();
    return failed
      ? { status: "error", message: `${failed} Variante(n) blieben stehen, weil sie geändert wurden` }
      : { status: "ok", undoable: false };
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

  undo(): Promise<Outcome> {
    const run = this.undoChain.catch(() => undefined).then(() => this.doUndo());
    this.undoChain = run;
    return run;
  }

  /**
   * Nimmt den zuletzt angelegten Eintrag zurück und entfernt genau diesen Eintrag (R5), auch wenn
   * währenddessen weitere Aktionen Einträge angelegt haben. Aufträge derselben Datei, die vor der
   * Rücknahme eingereiht wurden und noch warten, werden verworfen (AK-15); später eingereihte warten
   * auf die Rücknahme und laufen danach auf dem zurückgenommenen Stand.
   */
  private async doUndo(): Promise<Outcome> {
    const e = this.undoStack[this.undoStack.length - 1];
    if (!e) return { status: "noop" };
    const ref = e.ref;
    const block = this.writeBlock(ref);
    if (block) return block;
    const startSeq = this.seq;
    let done = () => {};
    const lock = new Promise<void>((r) => (done = r));
    this.undoing.set(ref, lock);
    try {
      let current;
      try {
        current = await this.adapter.read(ref);
      } catch {
        return { status: "blocked", message: "Rückgängig nicht möglich: Datei fehlt" };
      }
      if (current.hash !== e.afterHash) {
        return { status: "blocked", message: "Rückgängig nicht möglich: Datei wurde seitdem geändert" };
      }
      this.bump(ref, startSeq); // vor der Rücknahme wartende Aufträge auf dieser Datei verwerfen
      let res: WriteResult;
      switch (e.kind) {
        case "edit":
          res = await this.adapter.write(ref, e.beforeText ?? "", e.afterHash);
          break;
        case "create":
          res = await this.adapter.moveToTrash(ref, e.afterHash);
          break;
        case "trash":
          res = await this.adapter.restoreFromTrash(ref, e.afterHash);
          break;
        case "restore":
          res = await this.adapter.moveToTrash(ref, e.afterHash);
          break;
        case "rename":
          res = await this.adapter.rename(ref, e.beforeName ?? "", e.afterHash);
          break;
      }
      if (res.status !== "ok") {
        return this.failed(res);
      }
      // Ein laufender Abgleich darf keinen vor der Rücknahme gelesenen Stand übernehmen (R2).
      this.touch(ref);
      this.touch(res.ref);
      const i = this.undoStack.indexOf(e);
      if (i >= 0) this.undoStack.splice(i, 1);
      await this.kv.set(this.key("undo"), JSON.stringify(this.undoStack));
      await this.scan({ full: false });
      return { status: "ok", message: `Rückgängig: ${e.label}` };
    } finally {
      if (this.undoing.get(ref) === lock) this.undoing.delete(ref);
      done();
    }
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
      existing.rev = (existing.rev ?? 0) + 1;
    } else {
      this.drafts.push({ folder: this.folder, ref, id: f.fields.id, baseHash: f.hash, baseText: f.body, text, updatedAt: Date.now(), rev: 0 });
    }
    await this.saveDrafts();
    this.emit();
  }

  async discardDraft(ref: string): Promise<void> {
    this.drafts = this.drafts.filter((d) => d.ref !== ref);
    await this.saveDrafts();
    this.emit();
  }

  /**
   * Nach erfolgreichem Schreiben der Entwurfsrevision `rev`: Entwurf nur entfernen, wenn inzwischen nicht
   * weitergetippt wurde. Sonst bleibt der jüngere Entwurf erhalten; wurde in seine eigene Datei geschrieben
   * (`wroteFile`), gilt der geschriebene Stand als neue Grundlage, damit kein falscher Konflikt entsteht (R1).
   */
  private async settleDraft(d: Draft, rev: number | undefined, wroteFile: boolean) {
    if (!this.drafts.includes(d)) return;
    if (d.rev === rev) return this.discardDraft(d.ref);
    const f = this.files.get(d.ref);
    if (!wroteFile || !f || f.kind !== "task") return;
    d.baseHash = f.hash;
    d.baseText = f.body;
    delete d.conflictHash;
    await this.saveDrafts();
    this.emit();
  }

  /** Konflikt am Entwurf festhalten: Eine spätere Entscheidung bezieht sich auf genau diese Fassung (7.3). */
  private async markConflict(d: Draft, hash: string | undefined) {
    if (!hash || d.conflictHash === hash) return;
    d.conflictHash = hash;
    await this.saveDrafts();
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
      await this.markConflict(d, f.hash);
      return { status: "conflict", ref, message: "Datei wurde extern geändert", mine: d.text, theirs: f.body };
    }
    const rev = d.rev;
    const r = await this.perform(ref, { type: "setBody", body: d.text }, "Notiz geändert");
    if (r.status === "ok" || r.status === "noop") await this.settleDraft(d, rev, true);
    else if (r.status === "conflict") {
      await this.markConflict(d, this.files.get(ref)?.hash);
      return { ...r, mine: d.text };
    }
    return r;
  }

  /** Erneuter Schreibversuch des gesicherten Entwurfs nach fehlgeschlagenem Speichern, auch ohne neue Eingabe (7.6). */
  retryDraft(ref: string): Promise<Outcome> {
    return this.commitDraft(ref);
  }

  /**
   * Bewusste Entscheidung bei einem Textkonflikt (7.3):
   * „mine“ schreibt den Entwurf auf die beim Konflikt verglichene Dateifassung – nur, wenn deren Hash
   * noch passt; sonst erneut Konflikt. „file“ verwirft den Entwurf, „both“ speichert den Entwurf als
   * neue Datei und lässt die Datei unverändert.
   */
  async resolveDraftConflict(ref: string, choice: "mine" | "file" | "both"): Promise<Outcome> {
    const d = this.drafts.find((x) => x.ref === ref);
    if (!d) return { status: "noop" };
    if (choice === "file") {
      await this.discardDraft(ref);
      return { status: "ok", message: "Entwurf verworfen", undoable: false };
    }
    const f = this.files.get(ref);
    if (choice === "both" || !f || f.kind !== "task") return this.saveDraftAsNew(ref);
    if (!d.conflictHash) return this.commitDraft(ref);
    const rev = d.rev;
    const r = await this.performWith(ref, { type: "setBody", body: d.text }, "Notiz geändert", d.conflictHash);
    if (r.status === "ok" || r.status === "noop") await this.settleDraft(d, rev, true);
    else if (r.status === "conflict") {
      await this.markConflict(d, this.files.get(ref)?.hash);
      return { ...r, mine: d.text };
    }
    return r;
  }

  /** Entwürfe, deren Datei nicht mehr existiert (7.1, 7.6). */
  orphanDrafts(): Draft[] {
    return this.drafts.filter((d) => !this.files.has(d.ref));
  }

  /** Ungespeicherte Entwürfe: Text weicht vom Dateistand ab oder die Datei fehlt (7.6, Anzeige unter Probleme).
   *  `quietMs` blendet Entwürfe aus, an denen gerade getippt wird (Autosave läuft noch). */
  pendingDrafts(quietMs = 0): Draft[] {
    const now = Date.now();
    return this.drafts.filter((d) => {
      if (quietMs > 0 && now - d.updatedAt < quietMs) return false;
      const f = this.files.get(d.ref);
      return !f || f.kind !== "task" || f.body !== d.text;
    });
  }

  /**
   * Wiederherstellungsfall übernehmen: gewünschte Fassung auf die aktuelle Datei schreiben.
   * Nur auf ausdrücklichen Wunsch und nur, solange die Datei noch der angezeigten aktuellen Fassung
   * entspricht; ein inzwischen dritter Inhalt wird nicht überschrieben (AK-22). Kein Undo.
   */
  applyRecovery(opId: string): Promise<Outcome> {
    return this.restoreRecovery(opId, "desired");
  }

  /** Wiederherstellungsfall mit der Ausgangsfassung (Vorher-Inhalt) abschließen, gleiche Vorbedingungen. */
  applyRecoveryBefore(opId: string): Promise<Outcome> {
    return this.restoreRecovery(opId, "before");
  }

  private async restoreRecovery(opId: string, which: "desired" | "before"): Promise<Outcome> {
    const block = this.writeBlock();
    if (block) return block;
    const c = this.recovery.find((r) => r.opId === opId);
    if (!c) return { status: "blocked", message: "Wiederherstellungsfall nicht gefunden" };
    const text = which === "desired" ? c.desired : c.before;
    if (text === null) {
      return { status: "blocked", message: which === "desired" ? "Keine gewünschte Fassung vorhanden" : "Keine Ausgangsfassung vorhanden" };
    }
    if (which === "before" && c.kind !== "write") {
      return { status: "blocked", message: "Ausgangsfassung nur bei Schreibvorgängen – bitte beide Orte prüfen" };
    }
    let cur: ReadResult | null = null;
    try {
      cur = await this.adapter.read(c.ref);
    } catch {
      cur = null;
    }
    // Vorbedingung: Datei entspricht noch der im Fall angezeigten aktuellen Fassung.
    if ((cur === null) !== (c.current === null) || (cur !== null && cur.text !== c.current)) {
      this.recovery = this.recovery.map((r) => (r.opId === opId ? { ...r, current: cur?.text ?? null } : r));
      this.emit();
      return { status: "conflict", ref: c.ref, message: "Datei wurde inzwischen geändert – bitte erneut prüfen", theirs: cur?.text };
    }
    let res: WriteResult;
    if (cur !== null) {
      if (cur.text === text) res = { status: "ok", ref: c.ref, name: c.name, hash: cur.hash };
      else res = await this.adapter.write(c.ref, text, cur.hash);
    } else {
      // Datei fehlt: als neue Datei anlegen statt still neu zu erzeugen.
      const taken = (n: string) => [...this.files.values()].some((f) => f.name.toLowerCase() === n.toLowerCase());
      res = await this.adapter.create(freeName(c.name, taken), text);
    }
    if (res.status !== "ok") return this.failed(res);
    await this.resolveRecovery(opId);
    return { status: "ok", message: which === "desired" ? "Fassung übernommen" : "Ausgangsfassung wiederhergestellt", undoable: false };
  }

  /** Entwurf als neue Datei speichern (nach externer Löschung oder neben einer vorhandenen Datei, 7.1/7.6). */
  async saveDraftAsNew(ref: string, title?: string): Promise<Outcome> {
    const d = this.drafts.find((x) => x.ref === ref);
    if (!d) return { status: "noop" };
    const f = this.files.get(ref);
    const t = title ?? (f && f.kind === "task" ? `${f.fields.title} (Entwurf)` : "Wiederhergestellter Entwurf");
    const rev = d.rev;
    const r = await this.create({ title: t, note: d.text });
    if (r.status === "ok") await this.settleDraft(d, rev, false);
    return r;
  }
}

/** Einheitliche Umwandlung eines Adapter-Leseergebnisses in das Dateimodell, einschließlich ungültiger Kodierung (R4). */
function fileFromRead(ref: string, name: string, r: ReadResult, mtime = r.mtime): IndexedFile {
  return readTaskFile({ ref, name, text: r.text, hash: r.hash, mtime, invalidUtf8: r.invalidUtf8 });
}

/** Selbstprüfung erzeugter Frontmatter vor dem Schreiben (7.2): Text erneut lesen und Felder vergleichen. */
function verifyGenerated(
  text: string,
  expected: { id: string; title: string; body: string; data?: Record<string, YamlValue | undefined> },
): string | null {
  const f = readTaskFile({ ref: "tasks/neu.md", name: "neu.md", text, hash: hashText(text), mtime: null });
  if (f.kind !== "task") return "Text wird nicht als Aufgabe gelesen";
  if (f.readOnly || f.diagnostics.some((d) => d.severity === "error")) return "Text wäre schreibgeschützt";
  const want: Record<string, YamlValue | undefined> = {
    id: expected.id,
    format_version: SUPPORTED_FORMAT_VERSION,
    title: expected.title,
    status: "open",
    priority: "none",
    inbox: true,
    ...expected.data,
  };
  for (const [k, v] of Object.entries(want)) {
    if (v === undefined ? k in f.data : !deepEqual(f.data[k], v)) return `Feld ${k} stimmt nicht`;
  }
  if (f.body !== expected.body) return "Notiz stimmt nicht";
  return null;
}

function hasInvalidUtf8(f: IndexedFile): boolean {
  return f.kind === "invalid" && f.diagnostics.some((d) => d.code === "invalid-utf8");
}

export function isTaskFileName(m: FileMeta): boolean {
  return !m.name.startsWith(".") && m.name.toLowerCase().endsWith(".md");
}

/** Fehlertext für die Anzeige; bei Expo-Modulfehlern nur die eigentliche Ursache. */
export function errMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const causes = m.split(/\n?\s*→ Caused by:\s*/);
  return (causes.length > 1 ? causes[causes.length - 1]! : m).trim();
}

export { freeName };
