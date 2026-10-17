// Index, Ansichten, Filter, Sortierung und Suche (4.1–4.3, 7.4).
import { Temporal } from "temporal-polyfill";
import {
  datePart,
  isOverdue,
  sortKey,
  todayOf,
  type Clock,
  type DateValue,
} from "./dates";
import { readSeries, parseKey, type Series } from "./recurrence/series";
import {
  PRIORITY_RANK,
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

function effectiveDates(t: Task, s: Series | null): { due: DateValue | null; scheduled: DateValue | null } {
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
      const off =
        s.offsetDays ??
        datePart(curRef, "UTC").until(datePart(otherVal, "UTC"), { largestUnit: "days" }).days;
      otherVal = { kind: "date", date: s.proposal.add({ days: off }), raw: "" };
    }
    return s.field === "due" ? { due: ref, scheduled: otherVal } : { due: otherVal, scheduled: ref };
  }
  if (s.phase === "clarify" || s.phase === "end-pending") return { due: null, scheduled: null };
  return { due: t.fields.due, scheduled: t.fields.scheduled };
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
    const primary = (named.length ? named : list).slice().sort((a, b) => a.name.localeCompare(b.name))[0]!;
    for (const t of list) if (t !== primary) variantOf.set(t, primary);
    conflicts.push({ id, files: [primary, ...list.filter((t) => t !== primary)], reason: "duplicate-id" });
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
    const series = readSeries(t);
    const { due, scheduled } = effectiveDates(t, series);
    const diagnostics = [...t.diagnostics, ...(series?.diagnostics ?? [])];
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
      searchTitle: normalizeSearch(t.fields.title),
      searchBody: normalizeSearch(t.body),
    });
  }
  return { tasks: views, unrecognized, conflicts, today };
}

// ---------------------------------------------------------------------------
// Sortierung

const collator = new Intl.Collator("de", { sensitivity: "base", numeric: true });

export type SortKey = "due" | "scheduled" | "priority" | "title" | "created";

function cmpDate(a: DateValue | null, b: DateValue | null, tz: string): number {
  if (!a && !b) return 0;
  if (!a) return 1; // leere Werte zuletzt
  if (!b) return -1;
  return sortKey(a, tz) - sortKey(b, tz);
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

export function compareBy(keys: SortKey[], tz: string, desc: Partial<Record<SortKey, boolean>> = {}) {
  return (a: TaskView, b: TaskView): number => {
    for (const k of keys) {
      let c = 0;
      switch (k) {
        case "due":
          c = cmpDate(a.due, b.due, tz);
          break;
        case "scheduled":
          c = cmpDate(a.scheduled, b.scheduled, tz);
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

const isOpen = (v: TaskView) => v.task.fields.status !== "done";

export function inboxView(idx: Index, tz: string, newestFirst = true): TaskView[] {
  return idx.tasks
    .filter((v) => isOpen(v) && v.task.fields.inbox)
    .sort(compareBy(["created", "title"], tz, { created: newestFirst }));
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
  const planned = compareBy(["scheduled", "priority", "title"], tz);
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
    .filter((v) => !isOpen(v))
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
    const s = v.series;
    if (s) {
      for (const k of s.C) {
        const d = parseKey(k);
        if (d && inRange(d)) occurrences.push({ view: v, date: d, revision: s.revision, archived: false });
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
            occurrences.push({ view: v, date: d, revision: typeof rev === "string" ? rev : null, archived: true });
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
    const relevant = v.diagnostics.filter((d) => d.severity !== "info" && d.code !== "conflict-variant");
    if (relevant.length) out.push({ kind: "task", view: v, diagnostics: relevant });
  }
  for (const f of idx.unrecognized) out.push({ kind: "file", file: f, diagnostics: f.diagnostics });
  return out;
}

// ---------------------------------------------------------------------------
// Filter (serialisierbar)

export type DueFilter = "any" | "none" | "overdue" | "today" | "next7" | { from: string; to: string };
export type ScheduledFilter = "any" | "none" | "earlier" | "today" | "next7" | { from: string; to: string };

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
  if (f.inbox === "yes" && !v.task.fields.inbox) return false;
  if (f.inbox === "no" && v.task.fields.inbox) return false;
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

export function search(idx: Index, query: string, opts: { includeDone?: boolean } = {}): TaskView[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const title: TaskView[] = [];
  const content: TaskView[] = [];
  for (const v of idx.tasks) {
    if (!opts.includeDone && !isOpen(v)) continue;
    const all = words.every((w) => v.searchTitle.includes(w) || v.searchBody.includes(w));
    if (!all) continue;
    if (words.some((w) => v.searchTitle.includes(w))) title.push(v);
    else content.push(v);
  }
  const byTitle = (a: TaskView, b: TaskView) => collator.compare(a.task.fields.title, b.task.fields.title);
  return [...title.sort(byTitle), ...content.sort(byTitle)];
}
