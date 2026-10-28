// Aktionen auf Aufgaben (4.4, 5.3, 5.4). Rein funktional: liefert einen Änderungsplan,
// der anschließend chirurgisch auf den Dateitext angewandt wird (7.2).
import { Temporal } from "temporal-polyfill";
import {
  appendItem,
  findCheckboxes,
  moveItem,
  removeCheckedItems,
  removeItem,
  resetCheckboxes,
  setItemText,
  toggleCheckbox,
} from "./checklist";
import { datePart, formatTimestamp, parseDateValue, type DateValue } from "./dates";
import { createFileText, deepEqual, editFrontmatter, type YamlValue } from "./frontmatter";
import {
  completionOccurrences,
  firstOccurrence,
  isOccurrence,
  nextOccurrence,
} from "./recurrence/engine";
import { parseRule, sameRule, type Rule } from "./recurrence/rule";
import {
  parseKey,
  readSeries,
  SERIES_FIELDS,
  type Anchor,
  type RefField,
  type Series,
} from "./recurrence/series";
import {
  BASE_FORMAT_VERSION,
  DATE_LIST_FORMAT_VERSION,
  type Priority,
  type Status,
  type Task,
} from "./task";

export interface ActionContext {
  /** einmal festgehaltener Aktionszeitpunkt */
  at: Temporal.Instant;
  timeZone: string;
  newId: () => string;
}

export interface SeriesSpec {
  /** RRULE-Text ohne DTSTART */
  rule: string;
  anchor: Anchor;
  field: RefField;
  /** gewählter Start: Datum oder lokale Datumszeit (Uhrzeit = Serienuhrzeit) */
  start: string;
  offsetDays: number | null;
}

export type TaskAction =
  | { type: "complete" }
  | { type: "reopen" }
  | { type: "setStatus"; status: Status }
  | { type: "setPriority"; priority: Priority }
  | { type: "setInbox"; inbox: boolean }
  | { type: "setTitle"; title: string }
  | { type: "setDate"; field: "due" | "scheduled"; value: string | null }
  | { type: "setBody"; body: string }
  /** `expect`: angezeigter Eintragstext; weicht die Zeile inzwischen ab, wird nichts geschrieben (4.6). */
  | { type: "toggleCheckbox"; line: number; expect?: string }
  | { type: "addItem"; text: string }
  | { type: "editItem"; line: number; text: string; expect?: string }
  | { type: "removeItem"; line: number; expect?: string }
  | { type: "moveItem"; line: number; before: number | null; expect?: string; expectBefore?: string }
  | { type: "removeCheckedItems" }
  | { type: "resetItems" }
  | { type: "assignNewId" }
  | { type: "completeOccurrence"; revision: string; instance: string }
  | { type: "skipOccurrence"; revision: string; instance: string }
  | { type: "endSeries"; revision: string; instance: string; completeCurrent: boolean }
  | { type: "reopenSeries"; revision: string }
  | { type: "setException"; revision: string; date: string; skipped: boolean }
  | { type: "createSeries"; spec: SeriesSpec }
  | {
      type: "changeRule";
      revision: string;
      spec: SeriesSpec;
      restartCount: boolean;
      resetChecklists: boolean;
      carryExceptions?: string[];
    }
  | { type: "changeReference"; revision: string; field: RefField; offsetDays: number | null }
  | { type: "removeRecurrence"; revision: string }
  /** Importabgleich einer festen Terminliste (4.7, 5.7): `dates` sind die importierten Termine
   *  dieser Serie, `range` der Zeitraum der ganzen Importdatei (erster bis letzter Termin aller Arten;
   *  ohne Angabe der dieser Serie); `wasteType` setzt die Abfuhrart neu (Zuordnung bei geändertem Schlüssel). */
  | {
      type: "mergeDates";
      revision: string;
      dates: string[];
      range?: { from: string; to: string };
      wasteType?: string;
    };

export type Plan =
  | { kind: "noop" }
  | { kind: "blocked"; message: string }
  | {
      kind: "edit";
      set: Record<string, YamlValue>;
      remove: string[];
      body?: string;
      /** Hinweis für die Oberfläche, z. B. neuer Termin oder Serienende */
      note?: string;
    };

const noop: Plan = { kind: "noop" };
const LIST_CHANGED = "Die Liste hat sich inzwischen geändert – bitte erneut versuchen";

/** Steht in `line` ein Eintrag mit dem erwarteten Text (ohne Erwartung: irgendein Eintrag)? */
function itemMatches(body: string, line: number, expect: string | undefined): boolean {
  if (expect === undefined) return true;
  return findCheckboxes(body).some((c) => c.line === line && c.text === expect);
}
const blocked = (message: string): Plan => ({ kind: "blocked", message });

function isSeriesAction(a: TaskAction): boolean {
  return [
    "completeOccurrence",
    "skipOccurrence",
    "endSeries",
    "reopenSeries",
    "setException",
    "createSeries",
    "changeRule",
    "changeReference",
    "removeRecurrence",
    "mergeDates",
  ].includes(a.type);
}

/** Erstellt den Änderungsplan. Prüft Vorbedingungen gegen den übergebenen Dateistand. */
export function planAction(task: Task, action: TaskAction, ctx: ActionContext): Plan {
  if (task.readOnly) return blocked("Datei ist schreibgeschützt (siehe Probleme)");
  const series = readSeries(task);
  if (series?.structureError) return blocked("Serienfelder haben eine unbekannte Struktur");
  const plan = planInner(task, series, action, ctx);
  if (plan.kind !== "edit") return plan;
  // No-op-Erkennung: bereits erfüllter Zielzustand schreibt nichts.
  const changes =
    Object.entries(plan.set).some(([k, v]) => !deepEqual(task.data[k], v)) ||
    plan.remove.some((k) => k in task.data) ||
    (plan.body !== undefined && plan.body !== task.body);
  if (!changes) return noop;
  // Unveränderte Werte nicht anfassen (Quelltext bleibt byte-genau).
  for (const [k, v] of Object.entries(plan.set)) if (deepEqual(task.data[k], v)) delete plan.set[k];
  plan.remove = plan.remove.filter((k) => k in task.data);
  // Echte ID beim ersten aktiven Schreiben vergeben (3.2).
  if (!task.fields.id && !("id" in plan.set)) plan.set.id = ctx.newId();
  if (isSeriesAction(action)) {
    // Feste Terminlisten verlangen Version 2 (3.2, 5.7); nie zurückstufen.
    const needed = series?.dates ? DATE_LIST_FORMAT_VERSION : BASE_FORMAT_VERSION;
    const have = task.fields.formatVersion;
    if (have === null || have < needed) plan.set.format_version = needed;
  }
  plan.set.dateModified = formatTimestamp(ctx.at, ctx.timeZone);
  return plan;
}

/** Wendet einen Plan auf den Dateitext an (chirurgisch, mit Selbstprüfung). */
export function applyPlan(
  text: string,
  plan: Plan,
): { ok: true; text: string } | { ok: false; message: string } {
  if (plan.kind !== "edit") return { ok: false, message: "Kein Änderungsplan" };
  const r = editFrontmatter(text, { set: plan.set, remove: plan.remove }, plan.body);
  return r.ok ? r : { ok: false, message: r.message };
}

/** Felder, deren Gleichheit die unabhängige Anwendung auf einen frischen Text erlaubt (7.3). */
export function actionDependencies(
  action: TaskAction,
  plan: Plan,
): { fields: string[]; body: boolean } {
  const fields = new Set<string>();
  if (plan.kind === "edit") {
    for (const k of Object.keys(plan.set)) if (k !== "dateModified" && k !== "id") fields.add(k);
    for (const k of plan.remove) fields.add(k);
  }
  let body = plan.kind === "edit" && plan.body !== undefined;
  switch (action.type) {
    case "complete":
    case "reopen":
    case "setStatus":
      fields.add("status").add("completedDate");
      break;
    case "setBody":
    case "toggleCheckbox":
    case "addItem":
    case "editItem":
    case "removeItem":
    case "moveItem":
    case "removeCheckedItems":
    case "resetItems":
      body = true;
      break;
    case "setDate":
      fields.add(action.field);
      break;
    default:
      break;
  }
  if (
    isSeriesAction(action) ||
    action.type === "complete" ||
    action.type === "reopen" ||
    action.type === "setDate"
  ) {
    for (const f of SERIES_FIELDS) fields.add(f);
    fields.add("due").add("scheduled").add("status").add("completedDate").add("format_version");
  }
  return { fields: [...fields], body };
}

function dateValueString(d: Temporal.PlainDate, time: Temporal.PlainTime | null): string {
  return time ? `${d}T${time.toString({ smallestUnit: "minute" })}` : d.toString();
}

function sortedKeys(s: Set<string>): string[] {
  return [...s].sort();
}

function actionDay(ctx: ActionContext): Temporal.PlainDate {
  return ctx.at.toZonedDateTimeISO(ctx.timeZone).toPlainDate();
}

function maxDate(a: Temporal.PlainDate, b: Temporal.PlainDate): Temporal.PlainDate {
  return Temporal.PlainDate.compare(a, b) >= 0 ? a : b;
}

function legacyKey(series: Series): string {
  return `legacy:${series.raw}|${series.start?.date ?? ""}`;
}

function revisionMatches(series: Series, rev: string): boolean {
  return rev === series.revisionKey || rev === legacyKey(series);
}

const OUT_OF_RANGE = "Termin liegt außerhalb des unterstützten Datumsbereichs";

/** Vorkommensschlüssel und Dateiformat verlangen vierstellige Jahre (3.2). */
function inDateRange(d: Temporal.PlainDate): boolean {
  return d.year >= 1 && d.year <= 9999;
}

/** Datumsfelder für ein neues Vorkommen nach 5.3. Liegt der Termin oder ein daraus abgeleitetes
 *  Datumsfeld außerhalb des unterstützten Bereichs, wird nichts geschrieben (Review 23.10.2026, R6;
 *  Nachprüfung 24.10.2026, N2). */
function datesForInstance(
  task: Task,
  series: Pick<Series, "field" | "offsetDays" | "start">,
  k: Temporal.PlainDate,
  explicitOffset: number | null | undefined,
  timeZone: string,
): { set: Record<string, YamlValue>; error?: string } {
  const set: Record<string, YamlValue> = {};
  if (!inDateRange(k)) return { set, error: OUT_OF_RANGE };
  const time = series.start?.time ?? null;
  set[series.field] = dateValueString(k, time);
  const other: RefField = series.field === "due" ? "scheduled" : "due";
  const otherRaw = task.data[other];
  const otherSet = otherRaw !== undefined && otherRaw !== null && otherRaw !== "";
  const offset =
    explicitOffset !== undefined && explicitOffset !== null ? explicitOffset : series.offsetDays;
  if (!otherSet) {
    if (explicitOffset !== undefined && explicitOffset !== null) {
      const d = k.add({ days: explicitOffset });
      if (!inDateRange(d)) return { set, error: OUT_OF_RANGE };
      set[other] = d.toString();
    }
    return { set };
  }
  const otherVal = parseDateValue(otherRaw);
  if (!otherVal) return { set, error: `Ungültiges Datum in ${other} – bitte zuerst korrigieren` };
  let off = offset;
  if (off === null) {
    const refVal = task.fields[series.field];
    if (!refVal)
      return { set, error: `Ungültiges Datum in ${series.field} – bitte zuerst korrigieren` };
    // Kalendertage in der Gerätezone, damit Offset-Werte ihren lokalen Tag behalten (3.3).
    off = datePart(refVal, timeZone).until(datePart(otherVal, timeZone), {
      largestUnit: "days",
    }).days;
  }
  const newOther = k.add({ days: off });
  if (!inDateRange(newOther)) return { set, error: OUT_OF_RANGE };
  set[other] = withTimeOf(newOther, otherVal, timeZone);
  return { set };
}

function withTimeOf(d: Temporal.PlainDate, v: DateValue, timeZone: string): string {
  if (v.kind === "date") return d.toString();
  if (v.kind === "local") return dateValueString(d, v.dateTime.toPlainTime());
  // Offset-Import: die lokale Wanduhrzeit des Instants bleibt, geschrieben wird lokal (3.3, 5.3).
  const z = v.instant.toZonedDateTimeISO(timeZone);
  return dateValueString(d, z.toPlainTime());
}

function seriesBlockedMessage(series: Series): string | null {
  switch (series.phase) {
    case "blocked":
      return "Regel nicht unterstützt oder ungültig – nur „Regel bearbeiten“ oder „Wiederholung entfernen“";
    case "clarify":
    case "end-pending":
    case "no-instance":
      return "Fortschreibung klären – nur „Regel bearbeiten“ oder „Wiederholung entfernen“";
    case "conflicting":
      return "Vorkommen ist zugleich erledigt und übersprungen – bitte klären";
    default:
      return null;
  }
}

function planInner(
  task: Task,
  series: Series | null,
  action: TaskAction,
  ctx: ActionContext,
): Plan {
  const now = formatTimestamp(ctx.at, ctx.timeZone);
  switch (action.type) {
    case "complete": {
      if (series) {
        if (!series.instance) return blocked("Kein aktuelles Vorkommen");
        return planInner(
          task,
          series,
          {
            type: "completeOccurrence",
            revision: series.revisionKey,
            instance: series.instance.toString(),
          },
          ctx,
        );
      }
      if (task.fields.status === "done") return noop;
      return { kind: "edit", set: { status: "done", completedDate: now }, remove: [] };
    }
    case "reopen": {
      if (series)
        return planInner(task, series, { type: "reopenSeries", revision: series.revisionKey }, ctx);
      if (task.fields.status !== "done") return noop;
      return { kind: "edit", set: { status: "open" }, remove: ["completedDate"] };
    }
    case "setStatus": {
      if (action.status === "done") return planInner(task, series, { type: "complete" }, ctx);
      if (task.fields.status === "done") {
        // Wiederöffnen; ein ausdrücklich gewähltes „in Arbeit“ bleibt erhalten.
        const p = planInner(task, series, { type: "reopen" }, ctx);
        if (p.kind === "edit" && action.status === "in-progress") p.set.status = "in-progress";
        return p;
      }
      return { kind: "edit", set: { status: action.status }, remove: [] };
    }
    case "setPriority":
      return { kind: "edit", set: { priority: action.priority }, remove: [] };
    case "setInbox":
      return { kind: "edit", set: { inbox: action.inbox }, remove: [] };
    case "setTitle": {
      const t = action.title.trim();
      if (!t) return blocked("Titel darf nicht leer sein");
      return { kind: "edit", set: { title: t }, remove: [] };
    }
    case "setBody":
      return { kind: "edit", set: {}, remove: [], body: action.body };
    case "toggleCheckbox": {
      if (!itemMatches(task.body, action.line, action.expect)) return blocked(LIST_CHANGED);
      const b = toggleCheckbox(task.body, action.line);
      if (b === null) return blocked("Keine Checkbox in dieser Zeile");
      return { kind: "edit", set: {}, remove: [], body: b };
    }
    case "addItem": {
      const b = appendItem(task.body, action.text);
      if (b === null) return blocked("Eintrag darf nicht leer sein");
      return { kind: "edit", set: {}, remove: [], body: b };
    }
    case "editItem": {
      if (!itemMatches(task.body, action.line, action.expect)) return blocked(LIST_CHANGED);
      const b = setItemText(task.body, action.line, action.text);
      if (b === null) return blocked("Eintrag nicht gefunden oder leer");
      return { kind: "edit", set: {}, remove: [], body: b };
    }
    case "removeItem": {
      if (!itemMatches(task.body, action.line, action.expect)) return blocked(LIST_CHANGED);
      const b = removeItem(task.body, action.line);
      if (b === null) return blocked("Eintrag nicht gefunden");
      return { kind: "edit", set: {}, remove: [], body: b };
    }
    case "moveItem": {
      if (
        !itemMatches(task.body, action.line, action.expect) ||
        (action.before !== null && !itemMatches(task.body, action.before, action.expectBefore))
      )
        return blocked(LIST_CHANGED);
      const b = moveItem(task.body, action.line, action.before);
      if (b === null) return blocked("Eintrag nicht gefunden");
      return { kind: "edit", set: {}, remove: [], body: b };
    }
    case "removeCheckedItems":
      return { kind: "edit", set: {}, remove: [], body: removeCheckedItems(task.body) };
    case "resetItems":
      return { kind: "edit", set: {}, remove: [], body: resetCheckboxes(task.body) };
    case "assignNewId":
      return { kind: "edit", set: { id: ctx.newId() }, remove: [] };
    case "setDate":
      return planSetDate(task, series, action.field, action.value, ctx.timeZone);
    default:
      return planSeries(task, series, action, ctx, now);
  }
}

function planSetDate(
  task: Task,
  series: Series | null,
  field: RefField,
  value: string | null,
  timeZone: string,
): Plan {
  if (value !== null && !parseDateValue(value)) return blocked("Ungültiges Datum");
  const set: Record<string, YamlValue> = {};
  const remove: string[] = [];
  if (value === null) remove.push(field);
  else set[field] = value;
  if (series && series.phase !== "blocked" && series.phase !== "ended") {
    if (value === null && field === series.field) {
      return blocked("Bezugsdatum einer laufenden Serie kann nicht entfernt werden");
    }
    // Einzelverschieben ändert K nicht (5.1): einen nur abgeleiteten Schlüssel festhalten.
    if (field === series.field && series.instance && !("recurrence_instance" in task.data)) {
      set.recurrence_instance = series.instance.toString();
    }
    // Vor dem ersten Einzelverschieben einen nur abgeleiteten Abstand festhalten (5.3).
    if (series.offsetDays === null) {
      const ref = task.fields[series.field];
      const otherField: RefField = series.field === "due" ? "scheduled" : "due";
      const other = task.fields[otherField];
      if (ref && other) {
        set.recurrence_offset_days = datePart(ref, timeZone).until(datePart(other, timeZone), {
          largestUnit: "days",
        }).days;
      }
    }
  }
  return { kind: "edit", set, remove };
}

function planSeries(
  task: Task,
  series: Series | null,
  action: TaskAction,
  ctx: ActionContext,
  now: string,
): Plan {
  if (action.type === "createSeries") {
    if (series) return blocked("Aufgabe hat bereits eine Wiederholung");
    return planNewSection(task, null, action.spec, ctx, { resetChecklists: false, carry: [] });
  }
  if (!series) return blocked("Aufgabe hat keine Wiederholung");
  if (!("revision" in action) || !revisionMatches(series, action.revision)) {
    return blocked("Die Serie wurde inzwischen geändert – bitte neu laden");
  }
  const rule = series.rule;
  const K = series.instance;
  // Identität des aktiven Abschnitts beim ersten Schreiben festhalten (3.2, 5.1): Revision und Start.
  // Ohne gespeicherten Start wanderte das Raster mit jedem neuen Vorkommen mit, und COUNT zählte
  // bei Fremddateien von vorn (Befund Testrunde Wiederholungen, Oktober 2026).
  const revisionSet: Record<string, YamlValue> = series.revision
    ? {}
    : { recurrence_revision: ctx.newId() };
  if (!("recurrence_start" in task.data) && series.start) {
    // Der beim Lesen abgeleitete Start (3.2) wird unverändert festgehalten; ein Termin neben dem
    // Raster bleibt als Hinweis sichtbar (6), rrule zählt COUNT ohnehin erst ab dem ersten Treffer.
    revisionSet.recurrence_start = dateValueString(series.start.date, series.start.time);
  }

  switch (action.type) {
    case "completeOccurrence":
    case "skipOccurrence": {
      const isComplete = action.type === "completeOccurrence";
      const mine = isComplete ? series.C : series.S;
      const theirs = isComplete ? series.S : series.C;
      if (mine.has(action.instance)) return noop; // idempotent, auch bei status: done
      if (theirs.has(action.instance)) {
        return blocked(
          isComplete
            ? "Vorkommen wurde bereits übersprungen – widersprechende Aktion"
            : "Vorkommen wurde bereits erledigt – keine Rücknahme durch Überspringen",
        );
      }
      const msg = seriesBlockedMessage(series);
      if (msg) return blocked(msg);
      if (series.phase === "ended") return blocked("Serie ist beendet");
      if (!K || action.instance !== K.toString()) {
        return blocked("Vorkommen ist nicht mehr aktuell – bitte neu laden");
      }
      if (!rule || !series.start) return blocked("Regel nicht auswertbar");
      const C = new Set(series.C);
      const S = new Set(series.S);
      (isComplete ? C : S).add(K.toString());
      const day = actionDay(ctx);
      const exclude = (d: Temporal.PlainDate) => C.has(d.toString()) || S.has(d.toString());
      let next;
      if (series.anchor === "calendar") {
        next = nextOccurrence({
          rule,
          start: series.start.date,
          time: series.start.time,
          after: maxDate(K, day),
          exclude,
        });
      } else {
        const B = isComplete ? day : maxDate(K, day);
        if (isComplete && rule.count !== null && C.size >= rule.count)
          next = { kind: "exhausted" as const };
        else {
          const r = completionOccurrences({
            rule,
            base: B,
            time: series.start.time,
            exclude,
            limit: 1,
          });
          next = r.dates.length
            ? { kind: "found" as const, date: r.dates[0]! }
            : r.aborted
              ? { kind: "aborted" as const }
              : { kind: "exhausted" as const };
        }
      }
      if (next.kind === "aborted") return blocked("Berechnung zu aufwendig – nichts geändert");
      const set: Record<string, YamlValue> = {
        ...revisionSet,
        [isComplete ? "complete_instances" : "skipped_instances"]: sortedKeys(isComplete ? C : S),
      };
      if (isComplete) set.last_completed_at = now;
      if (next.kind === "exhausted") {
        set.status = "done";
        set.completedDate = now;
        return { kind: "edit", set, remove: [], note: "Serie beendet – kein weiteres Vorkommen" };
      }
      const dates = datesForInstance(task, series, next.date, undefined, ctx.timeZone);
      if (dates.error) return blocked(dates.error);
      Object.assign(set, dates.set);
      set.recurrence_instance = next.date.toString();
      if (task.fields.status === "in-progress") set.status = "open";
      const body = resetCheckboxes(task.body);
      return {
        kind: "edit",
        set,
        remove: [],
        ...(body !== task.body ? { body } : {}),
        note: `Nächstes Vorkommen: ${next.date}`,
      };
    }
    case "endSeries": {
      if (series.phase === "ended") return noop;
      // Beide Varianten binden an das aktuelle K (5.4): eine veraltete Beenden-Aktion darf nicht
      // das inzwischen fortgeschriebene Vorkommen beenden (Review 23.10.2026, R4).
      if (!K || action.instance !== K.toString())
        return blocked("Vorkommen ist nicht mehr aktuell");
      const set: Record<string, YamlValue> = { ...revisionSet, status: "done", completedDate: now };
      if (action.completeCurrent) {
        if (series.S.has(K.toString())) return blocked("Vorkommen wurde bereits übersprungen");
        if (!series.C.has(K.toString())) {
          set.complete_instances = sortedKeys(new Set([...series.C, K.toString()]));
          set.last_completed_at = now;
        }
      }
      return { kind: "edit", set, remove: [] };
    }
    case "reopenSeries": {
      if (series.phase !== "ended") return noop;
      if (!K) return blocked("Kein gespeichertes Vorkommen – Serie mit neuer Regel fortsetzen");
      const k = K.toString();
      if (!series.C.has(k) && !series.S.has(k)) {
        // Auch dieser Schreibpfad hält Start und Revision einer Fremdserie fest (Nachprüfung 24.10.2026, N3).
        return { kind: "edit", set: { ...revisionSet, status: "open" }, remove: ["completedDate"] };
      }
      if (series.anchor !== "calendar" || !rule || !series.start) {
        return blocked("Folgetermin nicht eindeutig – Serie mit neuer Regel fortsetzen");
      }
      const next = nextOccurrence({
        rule,
        start: series.start.date,
        time: series.start.time,
        after: K,
        exclude: (d) => series.C.has(d.toString()) || series.S.has(d.toString()),
      });
      if (next.kind !== "found")
        return blocked("Serie ist erschöpft – Serie mit neuer Regel fortsetzen");
      const dates = datesForInstance(task, series, next.date, undefined, ctx.timeZone);
      if (dates.error) return blocked(dates.error);
      const body = resetCheckboxes(task.body);
      return {
        kind: "edit",
        set: {
          ...revisionSet,
          status: "open",
          ...dates.set,
          recurrence_instance: next.date.toString(),
        },
        remove: ["completedDate"],
        ...(body !== task.body ? { body } : {}),
      };
    }
    case "setException": {
      if (series.phase !== "active")
        return blocked(seriesBlockedMessage(series) ?? "Serie ist nicht aktiv");
      const d = parseKey(action.date);
      if (!d || !K || !rule || !series.start) return blocked("Ungültiges Datum");
      if (Temporal.PlainDate.compare(d, K) <= 0) {
        return blocked("Ausnahmen nur für zukünftige Vorkommen – aktuelles mit „Überspringen“");
      }
      if (series.C.has(action.date)) return blocked("Vorkommen ist bereits erledigt");
      if (action.skipped && series.S.has(action.date)) return noop;
      if (!action.skipped && !series.S.has(action.date)) return noop;
      if (action.skipped && !isOccurrence(rule, series.start.date, d)) {
        return blocked("Datum ist kein Termin dieser Regel");
      }
      const S = new Set(series.S);
      if (action.skipped) S.add(action.date);
      else S.delete(action.date);
      return {
        kind: "edit",
        set: { ...revisionSet, skipped_instances: sortedKeys(S) },
        remove: [],
      };
    }
    case "changeReference": {
      if (!K) return blocked("Kein aktuelles Vorkommen");
      // Ein geleerter Abstand entfernt den gespeicherten; dann gilt die Differenz der aktuellen Felder (5.3).
      const dates = datesForInstance(
        task,
        { ...series, field: action.field, offsetDays: null },
        K,
        action.offsetDays,
        ctx.timeZone,
      );
      if (dates.error) return blocked(dates.error);
      const set: Record<string, YamlValue> = {
        ...revisionSet,
        ...dates.set,
        recurrence_field: action.field,
      };
      const remove: string[] = [];
      if (action.offsetDays !== null) set.recurrence_offset_days = action.offsetDays;
      else if (series.offsetDays !== null) remove.push("recurrence_offset_days");
      return { kind: "edit", set, remove };
    }
    case "removeRecurrence": {
      const snapshot = buildSnapshot(task, series, "removed", ctx);
      const remove = SERIES_FIELDS.filter((f) => f !== "recurrence_archive" && f in task.data);
      return {
        kind: "edit",
        set: { recurrence_archive: [...series.archive, snapshot] },
        remove,
      };
    }
    case "mergeDates":
      return planMergeDates(task, series, action, ctx, now, revisionSet);
    case "changeRule": {
      if (series.dates) {
        return blocked("Feste Termine aus dem Kalender – nur Abstand, Ausnahmen oder Wiederholung entfernen");
      }
      const p = parseRule(action.spec.rule);
      if (p.status !== "ok") return blocked(`Regel ungültig: ${p.message}`);
      const newStart = parseSpecStart(action.spec.start);
      if (!newStart) return blocked("Ungültiger Start");
      const sameSection =
        !action.restartCount &&
        rule !== null &&
        series.start !== null &&
        sameRule(rule, p.rule) &&
        series.anchor === action.spec.anchor &&
        newStart.date.equals(series.start.date) &&
        sameTime(newStart.time, series.start.time);
      if (sameSection) {
        if (action.spec.field === series.field && action.spec.offsetDays === series.offsetDays)
          return noop;
        return planSeries(
          task,
          series,
          {
            type: "changeReference",
            revision: action.revision,
            field: action.spec.field,
            offsetDays: action.spec.offsetDays,
          },
          ctx,
          now,
        );
      }
      return planNewSection(task, series, action.spec, ctx, {
        resetChecklists: action.resetChecklists,
        carry: action.carryExceptions ?? [],
      });
    }
    default:
      return blocked("Unbekannte Aktion");
  }
}

/**
 * Importabgleich einer festen Terminliste (4.7): neue Termine einfügen; künftige, ungelöste Termine
 * im Zeitraum der Importdatei, die dort fehlen, entfernen (verlegt). Vergangene, erledigte und
 * übersprungene Termine bleiben. Fällt K weg, wird der nächste ungelöste Termin danach K. Eine beendete
 * Serie wird fortgesetzt, wenn der Import neue Termine ab dem Aktionstag bringt: K ist dann der erste
 * ungelöste Termin ab dem Aktionstag, in derselben Revision (5.7). Derselbe Import erneut ist ein No-op.
 */
function planMergeDates(
  task: Task,
  series: Series,
  action: Extract<TaskAction, { type: "mergeDates" }>,
  ctx: ActionContext,
  now: string,
  revisionSet: Record<string, YamlValue>,
): Plan {
  if (!series.dates) return blocked("Aufgabe hat keine feste Terminliste");
  if (series.phase !== "active" && series.phase !== "ended") {
    return blocked(seriesBlockedMessage(series) ?? "Serie ist nicht auswertbar");
  }
  const cmp = Temporal.PlainDate.compare;
  const incoming = new Map<string, Temporal.PlainDate>();
  for (const raw of action.dates) {
    const d = parseKey(raw);
    if (!d || !inDateRange(d)) return blocked(`Ungültiges Datum „${raw}“`);
    incoming.set(d.toString(), d);
  }
  const set: Record<string, YamlValue> = { ...revisionSet };
  const remove: string[] = [];
  if (action.wasteType !== undefined) set.waste_type = action.wasteType;
  if (!incoming.size) return { kind: "edit", set, remove };

  const day = actionDay(ctx);
  const sorted = [...incoming.values()].sort(cmp);
  let lo = sorted[0]!;
  let hi = sorted[sorted.length - 1]!;
  if (action.range) {
    const from = parseKey(action.range.from);
    const to = parseKey(action.range.to);
    if (!from || !to || cmp(from, lo) > 0 || cmp(to, hi) < 0) return blocked("Ungültiger Zeitraum des Imports");
    lo = from;
    hi = to;
  }
  const resolved = (d: Temporal.PlainDate) => series.C.has(d.toString()) || series.S.has(d.toString());
  const list = new Map(series.dates.map((d) => [d.toString(), d]));
  const moved = new Set<string>();
  for (const [k, d] of list) {
    if (cmp(d, day) > 0 && !resolved(d) && cmp(d, lo) >= 0 && cmp(d, hi) <= 0 && !incoming.has(k)) {
      list.delete(k);
      moved.add(k);
    }
  }
  const added = [...incoming.values()].filter((d) => !list.has(d.toString()) && !moved.has(d.toString()));
  for (const [k, d] of incoming) list.set(k, d);
  const merged = [...list.values()].sort(cmp);
  set.recurrence_dates = merged.map((d) => d.toString());

  const firstFree = (from: Temporal.PlainDate, inclusive: boolean) =>
    merged.find((d) => (inclusive ? cmp(d, from) >= 0 : cmp(d, from) > 0) && !resolved(d)) ?? null;
  const K = series.instance;
  let next: Temporal.PlainDate | null = null;
  let body: string | undefined;
  let note: string | undefined;
  if (series.phase === "ended") {
    next = added.some((d) => cmp(d, day) >= 0) ? firstFree(day, true) : null;
    if (next) {
      set.status = "open";
      remove.push("completedDate");
      const b = resetCheckboxes(task.body);
      if (b !== task.body) body = b;
      note = `Serie fortgesetzt, nächster Termin: ${next}`;
    }
  } else if (K && moved.has(K.toString())) {
    next = firstFree(K, false);
    if (!next) {
      set.status = "done";
      set.completedDate = now;
      note = "Serie beendet – kein weiterer Termin";
    }
  }
  if (next) {
    const dates = datesForInstance(task, series, next, undefined, ctx.timeZone);
    if (dates.error) return blocked(dates.error);
    Object.assign(set, dates.set);
    set.recurrence_instance = next.toString();
  }
  return { kind: "edit", set, remove, ...(body !== undefined ? { body } : {}), ...(note ? { note } : {}) };
}

function sameTime(a: Temporal.PlainTime | null, b: Temporal.PlainTime | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

function parseSpecStart(
  s: string,
): { date: Temporal.PlainDate; time: Temporal.PlainTime | null } | null {
  const v = parseDateValue(s);
  if (!v) return null;
  if (v.kind === "date") return { date: v.date, time: null };
  if (v.kind === "local") return { date: v.dateTime.toPlainDate(), time: v.dateTime.toPlainTime() };
  return null;
}

/** Neuer Serienabschnitt (Serie anlegen bzw. Regeländerung, 5.1/5.4). */
function planNewSection(
  task: Task,
  series: Series | null,
  spec: SeriesSpec,
  ctx: ActionContext,
  opts: { resetChecklists: boolean; carry: string[] },
): Plan {
  const p = parseRule(spec.rule);
  if (p.status !== "ok") return blocked(`Regel ungültig: ${p.message}`);
  const rule: Rule = p.rule;
  const chosen = parseSpecStart(spec.start);
  if (!chosen) return blocked("Ungültiger Start");
  if (rule.until && rule.until.utc) return blocked("UNTIL mit UTC-Zeit wird nicht unterstützt");
  // Bei Änderung liegt der erste Termin frühestens am Änderungstag.
  const from = series ? maxDate(chosen.date, actionDay(ctx)) : chosen.date;
  const first = firstOccurrence(rule, from, chosen.time);
  if (first.kind === "aborted") return blocked("Berechnung zu aufwendig");
  if (first.kind === "exhausted") return blocked("Die Regel erzeugt ab dem Start keine Termine");
  const k = first.date;
  const set: Record<string, YamlValue> = {
    recurrence: spec.rule,
    recurrence_revision: ctx.newId(),
    recurrence_start: dateValueString(k, chosen.time),
    recurrence_anchor: spec.anchor,
    recurrence_field: spec.field,
    recurrence_instance: k.toString(),
  };
  const remove: string[] = ["complete_instances", "last_completed_at"];
  if (spec.offsetDays !== null) set.recurrence_offset_days = spec.offsetDays;
  else remove.push("recurrence_offset_days");
  const carried = opts.carry.filter((d) => {
    const pd = parseKey(d);
    return pd !== null && Temporal.PlainDate.compare(pd, k) > 0;
  });
  if (carried.length) set.skipped_instances = [...new Set(carried)].sort();
  else remove.push("skipped_instances");
  const dates = datesForInstance(
    task,
    { field: spec.field, offsetDays: null, start: { date: k, time: chosen.time } },
    k,
    spec.offsetDays,
    ctx.timeZone,
  );
  if (dates.error) return blocked(dates.error);
  Object.assign(set, dates.set);
  if (series) {
    set.recurrence_archive = [...series.archive, buildSnapshot(task, series, "rule-change", ctx)];
    set.status = "open";
    remove.push("completedDate");
  }
  let body: string | undefined;
  if (opts.resetChecklists) {
    const b = resetCheckboxes(task.body);
    if (b !== task.body) body = b;
  }
  return {
    kind: "edit",
    set,
    remove: remove.filter((r) => !(r in set)),
    ...(body !== undefined ? { body } : {}),
    note: `Erster Termin: ${k}`,
  };
}

/** Snapshot des aktiven Abschnitts für recurrence_archive (5.1). */
function buildSnapshot(
  task: Task,
  series: Series,
  reason: "rule-change" | "removed",
  ctx: ActionContext,
): Record<string, YamlValue> {
  const d = task.data;
  const snap: Record<string, YamlValue> = { recurrence_revision: series.revision ?? ctx.newId() };
  if (series.dates) snap.recurrence_dates = d.recurrence_dates ?? series.dates.map((x) => x.toString());
  else snap.recurrence = d.recurrence ?? series.raw;
  const copy = (k: string, fallback?: YamlValue) => {
    if (k in d && d[k] !== undefined) snap[k] = d[k]!;
    else if (fallback !== undefined) snap[k] = fallback;
  };
  copy(
    "recurrence_start",
    series.start ? dateValueString(series.start.date, series.start.time) : undefined,
  );
  copy("recurrence_anchor", series.anchor);
  copy("recurrence_field", series.field);
  copy("recurrence_offset_days");
  copy("recurrence_instance", series.instance?.toString());
  snap.complete_instances = sortedKeys(series.C);
  snap.skipped_instances = sortedKeys(series.S);
  snap.status = task.fields.status;
  copy("due");
  copy("scheduled");
  copy("completedDate");
  copy("last_completed_at");
  snap.closed_reason = reason;
  return snap;
}

// ---------------------------------------------------------------------------
// Neuanlage und Übernahme

export interface NewTaskInput {
  title: string;
  note?: string;
  due?: string | null;
  scheduled?: string | null;
  /** neue Liste (4.6) statt Aufgabe; Termine werden dann ignoriert */
  kind?: "list";
}

/** Felder, die eine neue Liste über die Aufgabenstandards hinaus bzw. abweichend erhält (4.6). */
export const NEW_LIST_DATA = { kind: "list", inbox: false } as const;

/** Text einer neuen Eingangsaufgabe (4.1, 3.2 Feldreihenfolge) bzw. Liste (4.6). */
export function newTaskText(input: NewTaskInput, ctx: ActionContext): { id: string; text: string } {
  const id = ctx.newId();
  const now = formatTimestamp(ctx.at, ctx.timeZone);
  const note = input.note ?? "";
  const body = note === "" ? "" : note.endsWith("\n") ? note : `${note}\n`;
  if (input.kind === "list") {
    // `status` und `inbox: false` stehen nur für ältere App-Stände da, die `kind` nicht kennen.
    const text = createFileText(
      [
        ["id", id],
        ["format_version", BASE_FORMAT_VERSION],
        ["title", input.title.trim()],
        ["kind", "list"],
        ["status", "open"],
        ["inbox", false],
        ["dateCreated", now],
        ["dateModified", now],
      ],
      body,
    );
    return { id, text };
  }
  const text = createFileText(
    [
      ["id", id],
      ["format_version", BASE_FORMAT_VERSION],
      ["title", input.title.trim()],
      ["status", "open"],
      ["priority", "none"],
      ["inbox", true],
      ["due", input.due ?? undefined],
      ["scheduled", input.scheduled ?? undefined],
      ["dateCreated", now],
      ["dateModified", now],
    ],
    body,
  );
  return { id, text };
}

export interface NewDateSeriesInput {
  title: string;
  note?: string;
  /** Termine der festen Terminliste (`YYYY-MM-DD`), Reihenfolge und Duplikate egal */
  dates: string[];
  /** Abstand von `scheduled` zur Frist in Tagen (Vorlauf, negativ = davor); null = kein `scheduled` */
  offsetDays: number | null;
  /** Abfuhrart (4.7) */
  wasteType?: string;
}

/** Text einer neuen Serie mit fester Terminliste (4.7, 5.7): Kalenderart, Bezugsfeld `due`, nicht im
 *  Eingang. K ist der erste Termin ab dem Aktionstag; ohne einen solchen null (nichts anlegen). */
export function newDateSeriesText(
  input: NewDateSeriesInput,
  ctx: ActionContext,
): { id: string; text: string; instance: string } | null {
  const byKey = new Map<string, Temporal.PlainDate>();
  for (const raw of input.dates) {
    const d = parseKey(raw);
    if (d && inDateRange(d)) byKey.set(d.toString(), d);
  }
  const dates = [...byKey.values()].sort(Temporal.PlainDate.compare);
  const day = actionDay(ctx);
  const k = dates.find((d) => Temporal.PlainDate.compare(d, day) >= 0);
  if (!k) return null;
  const scheduled = input.offsetDays !== null ? k.add({ days: input.offsetDays }) : null;
  if (scheduled && !inDateRange(scheduled)) return null;
  const id = ctx.newId();
  const now = formatTimestamp(ctx.at, ctx.timeZone);
  const note = input.note ?? "";
  const body = note === "" ? "" : note.endsWith("\n") ? note : `${note}\n`;
  const text = createFileText(
    [
      ["id", id],
      ["format_version", DATE_LIST_FORMAT_VERSION],
      ["title", input.title.trim()],
      ["status", "open"],
      ["priority", "none"],
      ["inbox", false],
      ["due", k.toString()],
      ["scheduled", scheduled?.toString()],
      ["recurrence_dates", dates.map((d) => d.toString())],
      ["recurrence_revision", ctx.newId()],
      ["recurrence_start", dates[0]!.toString()],
      ["recurrence_anchor", "calendar"],
      ["recurrence_field", "due"],
      ["recurrence_offset_days", input.offsetDays ?? undefined],
      ["recurrence_instance", k.toString()],
      ["waste_type", input.wasteType],
      ["dateCreated", now],
      ["dateModified", now],
    ],
    body,
  );
  return { id, text, instance: k.toString() };
}

/** „Als Aufgabe übernehmen“: Frontmatter vor eine Datei ohne Frontmatter schreiben (3.1). */
export function adoptFileText(name: string, text: string, ctx: ActionContext): string {
  const now = formatTimestamp(ctx.at, ctx.timeZone);
  let bom = "";
  let rest = text;
  if (rest.startsWith("﻿")) {
    bom = "﻿";
    rest = rest.slice(1);
  }
  const eol = rest.includes("\r\n") ? "\r\n" : "\n";
  return (
    bom +
    createFileText(
      [
        ["id", ctx.newId()],
        ["format_version", BASE_FORMAT_VERSION],
        ["title", name.replace(/\.md$/i, "")],
        ["status", "open"],
        ["priority", "none"],
        ["inbox", true],
        ["dateCreated", now],
        ["dateModified", now],
      ],
      rest,
      eol,
    )
  );
}
