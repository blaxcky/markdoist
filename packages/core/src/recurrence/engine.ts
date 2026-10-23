// RecurrenceEngine: Kapselung von rrule.js im floating-Modus (2.2, 5.2, 6).
// COUNT und UNTIL werden nicht der Bibliothek überlassen, sondern hier geprüft.
import { RRule, Weekday as RWeekday, type Options } from "rrule";
import { Temporal } from "temporal-polyfill";
import type { Rule, Weekday } from "./rule";

const RWD: Record<Weekday, RWeekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

const FREQ = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
} as const;

/** Suchhorizont je Frequenz in Jahren über den Suchbeginn hinaus.
 *  rrule.js iteriert jeden Zeitraum einzeln; der Horizont begrenzt unmögliche Regeln. */
export const HORIZON_YEARS: Record<Rule["freq"], number> = {
  DAILY: 12,
  WEEKLY: 30,
  MONTHLY: 100,
  YEARLY: 400,
};

export interface EngineQuery {
  rule: Rule;
  /** DTSTART des Regelrasters */
  start: Temporal.PlainDate;
  /** feste Serienuhrzeit (nur für UNTIL-Vergleich) */
  time?: Temporal.PlainTime | null;
  /** nur Termine streng nach diesem Datum */
  after?: Temporal.PlainDate | null;
  /** nur Termine ab diesem Datum (einschließlich) */
  from?: Temporal.PlainDate | null;
  /** Ausschluss bereits aufgelöster Schlüssel */
  exclude?: (d: Temporal.PlainDate) => boolean;
  /** COUNT ignorieren (Completion zählt Erledigungen selbst) */
  ignoreCount?: boolean;
  limit: number;
  /** optionale Zeitgrenze (ms seit Start), Rückgabe aborted bei Überschreitung */
  deadline?: { now(): number; until: number };
}

export interface EngineResult {
  dates: Temporal.PlainDate[];
  /** Regel regulär erschöpft (COUNT erreicht oder UNTIL überschritten) */
  exhausted: boolean;
  /** Suche abgebrochen (Horizont/Zeit) – kein Serienende */
  aborted: boolean;
}

function toDate(d: Temporal.PlainDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

function fromDate(d: Date): Temporal.PlainDate {
  return Temporal.PlainDate.from({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

function untilPassed(rule: Rule, d: Temporal.PlainDate, time: Temporal.PlainTime | null): boolean {
  if (!rule.until) return false;
  const c = Temporal.PlainDate.compare(d, rule.until.date);
  if (c !== 0) return c > 0;
  if (time && rule.until.time) return Temporal.PlainTime.compare(time, rule.until.time) > 0;
  return false;
}

export function queryOccurrences(q: EngineQuery): EngineResult {
  const { rule } = q;
  const searchBase = [q.start, q.after, q.from].reduce<Temporal.PlainDate>(
    (acc, d) => (d && Temporal.PlainDate.compare(d, acc) > 0 ? d : acc),
    q.start,
  );
  let horizon = searchBase.add({ years: HORIZON_YEARS[rule.freq] });
  if (horizon.year > 9999) horizon = Temporal.PlainDate.from("9999-12-31");
  const opts: Partial<Options> = {
    freq: FREQ[rule.freq],
    interval: rule.interval,
    dtstart: toDate(q.start),
    until: toDate(horizon),
    wkst: RWD[rule.wkst],
  };
  if (rule.byday.length) {
    opts.byweekday = rule.byday.map((b) => (b.n === null ? RWD[b.wd] : RWD[b.wd].nth(b.n)));
  }
  if (rule.bymonthday.length) opts.bymonthday = rule.bymonthday;
  if (rule.bymonth.length) opts.bymonth = rule.bymonth;
  if (rule.byyearday.length) opts.byyearday = rule.byyearday;
  if (rule.byweekno.length) opts.byweekno = rule.byweekno;
  if (rule.bysetpos.length) opts.bysetpos = rule.bysetpos;
  const rr = new RRule(opts);

  const dates: Temporal.PlainDate[] = [];
  let exhausted = false;
  let aborted = false;
  let index = 0;
  const time = q.time ?? null;
  rr.all((raw) => {
    if (q.deadline && q.deadline.now() > q.deadline.until) {
      aborted = true;
      return false;
    }
    const d = fromDate(raw);
    index++;
    if (!q.ignoreCount && rule.count !== null && index > rule.count) {
      exhausted = true;
      return false;
    }
    if (untilPassed(rule, d, time)) {
      exhausted = true;
      return false;
    }
    if (q.after && Temporal.PlainDate.compare(d, q.after) <= 0) return true;
    if (q.from && Temporal.PlainDate.compare(d, q.from) < 0) return true;
    if (q.exclude && q.exclude(d)) return true;
    dates.push(d);
    return dates.length < q.limit;
  });
  if (!exhausted && !aborted && dates.length < q.limit) {
    // Iteration endete ohne Abbruch durch uns: COUNT ausgeschöpft am Ende oder Horizont erreicht.
    if (!q.ignoreCount && rule.count !== null && index >= rule.count) exhausted = true;
    else if (rule.until && Temporal.PlainDate.compare(horizon, rule.until.date) >= 0)
      exhausted = true;
    else aborted = true;
  }
  return { dates, exhausted, aborted };
}

export type NextResult =
  { kind: "found"; date: Temporal.PlainDate } | { kind: "exhausted" } | { kind: "aborted" };

export function nextOccurrence(q: Omit<EngineQuery, "limit">): NextResult {
  const r = queryOccurrences({ ...q, limit: 1 });
  if (r.dates.length) return { kind: "found", date: r.dates[0]! };
  if (r.aborted) return { kind: "aborted" };
  return { kind: "exhausted" };
}

/** Prüft, ob ein Datum ein Regeltermin ist (für Diagnose „unpassender Start“). */
export function isOccurrence(
  rule: Rule,
  start: Temporal.PlainDate,
  d: Temporal.PlainDate,
): boolean {
  const r = queryOccurrences({
    rule,
    start,
    from: d,
    limit: 1,
    ignoreCount: false,
  });
  return r.dates.length > 0 && r.dates[0]!.equals(d);
}

/** Regel ohne BY-Teile: fester Abstand ab einem Bezugstag (Art „ab Erledigung“, 5.2). */
export function isPlainInterval(rule: Rule): boolean {
  return (
    !rule.byday.length &&
    !rule.bymonthday.length &&
    !rule.bymonth.length &&
    !rule.byyearday.length &&
    !rule.byweekno.length &&
    !rule.bysetpos.length
  );
}

/**
 * Kandidaten „ab Erledigung“ nach dem Bezugstag B (5.2, Entscheidung 23.10.2026):
 * Regeln ohne BY-Teile zählen als fester Abstand ab B mit Klemmen ans Monatsende
 * (31.10. + 1 Monat = 30.11., 29.02. + 1 Jahr = 28.02.), jeweils von B aus gerechnet, nicht verkettet.
 * Regeln mit BY-Teilen werden wie bisher mit rrule ab B ausgewertet. COUNT zählt hier nie.
 */
export function completionOccurrences(
  q: Omit<EngineQuery, "start" | "after" | "from" | "ignoreCount"> & { base: Temporal.PlainDate },
): EngineResult {
  const { rule, base } = q;
  if (!isPlainInterval(rule)) {
    return queryOccurrences({ ...q, start: base, after: base, ignoreCount: true });
  }
  const dates: Temporal.PlainDate[] = [];
  const time = q.time ?? null;
  const unit =
    rule.freq === "DAILY"
      ? "days"
      : rule.freq === "WEEKLY"
        ? "weeks"
        : rule.freq === "MONTHLY"
          ? "months"
          : "years";
  for (let n = 1; dates.length < q.limit; n++) {
    if (n > 10_000 || (q.deadline && q.deadline.now() > q.deadline.until))
      return { dates, exhausted: false, aborted: true };
    let d: Temporal.PlainDate;
    try {
      d = base.add({ [unit]: rule.interval * n });
    } catch {
      return { dates, exhausted: false, aborted: true };
    }
    if (untilPassed(rule, d, time)) return { dates, exhausted: true, aborted: false };
    if (q.exclude && q.exclude(d)) continue;
    dates.push(d);
  }
  return { dates, exhausted: false, aborted: false };
}
