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

/** Suchhorizont der ersten, schnellen Suchstufe je Frequenz in Jahren über den Suchbeginn
 *  hinaus (Abschnitt 6). Er deckt die üblichen Regeln ab; seltene Regeln findet die zweite
 *  Stufe über den vollen Kalenderzyklus (siehe `CYCLE_YEARS`). */
export const HORIZON_YEARS: Record<Rule["freq"], number> = {
  DAILY: 30,
  WEEKLY: 30,
  MONTHLY: 100,
  YEARLY: 400,
};

/** Der Gregorianische Kalender wiederholt sich nach 400 Jahren (146.097 Tage = 20.871 Wochen,
 *  Wochentage und Schaltjahre eingeschlossen). Eine Regel mit INTERVAL n ist damit spätestens
 *  nach n solchen Zyklen periodisch: Hat sie nach dem Suchbeginn überhaupt noch einen Termin,
 *  liegt er innerhalb von 400 × n Jahren. Die zweite Suchstufe verwendet diesen Horizont, so dass
 *  akzeptierte Regeln nicht an einer willkürlichen Grenze stehen bleiben (Nachprüfung 24.10.2026,
 *  N1: Schalttag am Montag springt über das Nicht-Schaltjahr 2100 hinweg 40 Jahre). */
export const CYCLE_YEARS = 400;

const MAX_DATE = Temporal.PlainDate.from("9999-12-31");

/** Zeitbudget je Abfrage in Millisekunden, wenn der Aufrufer keine eigene Grenze setzt (Abschnitt 6).
 *  Treffer seltener gültiger Regeln liegen weit darunter (Schalttag am Montag über 40 Jahre: rund
 *  40 ms); erreicht wird es nur von Regeln, die nie einen Termin erzeugen. Abbruch heißt
 *  „Berechnung zu aufwendig“, nie Serienende. */
export const SEARCH_BUDGET_MS = 500;

const clock = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Haken im gepatchten rrule (patches/rrule@2.8.1.patch): wird je Zählzeitraum gefragt, ob die
 *  Iteration enden soll. rrule ruft die Engine sonst nur bei Treffern zurück. */
const hooks = globalThis as { __markdoistRruleStop?: () => boolean };

function horizonFrom(base: Temporal.PlainDate, years: number): Temporal.PlainDate {
  if (base.year + years > 9999) return MAX_DATE;
  return base.add({ years });
}

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
  const searchBase = [q.start, q.after, q.from].reduce<Temporal.PlainDate>(
    (acc, d) => (d && Temporal.PlainDate.compare(d, acc) > 0 ? d : acc),
    q.start,
  );
  // Ein gemeinsames Budget für beide Stufen.
  const start = clock();
  const deadline = q.deadline ?? { now: clock, until: start + SEARCH_BUDGET_MS };
  const quick = horizonFrom(searchBase, HORIZON_YEARS[q.rule.freq]);
  const first = search(q, quick, deadline);
  if (!first.horizonReached) return first.result;
  // Zweite Stufe nur, wenn die schnelle Suche am Horizont endete (nicht bei Zeitgrenze, COUNT, UNTIL).
  const cycle = horizonFrom(searchBase, CYCLE_YEARS * q.rule.interval);
  if (Temporal.PlainDate.compare(cycle, quick) <= 0) return first.result;
  return search(q, cycle, deadline).result;
}

function search(
  q: EngineQuery,
  horizon: Temporal.PlainDate,
  deadline: { now(): number; until: number },
): { result: EngineResult; horizonReached: boolean } {
  const { rule } = q;
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
  let horizonReached = false;
  let index = 0;
  let last: Temporal.PlainDate | null = null;
  const time = q.time ?? null;
  let stoppedByTime = false;
  let ticks = 0;
  const previousHook = hooks.__markdoistRruleStop;
  hooks.__markdoistRruleStop = () => {
    if (++ticks % 1024 !== 0) return false;
    if (deadline.now() <= deadline.until) return false;
    stoppedByTime = true;
    return true;
  };
  try {
    rr.all((raw) => {
      if (deadline.now() > deadline.until) {
        aborted = true;
        return false;
      }
      const d = fromDate(raw);
      // Ein doppelt gelieferter Termin (rrule dedupliziert BYSETPOS-Treffer erst seit unserem Patch
      // nach Zeitwert) darf COUNT nicht verbrauchen; die Folge ist aufsteigend, Vergleich mit dem Vorgänger reicht.
      if (last && d.equals(last)) return true;
      last = d;
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
  } finally {
    hooks.__markdoistRruleStop = previousHook;
  }
  if (stoppedByTime) aborted = true;
  if (!exhausted && !aborted && dates.length < q.limit) {
    // Iteration endete ohne Abbruch durch uns: COUNT ausgeschöpft am Ende oder Horizont erreicht.
    if (!q.ignoreCount && rule.count !== null && index >= rule.count) exhausted = true;
    else if (rule.until && Temporal.PlainDate.compare(horizon, rule.until.date) >= 0)
      exhausted = true;
    else {
      aborted = true;
      horizonReached = true;
    }
  }
  return { result: { dates, exhausted, aborted }, horizonReached };
}

export type NextResult =
  { kind: "found"; date: Temporal.PlainDate } | { kind: "exhausted" } | { kind: "aborted" };

export function nextOccurrence(q: Omit<EngineQuery, "limit">): NextResult {
  const r = queryOccurrences({ ...q, limit: 1 });
  if (r.dates.length) return { kind: "found", date: r.dates[0]! };
  if (r.aborted) return { kind: "aborted" };
  return { kind: "exhausted" };
}

/**
 * Erster Termin eines neuen Serienabschnitts (5.4 „Serie anlegen“ / „Regel ändern“): der erste
 * passende Regeltermin ab `from` einschließlich, mit der Serienuhrzeit für die UNTIL-Grenze.
 * Gilt für beide Arten; bei „ab Erledigung“ wird dieser Termin direkt verwendet und nicht um ein
 * Intervall verschoben. Anlegen (actions.ts) und Formularvorschau nutzen dieselbe Funktion, damit
 * Vorschau und gespeicherter Stand nicht auseinanderlaufen (Review 23.10.2026, R3).
 */
export function firstOccurrence(
  rule: Rule,
  from: Temporal.PlainDate,
  time: Temporal.PlainTime | null,
): NextResult {
  return nextOccurrence({ rule, start: from, from, time });
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
