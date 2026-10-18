// Deutsche Vorschautexte für Serienaktionen (5.2, 5.4), gemeinsam für beide Plattformen.
import {
  formatGerman,
  formatGermanDate,
  parseDateValue,
  previewSeriesAction,
  type ActionContext,
  type ActionPreview,
  type Clock,
  type Task,
  type TaskAction,
} from "@markdoist/core";
import { T } from "./texts";

/** Kontext für eine Probeplanung: aktueller Zeitpunkt, IDs werden nicht geschrieben. */
export function previewContext(clock: Clock): ActionContext {
  return { at: clock.now(), timeZone: clock.timeZone, newId: () => "VORSCHAU" };
}

function fmtValue(v: string | null, timeZone: string): string {
  if (v === null) return "leer";
  const d = parseDateValue(v);
  return d ? formatGerman(d, timeZone) : v;
}

/** Zeilen, die vor dem Ausführen erklären, was passiert. Leer bei No-op ohne Hinweis. */
export function previewLines(p: ActionPreview, timeZone: string): string[] {
  if (p.result === "blocked") return [p.message ?? "Nicht möglich"];
  if (p.result === "noop") return [T.preview.noop];
  const out: string[] = [];
  if (p.ended) out.push(T.preview.ends);
  else if (p.instance) {
    out.push(`${p.newSection ? T.preview.firstOccurrence : T.preview.nextOccurrence}: ${formatGermanDate(p.instance)}`);
  }
  for (const x of p.passedOver) {
    out.push(
      `${formatGermanDate(x.date)} ${x.reason === "done" ? T.preview.passedDone : T.preview.passedSkipped}`,
    );
  }
  if (p.reopened && !p.newSection) out.push(T.preview.reopens);
  if (p.newSection) out.push(T.preview.newSection);
  if (p.supersededOverdue) {
    out.push(`${T.preview.supersededPrefix} ${formatGermanDate(p.supersededOverdue)} ${T.preview.supersededSuffix}`);
  }
  for (const d of p.dates) {
    out.push(`${T.fields[d.field]}: ${fmtValue(d.from, timeZone)} → ${fmtValue(d.to, timeZone)}`);
  }
  if (p.shifted && p.dates.length) out.push(T.preview.shiftResolved);
  return out;
}

/** Probeplanung plus Texte in einem Schritt. */
export function previewAction(task: Task, action: TaskAction, clock: Clock): { preview: ActionPreview; lines: string[] } {
  const preview = previewSeriesAction(task, action, previewContext(clock));
  return { preview, lines: previewLines(preview, clock.timeZone) };
}
