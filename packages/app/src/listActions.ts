// Listenbedienung: „Erledigen“/„Wiederöffnen“ an die beim Auslösen angezeigte Fassung binden (R6).
import type { TaskAction, TaskView } from "@markdoist/core";

/**
 * Aktion für Checkbox, Leertaste, Menü und Wischgeste. Bei einer laufenden Serie trägt die Aktion das
 * angezeigte Vorkommen samt Regelrevision: Eine zweite Eingabe für dasselbe Vorkommen bleibt dann
 * wirkungslos (`noop`), statt das inzwischen fortgeschriebene nächste Vorkommen zu erledigen.
 */
export function toggleDoneAction(v: TaskView): { action: TaskAction; label: string } {
  const s = v.series;
  if (v.task.fields.status === "done") {
    return { action: s ? { type: "reopenSeries", revision: s.revisionKey } : { type: "reopen" }, label: "Wiederöffnet" };
  }
  if (s?.instance) {
    return { action: { type: "completeOccurrence", revision: s.revisionKey, instance: s.instance.toString() }, label: "Erledigt" };
  }
  return { action: { type: "complete" }, label: "Erledigt" };
}
