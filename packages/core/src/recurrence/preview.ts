// Vorschau einer Serienaktion vor dem Ausführen (5.2, 5.4): probeweise planen, nichts schreiben.
import { Temporal } from "temporal-polyfill";
import { planAction, type ActionContext, type TaskAction } from "../actions";
import { datePart, parseDateValue } from "../dates";
import type { YamlValue } from "../frontmatter";
import type { Task } from "../task";
import { completionOccurrences, queryOccurrences } from "./engine";
import { parseKey, readSeries, type RefField } from "./series";

export interface DateChange {
  field: RefField;
  from: string | null;
  to: string | null;
}

export interface ActionPreview {
  result: "change" | "noop" | "blocked";
  /** Grund bei „blocked“ */
  message: string | null;
  /** neuer Serienabschnitt (Anlage oder Regeländerung) */
  newSection: boolean;
  /** Serie endet durch die Aktion */
  ended: boolean;
  /** beendete Serie wird wieder offen */
  reopened: boolean;
  /** aktuelles Vorkommen nach der Aktion */
  instance: Temporal.PlainDate | null;
  /** geänderte Datumsfelder; löst auch eine Einzelverschiebung sichtbar auf */
  dates: DateChange[];
  /** das Bezugsfeld war gegenüber K einzeln verschoben */
  shifted: boolean;
  /** überfälliger alter Termin, der durch den neuen Abschnitt abgelöst wird (nicht als erledigt gezählt) */
  supersededOverdue: Temporal.PlainDate | null;
  /** Regeltermine, die übergangen werden, weil sie schon aufgelöst sind (Kollision, Ausnahme) */
  passedOver: { date: Temporal.PlainDate; reason: "done" | "skipped" }[];
}

const EMPTY: Omit<ActionPreview, "result" | "message"> = {
  newSection: false,
  ended: false,
  reopened: false,
  instance: null,
  dates: [],
  shifted: false,
  supersededOverdue: null,
  passedOver: [],
};

function str(v: YamlValue | undefined): string | null {
  return v === undefined || v === null || v === "" ? null : String(v);
}

export function previewSeriesAction(
  task: Task,
  action: TaskAction,
  ctx: ActionContext,
): ActionPreview {
  const plan = planAction(task, action, ctx);
  if (plan.kind === "noop") return { result: "noop", message: null, ...EMPTY };
  if (plan.kind === "blocked") return { result: "blocked", message: plan.message, ...EMPTY };
  const after = (k: string): YamlValue | undefined =>
    k in plan.set ? plan.set[k] : plan.remove.includes(k) ? undefined : task.data[k];
  const series = readSeries(task);
  const today = ctx.at.toZonedDateTimeISO(ctx.timeZone).toPlainDate();
  const statusAfter = str(after("status"));
  const instance = parseKey(after("recurrence_instance"));

  const dates: DateChange[] = [];
  for (const f of ["due", "scheduled"] as const) {
    const from = str(task.data[f]);
    const to = str(after(f));
    if (from !== to) dates.push({ field: f, from, to });
  }

  let shifted = false;
  let supersededOverdue: Temporal.PlainDate | null = null;
  if (series?.instance) {
    const refVal = task.fields[series.field];
    const refDate = refVal ? datePart(refVal, ctx.timeZone) : null;
    shifted = refDate !== null && !refDate.equals(series.instance);
    const k = series.instance.toString();
    const open = task.fields.status !== "done" && !series.C.has(k) && !series.S.has(k);
    const newSection = action.type === "changeRule" && "recurrence_archive" in plan.set;
    if (newSection && open && refDate && Temporal.PlainDate.compare(refDate, today) < 0)
      supersededOverdue = refDate;
  }

  const passedOver: ActionPreview["passedOver"] = [];
  if (
    series?.rule &&
    series.start &&
    series.instance &&
    instance &&
    (action.type === "completeOccurrence" || action.type === "skipOccurrence")
  ) {
    const k = series.instance;
    const isComplete = action.type === "completeOccurrence";
    const C = new Set(series.C);
    const S = new Set(series.S);
    (isComplete ? C : S).add(k.toString());
    const base = Temporal.PlainDate.compare(k, today) >= 0 ? k : today;
    const r =
      series.anchor === "calendar"
        ? queryOccurrences({
            rule: series.rule,
            time: series.start.time,
            limit: 24,
            start: series.start.date,
            after: base,
          })
        : completionOccurrences({
            rule: series.rule,
            time: series.start.time,
            limit: 24,
            base: isComplete ? today : base,
          });
    for (const d of r.dates) {
      if (Temporal.PlainDate.compare(d, instance) >= 0) break;
      const key = d.toString();
      if (C.has(key)) passedOver.push({ date: d, reason: "done" });
      else if (S.has(key)) passedOver.push({ date: d, reason: "skipped" });
    }
  }

  return {
    result: "change",
    message: null,
    newSection:
      action.type === "createSeries" ||
      (action.type === "changeRule" && "recurrence_archive" in plan.set),
    ended: statusAfter === "done" && task.fields.status !== "done",
    reopened: task.fields.status === "done" && statusAfter !== "done",
    instance,
    dates,
    shifted,
    supersededOverdue,
    passedOver,
  };
}

/** Datumswert für die Anzeige als reines Datum (für Vergleiche in der Vorschau). */
export function previewDate(v: string | null, timeZone: string): Temporal.PlainDate | null {
  const d = v === null ? null : parseDateValue(v);
  return d ? datePart(d, timeZone) : null;
}
