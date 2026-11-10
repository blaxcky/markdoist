// Index, Ansichten, Filter, Sortierung und Suche (4.1–4.3, 7.4).
import { Temporal } from "temporal-polyfill";
import { findCheckboxes } from "./checklist";
import { datePart, isOverdue, sortKey, todayOf, type Clock, type DateValue } from "./dates";
import { readSeries, parseKey, remainingListDates, type Series } from "./recurrence/series";
import {
  PRIORITY_RANK,
  type DevType,
  type Diagnostic,
  type IndexedFile,
  type Priority,
  type Status,
  type Task,
  type UnrecognizedFile,
} from "./task";

export interface TaskView {
  task: Task;
  series: Series | null;
  /** wirksame Termine (bei Serien ggf. Vorschlag bzw. ausgeblendet, 5.2) */
  due: DateValue | null;
  scheduled: DateValue | null;
  dueDate: Temporal.PlainDate | null;
  scheduledDate: Temporal.PlainDate | null;
  overdue: boolean;
  diagnostics: Diagnostic[];
  readOnly: boolean;
  /** weitere Fassungen derselben Aufgabe (Konfliktvarianten) */
  variants: Task[];
  searchTitle: string;
  searchBody: string;
  /** vorberechnete Sortierschlüssel (ms) */
  dueKey: number | null;
  scheduledKey: number | null;
}

export interface Index {
  tasks: TaskView[];
  unrecognized: UnrecognizedFile[];
  conflicts: ConflictGroup[];
  today: Temporal.PlainDate;
}

export interface ConflictGroup {
  id: string | null;
  files: Task[];
  reason: "duplicate-id" | "sync-conflict-name";
}

const CONFLICT_NAME_PATTERNS = [
  /\.sync-conflict-\d{8}-\d{6}(-[A-Z0-9]+)?(?=\.md$)/i, // Syncthing
  / \((?:[^)]*'s )?conflicted copy[^)]*\)(?=\.md$)/i, // Dropbox / Nextcloud
  / \(Konflikt[^)]*\)(?=\.md$)/i,
  /-conflict-\d{8}-\d{6}(?=\.md$)/i,
];

/** Basisname einer Konfliktkopie, sonst null. */
export function conflictBaseName(name: string): string | null {
  for (const re of CONFLICT_NAME_PATTERNS) {
    if (re.test(name)) return name.replace(re, "");
  }
  return null;
}

export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ");
}

function effectiveDates(
  t: Task,
  s: Series | null,
  timeZone: string,
): { due: DateValue | null; scheduled: DateValue | null } {
  if (!s || t.fields.status === "done") return { due: t.fields.due, scheduled: t.fields.scheduled };
  if (s.phase === "clarify" && s.proposal) {
    const other = s.field === "due" ? "scheduled" : "due";
    const time = s.start?.time ?? null;
    const ref: DateValue = time
      ? { kind: "local", dateTime: s.proposal.toPlainDateTime(time), raw: "" }
      : { kind: "date", date: s.proposal, raw: "" };
    let otherVal = t.fields[other];
    const curRef = t.fields[s.field];
    if (otherVal && curRef) {
      // Abstand wie beim Fortschreiben (actions.ts, 5.3): Kalendertage in der Gerätezone.
      const off =
        s.offsetDays ??
        datePart(curRef, timeZone).until(datePart(otherVal, timeZone), { largestUnit: "days" })
          .days;
      otherVal = { kind: "date", date: s.proposal.add({ days: off }), raw: "" };
    }
    return s.field === "due"
      ? { due: ref, scheduled: otherVal }
      : { due: otherVal, scheduled: ref };
  }
  if (s.phase === "clarify" || s.phase === "end-pending") return { due: null, scheduled: null };
  return { due: t.fields.due, scheduled: t.fields.scheduled };
}

interface StaticPart {
  series: Series | null;
  due: DateValue | null;
  scheduled: DateValue | null;
  diagnostics: Diagnostic[];
  searchTitle: string;
  searchBody: string;
}

// Je Datei-Objekt zwischengespeichert: ändert sich nur, wenn die Datei neu gelesen wird (oder die Gerätezone wechselt).
const staticCache = new WeakMap<Task, { timeZone: string; part: StaticPart }>();

function staticPart(t: Task, timeZone: string): StaticPart {
  const cached = staticCache.get(t);
  let st = cached?.timeZone === timeZone ? cached.part : undefined;
  if (!st) {
    const series = readSeries(t);
    const { due, scheduled } = effectiveDates(t, series, timeZone);
    st = {
      series,
      due,
      scheduled,
      diagnostics: [...t.diagnostics, ...(series?.diagnostics ?? [])],
      searchTitle: normalizeSearch(t.fields.title),
      searchBody: normalizeSearch(t.body),
    };
    staticCache.set(t, { timeZone, part: st });
  }
  return st;
}

export function buildIndex(files: IndexedFile[], clock: Clock): Index {
  const today = todayOf(clock);
  const tasks = files.filter((f): f is Task => f.kind === "task");
  const unrecognized = files.filter((f): f is UnrecognizedFile => f.kind !== "task");

  // Konfliktvarianten: gleiche ID und bekannte Konfliktnamen (7.4)
  const byId = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.fields.id) continue;
    const list = byId.get(t.fields.id) ?? [];
    list.push(t);
    byId.set(t.fields.id, list);
  }
  const byName = new Map(tasks.map((t) => [t.name.toLowerCase(), t]));
  const variantOf = new Map<Task, Task>();
  const conflicts: ConflictGroup[] = [];
  for (const [id, list] of byId) {
    if (list.length < 2) continue;
    const named = list.filter((t) => conflictBaseName(t.name) === null);
    const primary = (named.length ? named : list)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))[0]!;
    for (const t of list) if (t !== primary) variantOf.set(t, primary);
    conflicts.push({
      id,
      files: [primary, ...list.filter((t) => t !== primary)],
      reason: "duplicate-id",
    });
  }
  for (const t of tasks) {
    if (variantOf.has(t)) continue;
    const base = conflictBaseName(t.name);
    if (!base) continue;
    const primary = byName.get(base.toLowerCase());
    // Ohne gemeinsame ID nur bei eindeutig bekanntem Konfliktnamen zuordnen.
    if (primary && primary !== t && (!t.fields.id || !primary.fields.id)) {
      variantOf.set(t, primary);
      conflicts.push({ id: primary.fields.id, files: [primary, t], reason: "sync-conflict-name" });
    }
  }

  const views: TaskView[] = [];
  for (const t of tasks) {
    if (variantOf.has(t)) continue;
    const st = staticPart(t, clock.timeZone);
    const { series, due, scheduled } = st;
    const diagnostics = [...st.diagnostics];
    const variants = [...variantOf.entries()].filter(([, p]) => p === t).map(([v]) => v);
    if (variants.length) {
      diagnostics.push({
        code: "conflict-variant",
        message: `${variants.length} Konfliktvariante(n): ${variants.map((v) => v.name).join(", ")}`,
        severity: "warning",
      });
    }
    views.push({
      task: t,
      series,
      due,
      scheduled,
      dueDate: due ? datePart(due, clock.timeZone) : null,
      scheduledDate: scheduled ? datePart(scheduled, clock.timeZone) : null,
      overdue: due !== null && t.fields.status !== "done" && isOverdue(due, clock),
      diagnostics,
      readOnly: t.readOnly || (series?.structureError ?? false),
      variants,
      searchTitle: st.searchTitle,
      searchBody: st.searchBody,
      dueKey: due ? sortKey(due, clock.timeZone) : null,
      scheduledKey: scheduled ? sortKey(scheduled, clock.timeZone) : null,
    });
  }
  return { tasks: views, unrecognized, conflicts, today };
}

// ---------------------------------------------------------------------------
// Sortierung

const collator = new Intl.Collator("de", { sensitivity: "base", numeric: true });

export type SortKey = "due" | "scheduled" | "priority" | "title" | "created";

function cmpKey(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // leere Werte zuletzt
  if (b === null) return -1;
  return a - b;
}

function createdKey(v: TaskView): number | null {
  const raw = v.task.fields.dateCreated;
  if (raw) {
    try {
      return Temporal.Instant.from(raw).epochMilliseconds;
    } catch {
      /* Rückfall auf mtime */
    }
  }
  return v.task.mtime;
}

export function compareBy(
  keys: SortKey[],
  tz: string,
  desc: Partial<Record<SortKey, boolean>> = {},
) {
  return (a: TaskView, b: TaskView): number => {
    for (const k of keys) {
      let c = 0;
      switch (k) {
        case "due":
          c = cmpKey(a.dueKey, b.dueKey);
          break;
        case "scheduled":
          c = cmpKey(a.scheduledKey, b.scheduledKey);
          break;
        case "priority":
          c = PRIORITY_RANK[b.task.fields.priority] - PRIORITY_RANK[a.task.fields.priority];
          break;
        case "title":
          c = collator.compare(a.task.fields.title, b.task.fields.title);
          break;
        case "created": {
          const ca = createdKey(a);
          const cb = createdKey(b);
          if (ca === null && cb === null) c = 0;
          else if (ca === null) c = 1;
          else if (cb === null) c = -1;
          else c = desc.created ? cb - ca : ca - cb;
          break;
        }
      }
      if (c !== 0) return desc[k] && k !== "created" ? -c : c;
    }
    return a.task.name.localeCompare(b.task.name);
  };
}

// ---------------------------------------------------------------------------
// Ansichten

const isDev = (v: TaskView) => v.task.fields.isDevList || v.task.fields.isDevItem;
/** Listen (4.6) und Programmieren (4.8) erscheinen in keiner Aufgabenansicht. */
const isList = (v: TaskView) => v.task.fields.isList || isDev(v);
/** offene Aufgabe */
const isOpen = (v: TaskView) => v.task.fields.status !== "done" && !isList(v);

/** hat ein wirksames `due` oder `scheduled` (bei Serien das aktuelle Vorkommen, 5.2) */
export const hasDate = (v: TaskView): boolean => v.dueDate !== null || v.scheduledDate !== null;

/**
 * Steht im Eingang (4.1): `inbox: true` und ohne wirksamen Termin. Eine Aufgabe mit Termin
 * gilt als zugeteilt und steht unter „Geplant“; die Datei behält `inbox: true`, ohne Termin
 * steht sie wieder im Eingang.
 */
export const inInbox = (v: TaskView): boolean => v.task.fields.inbox && !hasDate(v);

export function inboxView(idx: Index, tz: string, newestFirst = true): TaskView[] {
  return idx.tasks
    .filter((v) => isOpen(v) && inInbox(v))
    .sort(compareBy(["created", "title"], tz, { created: newestFirst }));
}

export interface PlannedGroup {
  /** „earlier“ = vor heute (verstrichene Fristen und Planungstage), sonst der Tag */
  kind: "earlier" | "day";
  /** Tag der Gruppe; bei „earlier“ der früheste enthaltene Tag */
  date: Temporal.PlainDate;
  items: TaskView[];
}

/** früheres der wirksamen Daten */
function plannedDate(v: TaskView): Temporal.PlainDate {
  const d = v.dueDate;
  const s = v.scheduledDate;
  if (d && s) return Temporal.PlainDate.compare(d, s) <= 0 ? d : s;
  return (d ?? s)!;
}

/**
 * Geplant (4.2a): alle offenen Aufgaben mit wirksamem Termin, gruppiert nach dem früheren
 * der beiden Daten. Alles vor heute steht in einer Gruppe „Früher“, danach je Tag eine Gruppe.
 */
export function plannedView(idx: Index, tz: string): PlannedGroup[] {
  const earlier: TaskView[] = [];
  const byDay = new Map<string, { date: Temporal.PlainDate; items: TaskView[] }>();
  let earliest: Temporal.PlainDate | null = null;
  for (const v of idx.tasks) {
    if (!isOpen(v) || !hasDate(v)) continue;
    const d = plannedDate(v);
    if (Temporal.PlainDate.compare(d, idx.today) < 0) {
      earlier.push(v);
      if (!earliest || Temporal.PlainDate.compare(d, earliest) < 0) earliest = d;
      continue;
    }
    const k = d.toString();
    const g = byDay.get(k);
    if (g) g.items.push(v);
    else byDay.set(k, { date: d, items: [v] });
  }
  const cmp = (a: TaskView, b: TaskView) => {
    const c = Temporal.PlainDate.compare(plannedDate(a), plannedDate(b));
    return c || compareBy(["due", "scheduled", "priority", "title"], tz)(a, b);
  };
  const out: PlannedGroup[] = [];
  if (earlier.length) out.push({ kind: "earlier", date: earliest!, items: earlier.sort(cmp) });
  for (const g of [...byDay.values()].sort((a, b) => Temporal.PlainDate.compare(a.date, b.date))) {
    out.push({ kind: "day", date: g.date, items: g.items.sort(cmp) });
  }
  return out;
}

export interface TodayView {
  due: TaskView[];
  plannedToday: TaskView[];
  plannedEarlier: TaskView[];
}

export function todayView(idx: Index, tz: string): TodayView {
  const today = idx.today;
  const due: TaskView[] = [];
  const plannedToday: TaskView[] = [];
  const plannedEarlier: TaskView[] = [];
  for (const v of idx.tasks) {
    if (!isOpen(v)) continue;
    if (v.dueDate && Temporal.PlainDate.compare(v.dueDate, today) <= 0) due.push(v);
    else if (v.scheduledDate) {
      const c = Temporal.PlainDate.compare(v.scheduledDate, today);
      if (c === 0) plannedToday.push(v);
      else if (c < 0) plannedEarlier.push(v);
    }
  }
  due.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return compareBy(["due", "priority", "title"], tz)(a, b);
  });
  // Mit Frist zuerst (nächste Frist oben), dann nur eingeplante nach `scheduled` (4.2, AK-52).
  const planned = compareBy(["due", "scheduled", "priority", "title"], tz);
  plannedToday.sort(planned);
  plannedEarlier.sort(planned);
  return { due, plannedToday, plannedEarlier };
}

export function allOpenView(idx: Index, tz: string): TaskView[] {
  return idx.tasks.filter(isOpen).sort(compareBy(["due", "scheduled", "priority", "title"], tz));
}

export interface DoneOccurrence {
  view: TaskView;
  date: Temporal.PlainDate;
  revision: string | null;
  archived: boolean;
}

export function doneView(idx: Index): { tasks: TaskView[]; occurrences: DoneOccurrence[] } {
  const tasks = idx.tasks
    .filter((v) => !isList(v) && v.task.fields.status === "done")
    .sort((a, b) => {
      const ka = completedKey(a);
      const kb = completedKey(b);
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      return kb - ka;
    });
  const from = idx.today.subtract({ days: 30 });
  const occurrences: DoneOccurrence[] = [];
  const inRange = (d: Temporal.PlainDate) =>
    Temporal.PlainDate.compare(d, from) >= 0 && Temporal.PlainDate.compare(d, idx.today) <= 0;
  for (const v of idx.tasks) {
    if (isList(v)) continue;
    const s = v.series;
    if (s) {
      for (const k of s.C) {
        const d = parseKey(k);
        if (d && inRange(d))
          occurrences.push({ view: v, date: d, revision: s.revision, archived: false });
      }
    }
    const archive = v.task.data.recurrence_archive;
    if (Array.isArray(archive)) {
      for (const snap of archive) {
        if (!snap || typeof snap !== "object" || Array.isArray(snap)) continue;
        const list = (snap as Record<string, unknown>).complete_instances;
        if (!Array.isArray(list)) continue;
        const rev = (snap as Record<string, unknown>).recurrence_revision;
        for (const k of new Set(list)) {
          const d = parseKey(k);
          if (d && inRange(d)) {
            occurrences.push({
              view: v,
              date: d,
              revision: typeof rev === "string" ? rev : null,
              archived: true,
            });
          }
        }
      }
    }
  }
  occurrences.sort((a, b) => Temporal.PlainDate.compare(b.date, a.date));
  return { tasks, occurrences };
}

function completedKey(v: TaskView): number | null {
  for (const raw of [v.task.fields.completedDate, v.task.fields.dateModified]) {
    if (!raw) continue;
    try {
      return Temporal.Instant.from(raw).epochMilliseconds;
    } catch {
      /* weiter */
    }
  }
  return v.task.mtime;
}

export interface ProblemEntry {
  kind: "task" | "file" | "conflict";
  view?: TaskView;
  file?: UnrecognizedFile;
  conflict?: ConflictGroup;
  diagnostics: Diagnostic[];
}

export function problemsView(idx: Index): ProblemEntry[] {
  const out: ProblemEntry[] = [];
  for (const c of idx.conflicts) {
    out.push({
      kind: "conflict",
      conflict: c,
      diagnostics: [
        {
          code: c.reason === "duplicate-id" ? "duplicate-id" : "conflict-variant",
          message:
            c.reason === "duplicate-id"
              ? `Mehrere Dateien mit derselben ID: ${c.files.map((f) => f.name).join(", ")}`
              : `Konfliktkopie: ${c.files.map((f) => f.name).join(", ")}`,
          severity: "warning",
        },
      ],
    });
  }
  for (const v of idx.tasks) {
    const relevant = v.diagnostics.filter(
      (d) => d.severity !== "info" && d.code !== "conflict-variant",
    );
    if (relevant.length) out.push({ kind: "task", view: v, diagnostics: relevant });
  }
  for (const f of idx.unrecognized) out.push({ kind: "file", file: f, diagnostics: f.diagnostics });
  return out;
}

// ---------------------------------------------------------------------------
// Filter (serialisierbar)

export type DueFilter =
  "any" | "none" | "overdue" | "today" | "next7" | { from: string; to: string };
export type ScheduledFilter =
  "any" | "none" | "earlier" | "today" | "next7" | { from: string; to: string };

export interface Filter {
  status?: Status[];
  priority?: Priority[];
  inbox?: "any" | "yes" | "no";
  due?: DueFilter;
  scheduled?: ScheduledFilter;
  recurrence?: "any" | "none" | "calendar" | "completion" | "invalid";
}

function inRange(d: Temporal.PlainDate | null, f: { from: string; to: string }): boolean {
  if (!d) return false;
  return (
    Temporal.PlainDate.compare(d, Temporal.PlainDate.from(f.from)) >= 0 &&
    Temporal.PlainDate.compare(d, Temporal.PlainDate.from(f.to)) <= 0
  );
}

export function matchesFilter(v: TaskView, f: Filter, today: Temporal.PlainDate): boolean {
  if (f.status?.length && !f.status.includes(v.task.fields.status)) return false;
  if (f.priority?.length && !f.priority.includes(v.task.fields.priority)) return false;
  if (f.inbox === "yes" && !inInbox(v)) return false;
  if (f.inbox === "no" && inInbox(v)) return false;
  const next7 = today.add({ days: 7 });
  const within7 = (d: Temporal.PlainDate | null) =>
    !!d && Temporal.PlainDate.compare(d, today) >= 0 && Temporal.PlainDate.compare(d, next7) <= 0;
  if (f.due && f.due !== "any") {
    const d = v.dueDate;
    if (f.due === "none" && d) return false;
    if (f.due === "overdue" && !v.overdue) return false;
    if (f.due === "today" && !(d && d.equals(today))) return false;
    if (f.due === "next7" && !within7(d)) return false;
    if (typeof f.due === "object" && !inRange(d, f.due)) return false;
  }
  if (f.scheduled && f.scheduled !== "any") {
    const d = v.scheduledDate;
    if (f.scheduled === "none" && d) return false;
    if (f.scheduled === "earlier" && !(d && Temporal.PlainDate.compare(d, today) < 0)) return false;
    if (f.scheduled === "today" && !(d && d.equals(today))) return false;
    if (f.scheduled === "next7" && !within7(d)) return false;
    if (typeof f.scheduled === "object" && !inRange(d, f.scheduled)) return false;
  }
  if (f.recurrence && f.recurrence !== "any") {
    const s = v.series;
    if (f.recurrence === "none" && s) return false;
    if (f.recurrence === "calendar" && !(s && s.anchor === "calendar" && s.rule)) return false;
    if (f.recurrence === "completion" && !(s && s.anchor === "completion" && s.rule)) return false;
    if (f.recurrence === "invalid" && !(s && (!s.rule || s.structureError))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Suche (4.3)

export function search(
  idx: Index,
  query: string,
  opts: { includeDone?: boolean } = {},
): TaskView[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const title: TaskView[] = [];
  const content: TaskView[] = [];
  for (const v of idx.tasks) {
    if (!opts.includeDone && !isOpen(v) && !isList(v)) continue;
    const all = words.every((w) => v.searchTitle.includes(w) || v.searchBody.includes(w));
    if (!all) continue;
    if (words.some((w) => v.searchTitle.includes(w))) title.push(v);
    else content.push(v);
  }
  const byTitle = (a: TaskView, b: TaskView) =>
    collator.compare(a.task.fields.title, b.task.fields.title);
  return [...title.sort(byTitle), ...content.sort(byTitle)];
}

// ---------------------------------------------------------------------------
// Listen (4.6)

function modifiedKey(v: TaskView): number | null {
  const raw = v.task.fields.dateModified;
  if (raw) {
    try {
      return Temporal.Instant.from(raw).epochMilliseconds;
    } catch {
      /* Rückfall auf mtime */
    }
  }
  return v.task.mtime;
}

export interface ListProgress {
  done: number;
  total: number;
  open: number;
}

// Je Datei-Objekt zwischengespeichert, damit Sortieren und Filtern markdown-it nicht wiederholt.
const progressCache = new WeakMap<Task, ListProgress>();

/** Fortschritt „abgehakt/gesamt“ einer Liste */
export function listProgress(v: TaskView): ListProgress {
  let p = progressCache.get(v.task);
  if (!p) {
    const items = findCheckboxes(v.task.body);
    const done = items.filter((c) => c.checked).length;
    p = { done, total: items.length, open: items.length - done };
    progressCache.set(v.task, p);
  }
  return p;
}

export type ListSort = "modified" | "open" | "title" | "created";
/** „none-open“: ganz abgehakte und leere Listen */
export type ListFilter = "all" | "open" | "none-open";

export interface ListOptions {
  sort: ListSort;
  /** absteigend (größter Wert bzw. neueste zuerst; beim Titel Z–A) */
  desc: boolean;
  filter: ListFilter;
}

export const LIST_SORT_LABELS: Record<ListSort, string> = {
  modified: "Zuletzt geändert",
  open: "Offene Einträge",
  title: "Titel",
  created: "Erstellt",
};

/** Standardrichtung je Merkmal: neueste bzw. meiste offene zuerst, Titel A–Z */
export const LIST_DEFAULT_DESC: Record<ListSort, boolean> = {
  modified: true,
  open: true,
  title: false,
  created: true,
};

export const LIST_FILTER_LABELS: Record<ListFilter, string> = {
  all: "alle",
  open: "mit offenen Einträgen",
  "none-open": "ohne offene Einträge",
};

export const DEFAULT_LIST_OPTIONS: ListOptions = { sort: "modified", desc: true, filter: "all" };

function listKey(v: TaskView, sort: ListSort): number | null {
  switch (sort) {
    case "modified":
      return modifiedKey(v);
    case "created":
      return createdKey(v);
    case "open":
      return listProgress(v).open;
    case "title":
      return null;
  }
}

/** Alle Listen, standardmäßig zuletzt geänderte zuerst; der Status spielt keine Rolle. */
export function listsView(idx: Index, opts: ListOptions = DEFAULT_LIST_OPTIONS): TaskView[] {
  return sortLists(
    idx.tasks.filter((v) => v.task.fields.isList),
    opts,
    listProgress,
  );
}

/** Filtert und sortiert Listen nach den Übersichtsoptionen (4.6, 4.8). */
function sortLists(lists: TaskView[], opts: ListOptions, progress: (v: TaskView) => ListProgress): TaskView[] {
  const byTitle = (a: TaskView, b: TaskView) => collator.compare(a.task.fields.title, b.task.fields.title);
  const key = (v: TaskView): number | null => (opts.sort === "open" ? progress(v).open : listKey(v, opts.sort));
  return lists
    .filter((v) => {
      if (opts.filter === "open") return progress(v).open > 0;
      if (opts.filter === "none-open") return progress(v).open === 0;
      return true;
    })
    .sort((a, b) => {
      let c: number;
      if (opts.sort === "title") c = byTitle(a, b);
      else {
        const ka = key(a);
        const kb = key(b);
        // Fehlende Werte stehen in beiden Richtungen zuletzt.
        if (ka === null || kb === null) {
          c = cmpKey(ka, kb);
          if (c !== 0) return c;
        } else c = ka - kb;
      }
      if (c !== 0) return opts.desc ? -c : c;
      // Gleichstand: immer nach Titel A–Z
      return byTitle(a, b);
    });
}

// ---------------------------------------------------------------------------
// Programmieren (4.8): Listen (`kind: dev-list`) mit Einträgen als eigene Dateien
// (`kind: dev-item`, `dev_list: <ID der Liste>`). Der Body eines Eintrags ist seine Notiz.

export interface DevIndex {
  lists: TaskView[];
  /** Einträge je Listen-ID */
  items: Map<string, TaskView[]>;
  /** Einträge ohne oder mit unbekannter Liste */
  orphans: TaskView[];
}

const devCache = new WeakMap<Index, DevIndex>();

/** Programmier-Listen und ihre Einträge eines Index (zwischengespeichert). */
export function devIndex(idx: Index): DevIndex {
  let d = devCache.get(idx);
  if (d) return d;
  const lists: TaskView[] = [];
  const ids = new Set<string>();
  for (const v of idx.tasks) {
    if (!v.task.fields.isDevList) continue;
    lists.push(v);
    if (v.task.fields.id) ids.add(v.task.fields.id);
  }
  const items = new Map<string, TaskView[]>();
  const orphans: TaskView[] = [];
  for (const v of idx.tasks) {
    if (!v.task.fields.isDevItem) continue;
    const l = v.task.fields.devList;
    if (l && ids.has(l)) {
      const arr = items.get(l);
      if (arr) arr.push(v);
      else items.set(l, [v]);
    } else orphans.push(v);
  }
  d = { lists, items, orphans };
  devCache.set(idx, d);
  return d;
}

/** Einträge einer Programmier-Liste; `null` = Einträge ohne Liste. */
export function devItemsOf(idx: Index, list: TaskView | null): TaskView[] {
  const d = devIndex(idx);
  if (!list) return d.orphans;
  const id = list.task.fields.id;
  return (id && d.items.get(id)) || [];
}

/** Fortschritt „erledigt/gesamt“ einer Programmier-Liste bzw. (`null`) der Einträge ohne Liste */
export function devListProgress(idx: Index, list: TaskView | null): ListProgress {
  const items = devItemsOf(idx, list);
  const done = items.filter((v) => v.task.fields.status === "done").length;
  return { done, total: items.length, open: items.length - done };
}

/** Programmier-Listen mit denselben Optionen wie die Listen-Übersicht (4.6). */
export function devListsView(idx: Index, opts: ListOptions = DEFAULT_LIST_OPTIONS): TaskView[] {
  return sortLists(devIndex(idx).lists, opts, (v) => devListProgress(idx, v));
}

export type DevItemSort = "created" | "modified" | "title";

export interface DevItemOptions {
  sort: DevItemSort;
  /** absteigend (neueste zuerst; beim Titel Z–A) */
  desc: boolean;
}

export const DEV_ITEM_SORT_LABELS: Record<DevItemSort, string> = {
  created: "Erstellt",
  modified: "Zuletzt geändert",
  title: "Titel",
};

/** Standardrichtung je Merkmal: neueste zuerst, Titel A–Z */
export const DEV_ITEM_DEFAULT_DESC: Record<DevItemSort, boolean> = {
  created: true,
  modified: true,
  title: false,
};

export const DEFAULT_DEV_ITEM_OPTIONS: DevItemOptions = { sort: "created", desc: true };

/**
 * Einträge einer Programmier-Liste (`null` = ohne Liste), offen und erledigt getrennt.
 * Erledigte stehen unabhängig von der Wahl zuletzt erledigt zuerst.
 */
export function devItemsView(
  idx: Index,
  list: TaskView | null,
  opts: DevItemOptions = DEFAULT_DEV_ITEM_OPTIONS,
): { open: TaskView[]; done: TaskView[] } {
  const byTitle = (a: TaskView, b: TaskView) => collator.compare(a.task.fields.title, b.task.fields.title);
  const open: TaskView[] = [];
  const done: TaskView[] = [];
  for (const v of devItemsOf(idx, list)) (v.task.fields.status === "done" ? done : open).push(v);
  open.sort((a, b) => {
    let c: number;
    if (opts.sort === "title") c = byTitle(a, b);
    else {
      const ka = opts.sort === "created" ? createdKey(a) : modifiedKey(a);
      const kb = opts.sort === "created" ? createdKey(b) : modifiedKey(b);
      if (ka === null || kb === null) {
        c = cmpKey(ka, kb);
        if (c !== 0) return c;
      } else c = ka - kb;
    }
    if (c !== 0) return opts.desc ? -c : c;
    return byTitle(a, b);
  });
  done.sort((a, b) => {
    const ka = completedKey(a);
    const kb = completedKey(b);
    // ohne Erledigungszeit zuletzt
    const c = ka === null || kb === null ? cmpKey(ka, kb) : kb - ka;
    return c || byTitle(a, b);
  });
  return { open, done };
}

// Board (4.10): Spalten Neu, In Arbeit, Erledigt; Filter nach Art.

export type DevTypeFilter = "all" | DevType;

/** Die Spalte „Erledigt“ zeigt zunächst nur so viele Karten (4.10). */
export const DEV_DONE_LIMIT = 10;

export interface DevBoard {
  /** Spalte „Neu“ (`status: open`) */
  open: TaskView[];
  /** Spalte „In Arbeit“ */
  work: TaskView[];
  /** Spalte „Erledigt“, zuletzt erledigte zuerst (alle; die Oberfläche kürzt auf `DEV_DONE_LIMIT`) */
  done: TaskView[];
  /** nicht erledigte Einträge je Filter, für die Chips */
  counts: Record<DevTypeFilter, number>;
}

/** Board einer Programmier-Liste (`null` = ohne Liste). Einträge ohne Art erscheinen nur unter „all“. */
export function devBoardView(
  idx: Index,
  list: TaskView | null,
  opts: DevItemOptions = DEFAULT_DEV_ITEM_OPTIONS,
  filter: DevTypeFilter = "all",
): DevBoard {
  const { open, done } = devItemsView(idx, list, opts);
  const counts: Record<DevTypeFilter, number> = { all: open.length, bug: 0, feature: 0, idea: 0 };
  for (const v of open) {
    const t = v.task.fields.devType;
    if (t) counts[t]++;
  }
  const match = (v: TaskView) => filter === "all" || v.task.fields.devType === filter;
  return {
    open: open.filter((v) => v.task.fields.status !== "in-progress" && match(v)),
    work: open.filter((v) => v.task.fields.status === "in-progress" && match(v)),
    done: done.filter(match),
    counts,
  };
}

/** Abfuhrart einer Müllabfuhr-Serie (4.7), sonst null. */
export function wasteTypeOf(v: TaskView): string | null {
  const w = v.task.data.waste_type;
  return !isList(v) && typeof w === "string" && w.trim() ? w : null;
}

export interface WasteEntry {
  view: TaskView;
  wasteType: string;
  /** aktuelles Vorkommen (kann überfällig sein); null bei beendeter oder gesperrter Serie */
  next: Temporal.PlainDate | null;
  /** noch offene Termine ab dem aktuellen einschließlich */
  remaining: number;
}

/** Müllabfuhr-Übersicht (4.7): eine Zeile je Abfuhrart, nach nächstem Termin; ohne Termin zuletzt. */
export function wasteView(idx: Index): WasteEntry[] {
  const out: WasteEntry[] = [];
  for (const v of idx.tasks) {
    const wasteType = wasteTypeOf(v);
    if (!wasteType) continue;
    const s = v.series;
    const active = s && s.phase === "active" && v.task.fields.status !== "done";
    out.push({
      view: v,
      wasteType,
      next: active ? s.instance : null,
      remaining: s ? remainingListDates(s).length : 0,
    });
  }
  return out.sort((a, b) => {
    if (a.next && b.next) {
      const c = Temporal.PlainDate.compare(a.next, b.next);
      if (c !== 0) return c;
    } else if (a.next || b.next) return a.next ? -1 : 1;
    return collator.compare(a.view.task.fields.title, b.view.task.fields.title);
  });
}

// ---------------------------------------------------------------------------
// Wählbare Sortierung (4.3): Fälligkeit, Planung, Priorität, Titel, Erstelldatum

export type SortChoice = "default" | SortKey;

export const SORT_LABELS: Record<SortChoice, string> = {
  default: "Standard",
  due: "Fälligkeit",
  scheduled: "Planung",
  priority: "Priorität",
  title: "Titel",
  created: "Erstelldatum",
};

/** Sortiert eine Liste nach der gewählten Reihenfolge; „Standard“ lässt die Ansichtsreihenfolge. */
export function sortViews(list: TaskView[], choice: SortChoice, tz: string): TaskView[] {
  if (choice === "default") return list;
  const tail: SortKey[] = ["due", "scheduled", "priority", "title"].filter(
    (k) => k !== choice,
  ) as SortKey[];
  return [...list].sort(
    compareBy([choice, ...tail], tz, choice === "created" ? { created: true } : {}),
  );
}
