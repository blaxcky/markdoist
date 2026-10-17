// Serienzustand aus der Datei lesen (5.1, 5.2). Liest nur, schreibt nie.
import { Temporal } from "temporal-polyfill";
import { parseDateValue, type DateValue } from "../dates";
import type { YamlValue } from "../frontmatter";
import type { Diagnostic, Task } from "../task";
import { nextOccurrence, queryOccurrences } from "./engine";
import { parseRule, type Rule, type RuleParse } from "./rule";

export type Anchor = "calendar" | "completion";
export type RefField = "due" | "scheduled";

export type SeriesPhase =
  /** offenes, ungelöstes K */
  | "active"
  /** status: done */
  | "ended"
  /** Regel ungültig/nicht unterstützt: nur Regel bearbeiten oder entfernen */
  | "blocked"
  /** K bereits aufgelöst, Datei offen: Fortschreibung klären */
  | "clarify"
  /** K aufgelöst und Regel erschöpft: Serienende noch nicht übernommen */
  | "end-pending"
  /** K steht in C und S */
  | "conflicting"
  /** keine Grundlage für K */
  | "no-instance";

export interface SeriesStart {
  date: Temporal.PlainDate;
  time: Temporal.PlainTime | null;
}

export interface Series {
  raw: string;
  parse: RuleParse;
  rule: Rule | null;
  /** gespeicherte Revision oder null (temporär, wird bei Serienaktion materialisiert) */
  revision: string | null;
  /** Identität des aktiven Abschnitts für Aktionen (gespeichert oder temporär) */
  revisionKey: string;
  start: SeriesStart | null;
  anchor: Anchor;
  field: RefField;
  offsetDays: number | null;
  instance: Temporal.PlainDate | null;
  C: Set<string>;
  S: Set<string>;
  lastCompletedAt: string | null;
  archive: YamlValue[];
  phase: SeriesPhase;
  /** Kalender-Vorschlag bei „clarify“ */
  proposal: Temporal.PlainDate | null;
  diagnostics: Diagnostic[];
  /** unbekannte Struktur der Serienfelder → Datei schreibgeschützt */
  structureError: boolean;
}

export const SERIES_FIELDS = [
  "recurrence",
  "recurrence_revision",
  "recurrence_archive",
  "recurrence_start",
  "recurrence_anchor",
  "recurrence_field",
  "recurrence_offset_days",
  "recurrence_instance",
  "complete_instances",
  "skipped_instances",
  "last_completed_at",
] as const;

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseKey(v: unknown): Temporal.PlainDate | null {
  if (typeof v !== "string" || !KEY_RE.test(v)) return null;
  try {
    return Temporal.PlainDate.from(v, { overflow: "reject" });
  } catch {
    return null;
  }
}

function parseStart(v: unknown): SeriesStart | null {
  const d = parseDateValue(v);
  if (!d) return null;
  if (d.kind === "date") return { date: d.date, time: null };
  if (d.kind === "local") return { date: d.dateTime.toPlainDate(), time: d.dateTime.toPlainTime() };
  return null;
}

function dateOf(v: DateValue | null): Temporal.PlainDate | null {
  if (!v) return null;
  if (v.kind === "date") return v.date;
  if (v.kind === "local") return v.dateTime.toPlainDate();
  return null;
}

export function readSeries(task: Task): Series | null {
  const data = task.data;
  if (!("recurrence" in data) || data.recurrence === null || data.recurrence === "") return null;
  const diagnostics: Diagnostic[] = [];
  let structureError = false;
  const structure = (field: string, message: string) => {
    structureError = true;
    diagnostics.push({ code: "invalid-recurrence-structure", message, severity: "error", field });
  };

  const raw = typeof data.recurrence === "string" ? data.recurrence : String(data.recurrence);
  if (typeof data.recurrence !== "string") structure("recurrence", "Feld recurrence ist kein Text");
  const parse = parseRule(raw);
  const rule = parse.status === "ok" ? parse.rule : null;
  if (parse.status === "unsupported") {
    diagnostics.push({
      code: "unsupported-recurrence",
      message: `Nicht unterstützte Regel: ${parse.message}`,
      severity: "warning",
      field: "recurrence",
    });
  } else if (parse.status === "invalid") {
    diagnostics.push({
      code: "invalid-recurrence",
      message: `Ungültige Regel: ${parse.message}`,
      severity: "warning",
      field: "recurrence",
    });
  }

  const revision =
    typeof data.recurrence_revision === "string" && data.recurrence_revision.trim()
      ? data.recurrence_revision.trim()
      : null;
  if ("recurrence_revision" in data && revision === null) {
    structure("recurrence_revision", "recurrence_revision ist ungültig");
  }

  let anchor: Anchor = "calendar";
  if ("recurrence_anchor" in data) {
    if (data.recurrence_anchor === "calendar" || data.recurrence_anchor === "completion") {
      anchor = data.recurrence_anchor;
    } else structure("recurrence_anchor", "Unbekannte Wiederholungsart");
  }

  const hasDue = data.due !== undefined && data.due !== null && data.due !== "";
  let field: RefField = hasDue ? "due" : "scheduled";
  if ("recurrence_field" in data) {
    if (data.recurrence_field === "due" || data.recurrence_field === "scheduled") {
      field = data.recurrence_field;
    } else structure("recurrence_field", "Unbekanntes Bezugsfeld");
  }

  let offsetDays: number | null = null;
  if ("recurrence_offset_days" in data && data.recurrence_offset_days !== null) {
    const v = data.recurrence_offset_days;
    if (typeof v === "number" && Number.isInteger(v)) offsetDays = v;
    else structure("recurrence_offset_days", "recurrence_offset_days ist keine Ganzzahl");
  }

  const readSet = (key: "complete_instances" | "skipped_instances"): Set<string> => {
    const out = new Set<string>();
    if (!(key in data) || data[key] === null) return out;
    const v = data[key];
    if (!Array.isArray(v)) {
      structure(key, `${key} ist keine Liste`);
      return out;
    }
    for (const item of v) {
      const d = parseKey(item);
      if (!d) {
        structure(key, `${key} enthält einen ungültigen Eintrag „${String(item)}“`);
        continue;
      }
      out.add(d.toString());
    }
    return out;
  };
  const C = readSet("complete_instances");
  const S = readSet("skipped_instances");

  let archive: YamlValue[] = [];
  if ("recurrence_archive" in data && data.recurrence_archive !== null) {
    const v = data.recurrence_archive;
    if (!Array.isArray(v) || v.some((x) => x === null || typeof x !== "object" || Array.isArray(x))) {
      structure("recurrence_archive", "recurrence_archive hat eine unbekannte Struktur");
    } else {
      archive = v;
      const revs = new Set<string>();
      for (const snap of v as Record<string, YamlValue>[]) {
        const r = snap.recurrence_revision;
        if (typeof r === "string") {
          if (revs.has(r)) structure("recurrence_archive", `Revision ${r} doppelt im Archiv`);
          revs.add(r);
        }
      }
    }
  }

  const lastCompletedAt = typeof data.last_completed_at === "string" ? data.last_completed_at : null;

  // recurrence_start: DTSTART aus recurrence → recurrence_instance → Bezugsfeld → dateCreated
  let start: SeriesStart | null = null;
  if ("recurrence_start" in data) {
    start = parseStart(data.recurrence_start);
    if (!start) structure("recurrence_start", "recurrence_start ist ungültig");
  } else if (parse.dtstart && !parse.dtstart.utc) {
    start = { date: parse.dtstart.date, time: parse.dtstart.time };
  } else if (parse.dtstart) {
    start = { date: parse.dtstart.date, time: null };
  } else {
    const inst = parseKey(data.recurrence_instance);
    const refDate = dateOf(task.fields[field]);
    const created =
      typeof data.dateCreated === "string" ? parseKey(data.dateCreated.slice(0, 10)) : null;
    const d = inst ?? refDate ?? created;
    if (d) start = { date: d, time: null };
  }

  // recurrence_instance (K)
  let instance: Temporal.PlainDate | null = null;
  if ("recurrence_instance" in data) {
    instance = parseKey(data.recurrence_instance);
    if (!instance) structure("recurrence_instance", "recurrence_instance ist ungültig");
  } else {
    instance = dateOf(task.fields[field]);
    if (!instance && rule && start) {
      const n = nextOccurrence({ rule, start: start.date, from: start.date, time: start.time });
      if (n.kind === "found") instance = n.date;
    }
  }

  let phase: SeriesPhase;
  let proposal: Temporal.PlainDate | null = null;
  const revisionKey = revision ?? `legacy:${raw}|${start?.date ?? ""}`;
  if (task.fields.status === "done") phase = "ended";
  else if (!rule || structureError) phase = "blocked";
  else if (!instance || !start) {
    phase = "no-instance";
    diagnostics.push({
      code: "series-needs-clarification",
      message: "Kein aktuelles Vorkommen bestimmbar – Regel bearbeiten oder Wiederholung entfernen",
      severity: "warning",
      field: "recurrence_instance",
    });
  } else {
    const k = instance.toString();
    if (C.has(k) && S.has(k)) {
      phase = "conflicting";
      diagnostics.push({
        code: "series-conflicting-history",
        message: `Vorkommen ${k} ist zugleich erledigt und übersprungen`,
        severity: "warning",
      });
    } else if (C.has(k) || S.has(k)) {
      if (anchor === "calendar") {
        const n = nextOccurrence({
          rule,
          start: start.date,
          time: start.time,
          after: instance,
          exclude: (d) => C.has(d.toString()) || S.has(d.toString()),
        });
        if (n.kind === "found") {
          phase = "clarify";
          proposal = n.date;
          diagnostics.push({
            code: "series-needs-clarification",
            message: `Fortschreibung klären: Vorkommen ${k} ist bereits aufgelöst, vorgeschlagen ${n.date}`,
            severity: "warning",
          });
        } else if (n.kind === "exhausted") {
          phase = "end-pending";
          diagnostics.push({
            code: "series-end-pending",
            message: "Serienende noch nicht übernommen",
            severity: "warning",
          });
        } else {
          phase = "clarify";
          diagnostics.push({
            code: "series-needs-clarification",
            message: "Fortschreibung klären: Berechnung zu aufwendig",
            severity: "warning",
          });
        }
      } else {
        phase = "clarify";
        diagnostics.push({
          code: "series-needs-clarification",
          message: `Fortschreibung klären: Vorkommen ${k} ist bereits aufgelöst`,
          severity: "warning",
        });
      }
    } else phase = "active";
  }

  return {
    raw,
    parse,
    rule,
    revision,
    revisionKey,
    start,
    anchor,
    field,
    offsetDays,
    instance,
    C,
    S,
    lastCompletedAt,
    archive,
    phase,
    proposal,
    diagnostics,
    structureError,
  };
}

/** Nächste Termine für die Vorschau (höchstens `limit`). */
export function previewDates(
  rule: Rule,
  start: Temporal.PlainDate,
  from: Temporal.PlainDate,
  limit = 10,
): { dates: Temporal.PlainDate[]; exhausted: boolean; aborted: boolean } {
  return queryOccurrences({ rule, start, from, limit });
}
