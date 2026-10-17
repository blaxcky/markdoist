// Eigener RRULE-Tokenizer mit Positivliste (Abschnitt 6).
// rrule.js ist beim Parsen zu nachsichtig; hier wird Unbekanntes erkannt, nie umgeschrieben.
import { Temporal } from "temporal-polyfill";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
export const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export interface ByDay {
  n: number | null;
  wd: Weekday;
}

export interface UntilValue {
  date: Temporal.PlainDate;
  /** lokale Uhrzeit bei UNTIL mit Uhrzeit (floating) */
  time: Temporal.PlainTime | null;
  utc: boolean;
}

export interface Rule {
  freq: Freq;
  interval: number;
  count: number | null;
  until: UntilValue | null;
  byday: ByDay[];
  bymonthday: number[];
  bymonth: number[];
  byyearday: number[];
  byweekno: number[];
  bysetpos: number[];
  wkst: Weekday;
}

export type RuleParse =
  | { status: "ok"; rule: Rule; dtstart: DtStart | null; normalized: string }
  | { status: "unsupported"; message: string; dtstart: DtStart | null }
  | { status: "invalid"; message: string; dtstart: DtStart | null };

export interface DtStart {
  date: Temporal.PlainDate;
  time: Temporal.PlainTime | null;
  utc: boolean;
}

const SUPPORTED = new Set([
  "FREQ",
  "INTERVAL",
  "COUNT",
  "UNTIL",
  "BYDAY",
  "BYMONTHDAY",
  "BYMONTH",
  "BYYEARDAY",
  "BYWEEKNO",
  "BYSETPOS",
  "WKST",
]);
const KNOWN_UNSUPPORTED = new Set([
  "BYHOUR",
  "BYMINUTE",
  "BYSECOND",
  "RSCALE",
  "SKIP",
  "BYEASTER",
  "TZID",
  "RDATE",
  "EXRULE",
  "EXDATE",
]);

function parseIcalDate(v: string): DtStart | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  try {
    const date = Temporal.PlainDate.from(
      { year: +m[1]!, month: +m[2]!, day: +m[3]! },
      { overflow: "reject" },
    );
    const time =
      m[4] !== undefined
        ? Temporal.PlainTime.from(
            { hour: +m[4], minute: +m[5]!, second: +m[6]! },
            { overflow: "reject" },
          )
        : null;
    return { date, time, utc: m[7] === "Z" };
  } catch {
    return null;
  }
}

function intList(v: string, min: number, max: number, allowNeg: boolean): number[] | null {
  const out: number[] = [];
  for (const part of v.split(",")) {
    if (!/^[+-]?\d+$/.test(part)) return null;
    const n = parseInt(part, 10);
    if (n === 0) return null;
    if (n < 0 && !allowNeg) return null;
    if (Math.abs(n) < min || Math.abs(n) > max) return null;
    out.push(n);
  }
  return out;
}

/** Zerlegt und validiert den Wert des Feldes `recurrence`. */
export function parseRule(raw: string): RuleParse {
  let s = raw.trim();
  let dtstart: DtStart | null = null;
  if (/^RRULE:/i.test(s)) s = s.slice(6);
  const parts = s.split(";").filter((p) => p.length > 0);
  const seen = new Map<string, string>();
  for (const part of parts) {
    if (/^DTSTART/i.test(part)) {
      // TaskNotes-Form: DTSTART:20250101T090000Z;FREQ=...
      const m = /^DTSTART(;[^:]*)?:(.+)$/i.exec(part);
      if (!m) return { status: "invalid", message: `Ungültiges DTSTART „${part}“`, dtstart };
      if (m[1]) return { status: "unsupported", message: "DTSTART mit Parametern (TZID) wird nicht unterstützt", dtstart };
      dtstart = parseIcalDate(m[2]!);
      if (!dtstart) return { status: "invalid", message: `Ungültiges DTSTART „${m[2]}“`, dtstart };
      continue;
    }
    const eq = part.indexOf("=");
    if (eq <= 0) return { status: "invalid", message: `Unbekannter Regelteil „${part}“`, dtstart };
    const key = part.slice(0, eq).toUpperCase();
    const value = part.slice(eq + 1).toUpperCase();
    if (seen.has(key)) return { status: "invalid", message: `Regelteil ${key} doppelt`, dtstart };
    seen.set(key, value);
  }
  for (const key of seen.keys()) {
    if (KNOWN_UNSUPPORTED.has(key)) {
      return { status: "unsupported", message: `Regelteil ${key} wird in v1 nicht unterstützt`, dtstart };
    }
    if (!SUPPORTED.has(key)) {
      return { status: "invalid", message: `Unbekannter Regelteil ${key}`, dtstart };
    }
  }
  const freqRaw = seen.get("FREQ");
  if (!freqRaw) return { status: "invalid", message: "FREQ fehlt", dtstart };
  if (["HOURLY", "MINUTELY", "SECONDLY"].includes(freqRaw)) {
    return { status: "unsupported", message: `FREQ=${freqRaw} wird in v1 nicht unterstützt`, dtstart };
  }
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freqRaw)) {
    return { status: "invalid", message: `Unbekannte Frequenz ${freqRaw}`, dtstart };
  }
  const freq = freqRaw as Freq;
  const bad = (message: string): RuleParse => ({ status: "invalid", message, dtstart });

  let interval = 1;
  if (seen.has("INTERVAL")) {
    const v = seen.get("INTERVAL")!;
    if (!/^\d+$/.test(v) || parseInt(v, 10) < 1) return bad("INTERVAL muss positiv sein");
    interval = parseInt(v, 10);
  }
  let count: number | null = null;
  if (seen.has("COUNT")) {
    const v = seen.get("COUNT")!;
    if (!/^\d+$/.test(v) || parseInt(v, 10) < 1) return bad("COUNT muss positiv sein");
    count = parseInt(v, 10);
  }
  let until: UntilValue | null = null;
  if (seen.has("UNTIL")) {
    const u = parseIcalDate(seen.get("UNTIL")!);
    if (!u) return bad("UNTIL ist kein gültiges Datum");
    until = u;
  }
  if (count !== null && until !== null) return bad("COUNT und UNTIL dürfen nicht gemeinsam stehen");

  const byday: ByDay[] = [];
  if (seen.has("BYDAY")) {
    for (const p of seen.get("BYDAY")!.split(",")) {
      const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(p);
      if (!m) return bad(`Ungültiger BYDAY-Wert ${p}`);
      const n = m[1] !== undefined ? parseInt(m[1], 10) : null;
      if (n !== null) {
        if (n === 0) return bad("BYDAY-Ordinal 0 ist ungültig");
        if (freq !== "MONTHLY" && freq !== "YEARLY") {
          return bad("BYDAY mit Ordinal nur bei FREQ=MONTHLY oder YEARLY");
        }
        const max = freq === "MONTHLY" ? 5 : 53;
        if (Math.abs(n) > max) return bad(`BYDAY-Ordinal ${n} außerhalb des Bereichs`);
        if (freq === "YEARLY" && seen.has("BYWEEKNO")) {
          return bad("BYDAY mit Ordinal ist mit BYWEEKNO nicht zulässig");
        }
      }
      byday.push({ n, wd: m[2] as Weekday });
    }
  }
  const list = (key: string, min: number, max: number, neg: boolean) => {
    if (!seen.has(key)) return [];
    return intList(seen.get(key)!, min, max, neg);
  };
  const bymonthday = list("BYMONTHDAY", 1, 31, true);
  if (!bymonthday) return bad("Ungültiger BYMONTHDAY-Wert");
  const bymonth = list("BYMONTH", 1, 12, false);
  if (!bymonth) return bad("Ungültiger BYMONTH-Wert");
  const byyearday = list("BYYEARDAY", 1, 366, true);
  if (!byyearday) return bad("Ungültiger BYYEARDAY-Wert");
  const byweekno = list("BYWEEKNO", 1, 53, true);
  if (!byweekno) return bad("Ungültiger BYWEEKNO-Wert");
  const bysetpos = list("BYSETPOS", 1, 366, true);
  if (!bysetpos) return bad("Ungültiger BYSETPOS-Wert");

  if (bymonthday.length && freq === "WEEKLY") return bad("BYMONTHDAY ist bei FREQ=WEEKLY nicht zulässig");
  if (byyearday.length && freq !== "YEARLY") return bad("BYYEARDAY nur bei FREQ=YEARLY");
  if (byweekno.length && freq !== "YEARLY") return bad("BYWEEKNO nur bei FREQ=YEARLY");
  if (bysetpos.length) {
    const others =
      byday.length + bymonthday.length + bymonth.length + byyearday.length + byweekno.length;
    if (others === 0) return bad("BYSETPOS braucht einen weiteren BY-Regelteil");
  }
  let wkst: Weekday = "MO";
  if (seen.has("WKST")) {
    const w = seen.get("WKST")!;
    if (!WEEKDAYS.includes(w as Weekday)) return bad(`Ungültiger WKST-Wert ${w}`);
    wkst = w as Weekday;
  }
  const rule: Rule = {
    freq,
    interval,
    count,
    until,
    byday,
    bymonthday,
    bymonth,
    byyearday,
    byweekno,
    bysetpos,
    wkst,
  };
  const impossible = impossibleReason(rule);
  if (impossible) return bad(impossible);
  return { status: "ok", rule, dtstart, normalized: formatRule(rule) };
}

const DAYS_IN_MONTH_MAX = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Syntaktisch gültige, aber unmögliche Regeln erkennen (z. B. 30. Februar). */
function impossibleReason(r: Rule): string | null {
  if (r.bymonthday.length && r.bymonth.length) {
    const ok = r.bymonth.some((m) =>
      r.bymonthday.some((d) => Math.abs(d) <= DAYS_IN_MONTH_MAX[m - 1]!),
    );
    if (!ok) return "Regel erzeugt keine Termine (Tag existiert in keinem gewählten Monat)";
  }
  return null;
}

/** Kanonische Textform; nur für neu erzeugte Regeln, nie zum Umschreiben fremder Regeln. */
export function formatRule(r: Rule): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.interval !== 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.byday.length) parts.push(`BYDAY=${r.byday.map((d) => `${d.n ?? ""}${d.wd}`).join(",")}`);
  if (r.bymonthday.length) parts.push(`BYMONTHDAY=${r.bymonthday.join(",")}`);
  if (r.bymonth.length) parts.push(`BYMONTH=${r.bymonth.join(",")}`);
  if (r.byyearday.length) parts.push(`BYYEARDAY=${r.byyearday.join(",")}`);
  if (r.byweekno.length) parts.push(`BYWEEKNO=${r.byweekno.join(",")}`);
  if (r.bysetpos.length) parts.push(`BYSETPOS=${r.bysetpos.join(",")}`);
  if (r.wkst !== "MO") parts.push(`WKST=${r.wkst}`);
  if (r.count !== null) parts.push(`COUNT=${r.count}`);
  if (r.until) {
    const d = r.until.date.toString().replace(/-/g, "");
    const t = r.until.time
      ? `T${r.until.time.toString({ smallestUnit: "second" }).replace(/:/g, "")}${r.until.utc ? "Z" : ""}`
      : "";
    parts.push(`UNTIL=${d}${t}`);
  }
  return parts.join(";");
}

/** Semantischer Vergleich zweier Regeln (gleiche Regel erneut speichern = kein neuer Abschnitt). */
export function sameRule(a: Rule, b: Rule): boolean {
  const norm = (r: Rule) => {
    const sorted = <T>(xs: T[], f: (x: T) => string) => xs.map(f).sort().join(",");
    return [
      r.freq,
      r.interval,
      r.count ?? "",
      r.until ? `${r.until.date}T${r.until.time ?? ""}${r.until.utc}` : "",
      sorted(r.byday, (d) => `${d.n ?? ""}${d.wd}`),
      sorted(r.bymonthday, String),
      sorted(r.bymonth, String),
      sorted(r.byyearday, String),
      sorted(r.byweekno, String),
      sorted(r.bysetpos, String),
      r.wkst,
    ].join("|");
  };
  return norm(a) === norm(b);
}
