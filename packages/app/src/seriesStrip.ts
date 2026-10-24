// Darstellung einer Serie für beide Plattformen: Vorkommen-Streifen im Detail und Monatsraster im Verlauf.
import { parseKey, Temporal, upcomingForExceptions, type Series } from "@markdoist/core";

export type StripKind = "done" | "skipped" | "current" | "future" | "future-skipped";

export interface StripCell {
  date: Temporal.PlainDate;
  kind: StripKind;
}

/**
 * Streifen aus bis zu `size` Vorkommen: höchstens `ahead` nächste Termine (nur aktive Kalenderserien),
 * das aktuelle Vorkommen und davor die jüngsten erledigten oder übersprungenen.
 */
export function seriesStrip(s: Series, size = 7, ahead = 3): StripCell[] {
  if (!s.instance) return [];
  const K = s.instance.toString();
  const future = s.phase === "active" ? upcomingForExceptions(s).slice(0, ahead) : [];
  const past = [...s.C, ...s.S]
    .filter((d) => d < K && parseKey(d))
    .sort()
    .slice(-(size - 1 - future.length))
    .map((d): StripCell => ({ date: parseKey(d)!, kind: s.C.has(d) ? "done" : "skipped" }));
  const current: StripKind = s.phase === "ended" ? (s.C.has(K) ? "done" : s.S.has(K) ? "skipped" : "current") : "current";
  return [...past, { date: s.instance, kind: current }, ...future.map((u): StripCell => ({ date: u.date, kind: u.skipped ? "future-skipped" : "future" }))];
}

/** Kopfzeile mit Monat statt Wochentag: Termine über einen Monat auseinander oder alle am selben Wochentag. */
export function stripByMonth(cells: StripCell[]): boolean {
  if (cells.length < 2) return false;
  const first = cells[0]!.date;
  return first.until(cells[cells.length - 1]!.date).days > 31 || cells.every((c) => c.date.dayOfWeek === first.dayOfWeek);
}

/** Künftige Ausnahmen, die der Streifen nicht zeigt (weiter entfernt als die nächsten Termine). */
export function skippedBeyondStrip(s: Series, cells: StripCell[]): string[] {
  if (!s.instance) return [];
  const K = s.instance.toString();
  const shown = new Set(cells.map((c) => c.date.toString()));
  return [...s.S].filter((d) => d > K && !shown.has(d) && parseKey(d)).sort();
}

/** Übersprungene Vorkommen vor dem aktuellen (künftige Ausnahmen zählen nicht mit). */
export function pastSkippedCount(s: Series): number {
  const K = s.instance?.toString();
  return [...s.S].filter((d) => !K || d < K).length;
}

export type HistoryMark = "done" | "skipped" | "current" | "upcoming" | null;

export interface HistoryMonth {
  year: number;
  month: number;
  /** Tage des Monats mit vorangestellten Leerfeldern bis Montag */
  cells: (Temporal.PlainDate | null)[];
}

/**
 * Monatsraster des aktiven Abschnitts, neuester Monat zuerst, höchstens `max` Monate.
 * `mark` ordnet jedem Tag seinen Zustand zu.
 */
export function seriesHistory(s: Series, max = 24): { months: HistoryMonth[]; mark(d: Temporal.PlainDate): HistoryMark } {
  const K = s.instance;
  const upcoming = new Set(upcomingForExceptions(s, 40).map((u) => u.date.toString()));
  const keys = [...s.C, ...s.S].filter((k) => parseKey(k)).sort();
  const mark = (d: Temporal.PlainDate): HistoryMark => {
    const k = d.toString();
    if (s.C.has(k)) return "done";
    if (s.S.has(k)) return "skipped";
    if (K && s.phase !== "ended" && d.equals(K)) return "current";
    if (upcoming.has(k)) return "upcoming";
    return null;
  };
  const dates = [K, s.start?.date, parseKey(keys[0] ?? ""), parseKey(keys[keys.length - 1] ?? "")].filter((d): d is Temporal.PlainDate => !!d).sort(Temporal.PlainDate.compare);
  const months: HistoryMonth[] = [];
  if (dates.length) {
    const stop = Temporal.PlainYearMonth.from({ year: dates[0]!.year, month: dates[0]!.month });
    const last = dates[dates.length - 1]!;
    let ym = Temporal.PlainYearMonth.from({ year: last.year, month: last.month });
    while (Temporal.PlainYearMonth.compare(ym, stop) >= 0 && months.length < max) {
      const first = Temporal.PlainDate.from({ year: ym.year, month: ym.month, day: 1 });
      const cells: (Temporal.PlainDate | null)[] = Array<null>(first.dayOfWeek - 1).fill(null);
      for (let d = 1; d <= first.daysInMonth; d++) cells.push(first.with({ day: d }));
      months.push({ year: ym.year, month: ym.month, cells });
      ym = ym.subtract({ months: 1 });
    }
  }
  return { months, mark };
}
