// Müllabfuhr-Import (4.7): ICS-Datei nach Abfuhrart gruppieren, Vorschau je Art, Übernehmen.
// Die Wirkung bestehender Arten berechnet der Kern (mergeDates), damit Vorschau und Schreiben übereinstimmen.
import {
  planAction,
  Temporal,
  wasteTypeOf,
  type ActionContext,
  type Index,
  type NewDateSeriesInput,
  type TaskAction,
  type TaskView,
} from "@markdoist/core";
import { parseIcs } from "./ics";
import type { Outcome } from "./repository";

/** Abfuhrart-Schlüssel: SUMMARY getrimmt, Leerraum zusammengefasst. */
export function wasteKey(summary: string): string {
  return summary.replace(/\s+/g, " ").trim();
}

/** Schlüssel werden ohne Groß-/Kleinschreibung verglichen. */
export function sameWasteKey(a: string, b: string): boolean {
  return wasteKey(a).toLocaleLowerCase("de") === wasteKey(b).toLocaleLowerCase("de");
}

/** Namensvorschlag: Schlüssel ohne Behältergröße am Ende („Bioabfallbehaelter 80 l“ → „Bioabfallbehaelter“). */
export function suggestWasteName(key: string): string {
  const s = key.replace(/\s*\d[\d.,]*\s*(l|liter|ltr\.?)$/i, "").trim();
  return s || key;
}

export interface WasteGroup {
  key: string;
  /** aufsteigend, ohne Duplikate */
  dates: string[];
}

export interface WasteFile {
  groups: WasteGroup[];
  /** erster bis letzter Termin der ganzen Datei (Zeitraum für verlegte Termine) */
  range: { from: string; to: string } | null;
  withRule: number;
  cancelled: number;
  unreadable: number;
}

export function readWasteFile(text: string, timeZone: string): WasteFile {
  const parsed = parseIcs(text, timeZone);
  const groups = new Map<string, { key: string; dates: Set<string> }>();
  for (const e of parsed.events) {
    const key = wasteKey(e.summary);
    const id = key.toLocaleLowerCase("de");
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { key, dates: new Set() }));
    g.dates.add(e.date);
  }
  const all = parsed.events.map((e) => e.date).sort();
  return {
    groups: [...groups.values()].map((g) => ({ key: g.key, dates: [...g.dates].sort() })),
    range: all.length ? { from: all[0]!, to: all[all.length - 1]! } : null,
    withRule: parsed.withRule,
    cancelled: parsed.cancelled,
    unreadable: parsed.unreadable,
  };
}

export type WasteEffect =
  | { kind: "new"; count: number }
  | { kind: "update"; added: number; moved: number; resumed: boolean }
  | { kind: "unchanged" }
  | { kind: "past-only" }
  | { kind: "blocked"; message: string };

export interface WasteRow {
  group: WasteGroup;
  /** bestehende Müllabfuhr-Serie (gleicher Schlüssel oder ausdrücklich zugeordnet); null = neu anlegen */
  target: TaskView | null;
  /** Titel einer neuen Serie */
  name: string;
  include: boolean;
  effect: WasteEffect;
}

/** Müllabfuhr-Serien im Index (4.7). */
export function wasteSeries(index: Index): TaskView[] {
  return index.tasks.filter((v) => wasteTypeOf(v) !== null);
}

function mergeAction(row: Pick<WasteRow, "group" | "target">, file: WasteFile): TaskAction | null {
  const t = row.target;
  if (!t?.series) return null;
  const current = wasteTypeOf(t);
  return {
    type: "mergeDates",
    revision: t.series.revisionKey,
    dates: row.group.dates,
    ...(file.range ? { range: file.range } : {}),
    ...(current !== null && current !== row.group.key ? { wasteType: row.group.key } : {}),
  };
}

/** Wirkung einer Zeile, ohne zu schreiben. */
export function wasteEffect(row: Pick<WasteRow, "group" | "target">, file: WasteFile, ctx: ActionContext): WasteEffect {
  const day = ctx.at.toZonedDateTimeISO(ctx.timeZone).toPlainDate().toString();
  if (!row.target) {
    const count = row.group.dates.filter((d) => d >= day).length;
    return count ? { kind: "new", count } : { kind: "past-only" };
  }
  const s = row.target.series;
  if (!s?.dates) return { kind: "blocked", message: "Keine feste Terminliste" };
  const action = mergeAction(row, file)!;
  const plan = planAction(row.target.task, action, ctx);
  if (plan.kind === "noop") return { kind: "unchanged" };
  if (plan.kind === "blocked") return { kind: "blocked", message: plan.message };
  const before = new Set(s.dates.map((d) => d.toString()));
  const afterRaw = plan.set.recurrence_dates;
  const after = new Set(Array.isArray(afterRaw) ? afterRaw.map(String) : before);
  const added = [...after].filter((d) => !before.has(d)).length;
  const moved = [...before].filter((d) => !after.has(d)).length;
  const resumed = row.target.task.fields.status === "done" && plan.set.status === "open";
  if (!added && !moved && !resumed && !("waste_type" in plan.set)) return { kind: "unchanged" };
  return { kind: "update", added, moved, resumed };
}

/** Vorschauzeilen: bekannte Arten an ihre Serie gebunden, sonst neu; sortiert nach dem nächsten Termin. */
export function wasteRows(file: WasteFile, index: Index, ctx: ActionContext): WasteRow[] {
  const existing = wasteSeries(index);
  const day = ctx.at.toZonedDateTimeISO(ctx.timeZone).toPlainDate().toString();
  const rows = file.groups.map((group) => {
    const target = existing.find((v) => sameWasteKey(wasteTypeOf(v)!, group.key)) ?? null;
    const name = target ? target.task.fields.title : suggestWasteName(group.key);
    const effect = wasteEffect({ group, target }, file, ctx);
    return { group, target, name, effect, include: effect.kind === "new" || effect.kind === "update" };
  });
  const next = (r: WasteRow) => r.group.dates.find((d) => d >= day) ?? "9999";
  return rows.sort((a, b) => next(a).localeCompare(next(b)) || a.group.key.localeCompare(b.group.key, "de"));
}

/** Zeile einer anderen bestehenden Serie zuordnen bzw. wieder als neue Art führen; Wirkung neu berechnen. */
export function reassignWasteRow(row: WasteRow, target: TaskView | null, file: WasteFile, ctx: ActionContext): WasteRow {
  const name = target ? target.task.fields.title : suggestWasteName(row.group.key);
  const effect = wasteEffect({ group: row.group, target }, file, ctx);
  return { ...row, target, name, effect, include: effect.kind === "new" || effect.kind === "update" };
}

export interface WasteImportRepo {
  createDateSeries(input: NewDateSeriesInput): Promise<Outcome>;
  performIfUnchanged(ref: string, hash: string, action: TaskAction, label?: string): Promise<Outcome>;
}

export interface WasteImportResult {
  /** übernommene Abfuhrarten */
  series: number;
  /** neu hinzugekommene Termine */
  dates: number;
  failures: { name: string; message: string }[];
}

/** Übernimmt die gewählten Zeilen; jede Art ist ein eigener Schreibvorgang mit Verlaufseintrag. */
export async function applyWasteImport(
  repo: WasteImportRepo,
  rows: WasteRow[],
  file: WasteFile,
  offsetDays: number,
): Promise<WasteImportResult> {
  const result: WasteImportResult = { series: 0, dates: 0, failures: [] };
  for (const row of rows) {
    if (!row.include) continue;
    let out: Outcome;
    if (!row.target) {
      out = await repo.createDateSeries({
        title: row.name.trim() || suggestWasteName(row.group.key),
        dates: row.group.dates,
        offsetDays: -Math.abs(offsetDays),
        wasteType: row.group.key,
      });
    } else {
      const action = mergeAction(row, file);
      out = action
        ? await repo.performIfUnchanged(row.target.task.ref, row.target.task.hash, action, "Kalender importiert")
        : { status: "blocked", message: "Keine feste Terminliste" };
    }
    if (out.status === "ok" || out.status === "noop") {
      if (out.status === "ok") result.series++;
      if (row.effect.kind === "new") result.dates += row.group.dates.length;
      if (row.effect.kind === "update") result.dates += row.effect.added;
    } else {
      result.failures.push({ name: row.name, message: "message" in out ? out.message : "Fehler" });
    }
  }
  return result;
}

/** Meldung nach dem Import (4.4: Hinweis, weil mehrere Dateien betroffen sind). */
export function wasteImportMessage(r: WasteImportResult): string {
  const arten = r.series === 1 ? "1 Abfuhrart" : `${r.series} Abfuhrarten`;
  const termine = r.dates === 1 ? "1 Termin" : `${r.dates} Termine`;
  const base = `Kalender importiert: ${arten}, ${termine}`;
  if (!r.failures.length) return base;
  return `${base}. Nicht übernommen: ${r.failures.map((f) => `${f.name} (${f.message})`).join("; ")}`;
}

/** Kurztext der Wirkung für die Vorschau. */
export function describeWasteEffect(e: WasteEffect): string {
  switch (e.kind) {
    case "new":
      return e.count === 1 ? "neu, 1 Termin" : `neu, ${e.count} Termine`;
    case "update": {
      const parts: string[] = [];
      if (e.resumed) parts.push("wird fortgesetzt");
      if (e.added) parts.push(`+${e.added} ${e.added === 1 ? "Termin" : "Termine"}`);
      if (e.moved) parts.push(`${e.moved} ${e.moved === 1 ? "Termin" : "Termine"} verlegt`);
      return parts.join(", ") || "Abfuhrart zugeordnet";
    }
    case "unchanged":
      return "keine Änderung";
    case "past-only":
      return "nur vergangene Termine";
    case "blocked":
      return e.message;
  }
}

/** Erster und letzter Termin einer Gruppe als „Fr 13.11.2026 – Sa 19.12.2026“. */
export function wasteGroupSpan(g: WasteGroup): string {
  const fmt = (s: string) => {
    const d = Temporal.PlainDate.from(s);
    const wd = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][d.dayOfWeek - 1];
    return `${wd} ${String(d.day).padStart(2, "0")}.${String(d.month).padStart(2, "0")}.${d.year}`;
  };
  if (!g.dates.length) return "";
  const first = g.dates[0]!;
  const last = g.dates[g.dates.length - 1]!;
  return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}
