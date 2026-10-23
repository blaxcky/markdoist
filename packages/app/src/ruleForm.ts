// Formularmodell des Wiederholungseditors (Abschnitt 6), gemeinsam für beide Plattformen.
import {
  completionOccurrences,
  describeRule,
  formatRule,
  parseRule,
  queryOccurrences,
  Temporal,
  type Anchor,
  type RefField,
  type Rule,
  type Series,
  type SeriesSpec,
  type TaskAction,
  type Weekday,
} from "@markdoist/core";

export type SimpleFreq = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";
export type MonthlyMode = "day" | "last-day" | "nth-weekday";
/** Monatsende: Monate ohne diesen Tag auslassen oder stattdessen letzter Tag (Abschnitt 6). */
export type MonthEnd = "skip" | "last";
export type EndMode = "never" | "until" | "count";

export interface RuleForm {
  mode: "simple" | "advanced";
  anchor: Anchor;
  freq: SimpleFreq;
  interval: number;
  weekdays: Weekday[];
  monthlyMode: MonthlyMode;
  monthDay: number;
  monthEnd: MonthEnd;
  nth: number; // 1..4 oder -1
  nthWeekday: Weekday;
  end: EndMode;
  until: string; // YYYY-MM-DD
  count: number;
  /** Start (Datum) und optionale Serienuhrzeit */
  startDate: string;
  startTime: string;
  field: RefField;
  /** Abstand des anderen Datumsfelds; leer = keiner */
  offset: string;
  advanced: string;
  /** „Ab jetzt noch N-mal“ bzw. ausdrücklicher Neustart der Zählung */
  restartCount: boolean;
  resetChecklists: boolean;
}

const WD: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function weekdayOf(d: Temporal.PlainDate): Weekday {
  return WD[d.dayOfWeek - 1]!;
}

export function defaultForm(today: Temporal.PlainDate, field: RefField = "due"): RuleForm {
  const nth = Math.min(4, Math.ceil(today.day / 7));
  return {
    mode: "simple",
    anchor: "calendar",
    freq: "weekly",
    interval: 1,
    weekdays: [weekdayOf(today)],
    monthlyMode: "day",
    monthDay: today.day,
    monthEnd: "skip",
    nth,
    nthWeekday: weekdayOf(today),
    end: "never",
    until: today.add({ months: 3 }).toString(),
    count: 5,
    startDate: today.toString(),
    startTime: "",
    field,
    offset: "",
    advanced: "FREQ=WEEKLY",
    restartCount: false,
    resetChecklists: false,
  };
}

/** Bestehende Serie ins Formular übernehmen; nicht abbildbare Regeln öffnen die erweiterte Eingabe. */
export function formFromSeries(s: Series, today: Temporal.PlainDate): RuleForm {
  const f = defaultForm(s.start?.date ?? today, s.field);
  f.anchor = s.anchor;
  f.startDate = (s.start?.date ?? today).toString();
  f.startTime = s.start?.time ? s.start.time.toString({ smallestUnit: "minute" }) : "";
  f.offset = s.offsetDays === null ? "" : String(s.offsetDays);
  f.advanced = s.raw.replace(/^RRULE:/i, "");
  const r = s.rule;
  if (!r) {
    f.mode = "advanced";
    return f;
  }
  if (r.count !== null) {
    f.end = "count";
    f.count = r.count;
  } else if (r.until) {
    f.end = "until";
    f.until = r.until.date.toString();
  }
  f.interval = r.interval;
  const simple = untilKept(r, f) && simpleOf(r, f, Temporal.PlainDate.from(f.startDate));
  if (!simple) f.mode = "advanced";
  return f;
}

/**
 * Schreibt `buildRuleText()` das Regelende ohne Bedeutungsänderung zurück? Der Builder speichert
 * UNTIL als lokales Datum bzw. bei Serienuhrzeit mit 23:59:59. Eine UTC-Grenze oder eine frühere
 * Uhrzeit, die den Termin am letzten Tag ausschließt, ginge dabei verloren (R8).
 */
function untilKept(r: Rule, f: RuleForm): boolean {
  const u = r.until;
  if (!u) return true;
  if (u.utc) return false;
  if (!u.time || !f.startTime) return true;
  return u.time.equals(Temporal.PlainTime.from("23:59:59"));
}

const COMPLETION_FREQ: Record<Rule["freq"], SimpleFreq> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
};

/**
 * Übernimmt die Regel ins einfache Formular, wenn `buildRuleText()` daraus fachlich dieselbe Regel
 * erzeugt (R8). Alles andere bleibt im erweiterten Modus unverändert erhalten.
 */
function simpleOf(r: Rule, f: RuleForm, start: Temporal.PlainDate): boolean {
  if (r.byyearday.length || r.byweekno.length || r.wkst !== "MO") return false;
  if (f.anchor === "completion") {
    // Ab Erledigung schreibt der Builder nur FREQ, INTERVAL und Ende.
    if (r.byday.length || r.bymonthday.length || r.bymonth.length || r.bysetpos.length)
      return false;
    f.freq = COMPLETION_FREQ[r.freq];
    return true;
  }
  const plainDays = r.byday.every((d) => d.n === null);
  switch (r.freq) {
    case "DAILY":
      if (r.byday.length || r.bymonthday.length || r.bymonth.length || r.bysetpos.length)
        return false;
      f.freq = "daily";
      return true;
    case "WEEKLY": {
      if (!plainDays || r.bymonthday.length || r.bymonth.length || r.bysetpos.length) return false;
      const days = r.byday.map((d) => d.wd);
      if (
        r.interval === 1 &&
        days.length === 5 &&
        ["MO", "TU", "WE", "TH", "FR"].every((d) => days.includes(d as Weekday))
      ) {
        f.freq = "weekdays";
        return true;
      }
      f.freq = "weekly";
      // Ohne BYDAY gilt der Wochentag des Starts; der Builder schreibt ihn ausdrücklich.
      f.weekdays = days.length ? days : [weekdayOf(start)];
      return true;
    }
    case "MONTHLY":
      f.freq = "monthly";
      if (r.bymonth.length) return false;
      if (!r.byday.length && !r.bysetpos.length && r.bymonthday.length === 1) {
        const d = r.bymonthday[0]!;
        if (d === -1) {
          f.monthlyMode = "last-day";
          return true;
        }
        if (d > 0) {
          f.monthlyMode = "day";
          f.monthDay = d;
          f.monthEnd = "skip";
          return true;
        }
        return false;
      }
      if (
        !r.byday.length &&
        r.bysetpos.join() === "-1" &&
        /^28,29(,30)?$/.test(r.bymonthday.join(","))
      ) {
        f.monthlyMode = "day";
        f.monthDay = r.bymonthday.length + 27;
        f.monthEnd = "last";
        return true;
      }
      if (
        r.byday.length === 1 &&
        r.byday[0]!.n !== null &&
        !r.bymonthday.length &&
        !r.bysetpos.length
      ) {
        const n = r.byday[0]!.n!;
        if (n === 0 || n < -1 || n > 4) return false;
        f.monthlyMode = "nth-weekday";
        f.nth = n;
        f.nthWeekday = r.byday[0]!.wd;
        return true;
      }
      return false;
    case "YEARLY": {
      f.freq = "yearly";
      // Der Builder schreibt BYMONTH/BYMONTHDAY immer aus dem Startdatum; nur 29.02. kennt „letzter Tag“.
      if (r.byday.length || r.bysetpos.length) return false;
      const month = r.bymonth.join();
      const day = r.bymonthday.join();
      if (month === "2" && day === "-1" && start.month === 2 && start.day === 29) {
        f.monthEnd = "last";
        return true;
      }
      // Ohne BYMONTH/BYMONTHDAY gelten Monat und Tag des Starts (RFC 5545), wie beim Builder.
      // BYMONTHDAY allein würde dagegen jeden Monat treffen.
      const sameMonth = month === "" ? day === "" : month === String(start.month);
      if (sameMonth && (day === "" || day === String(start.day))) {
        f.monthEnd = "skip";
        return true;
      }
      return false;
    }
  }
}

/** Baut den RRULE-Text aus dem einfachen Formular. */
export function buildRuleText(f: RuleForm): string {
  if (f.mode === "advanced") return f.advanced.trim().replace(/^RRULE:/i, "");
  const start = Temporal.PlainDate.from(f.startDate);
  const r: Rule = {
    freq: "DAILY",
    interval: Math.max(1, Math.floor(f.interval) || 1),
    count: f.end === "count" ? Math.max(1, Math.floor(f.count) || 1) : null,
    until:
      f.end === "until" && f.until
        ? { date: Temporal.PlainDate.from(f.until), time: null, utc: false }
        : null,
    byday: [],
    bymonthday: [],
    bymonth: [],
    byyearday: [],
    byweekno: [],
    bysetpos: [],
    wkst: "MO",
  };
  if (r.until && f.startTime) {
    // Enddatum schließt den Termin dieses Tages ein (5.2): lokale Datumszeit am Ende des Tages.
    r.until = { ...r.until, time: Temporal.PlainTime.from("23:59:59") };
  }
  if (f.anchor === "completion") {
    r.freq =
      f.freq === "weekly" || f.freq === "weekdays"
        ? "WEEKLY"
        : f.freq === "monthly"
          ? "MONTHLY"
          : f.freq === "yearly"
            ? "YEARLY"
            : "DAILY";
    return formatRule(r);
  }
  switch (f.freq) {
    case "daily":
      r.freq = "DAILY";
      break;
    case "weekdays":
      r.freq = "WEEKLY";
      r.interval = 1;
      r.byday = (["MO", "TU", "WE", "TH", "FR"] as Weekday[]).map((wd) => ({ n: null, wd }));
      break;
    case "weekly":
      r.freq = "WEEKLY";
      r.byday = (f.weekdays.length ? f.weekdays : [weekdayOf(start)]).map((wd) => ({
        n: null,
        wd,
      }));
      break;
    case "monthly":
      r.freq = "MONTHLY";
      if (f.monthlyMode === "last-day") r.bymonthday = [-1];
      else if (f.monthlyMode === "nth-weekday") r.byday = [{ n: f.nth, wd: f.nthWeekday }];
      else if (f.monthDay >= 29 && f.monthEnd === "last") {
        if (f.monthDay === 31) r.bymonthday = [-1];
        else {
          r.bymonthday = f.monthDay === 30 ? [28, 29, 30] : [28, 29];
          r.bysetpos = [-1];
        }
      } else r.bymonthday = [f.monthDay];
      break;
    case "yearly":
      r.freq = "YEARLY";
      r.bymonth = [start.month];
      if (start.month === 2 && start.day === 29 && f.monthEnd === "last") r.bymonthday = [-1];
      else r.bymonthday = [start.day];
      break;
  }
  return formatRule(r);
}

/** Braucht das Formular die Monatsende-Abfrage? */
export function needsMonthEndChoice(f: RuleForm): boolean {
  if (f.mode !== "simple" || f.anchor !== "calendar") return false;
  if (f.freq === "monthly" && f.monthlyMode === "day") return f.monthDay >= 29;
  if (f.freq === "yearly") {
    const d = Temporal.PlainDate.from(f.startDate);
    return d.month === 2 && d.day === 29;
  }
  return false;
}

export interface FormPreview {
  ok: boolean;
  rule: string;
  description: string | null;
  dates: Temporal.PlainDate[];
  message: string | null;
  exhausted: boolean;
}

/** Validierung und Vorschau der nächsten höchstens 10 Termine. */
export function previewForm(
  f: RuleForm,
  today: Temporal.PlainDate,
  existing: boolean,
): FormPreview {
  let text: string;
  try {
    text = buildRuleText(f);
  } catch (e) {
    return {
      ok: false,
      rule: "",
      description: null,
      dates: [],
      message: String(e),
      exhausted: false,
    };
  }
  const p = parseRule(text);
  if (p.status !== "ok") {
    return {
      ok: false,
      rule: text,
      description: null,
      dates: [],
      message: p.message,
      exhausted: false,
    };
  }
  if (p.rule.until?.utc) {
    return {
      ok: false,
      rule: text,
      description: null,
      dates: [],
      message: "UNTIL mit UTC-Zeit bitte als Datum angeben",
      exhausted: false,
    };
  }
  let start: Temporal.PlainDate;
  try {
    start = Temporal.PlainDate.from(f.startDate);
  } catch {
    return {
      ok: false,
      rule: text,
      description: null,
      dates: [],
      message: "Ungültiger Start",
      exhausted: false,
    };
  }
  if (existing && Temporal.PlainDate.compare(start, today) < 0) start = today;
  // Ab Erledigung: erster Termin ist der Start selbst, danach fester Abstand ab dem jeweiligen Termin (5.2).
  const r =
    f.anchor === "completion"
      ? completionPreview(p.rule, start, 10)
      : queryOccurrences({ rule: p.rule, start, from: start, limit: 10 });
  if (r.aborted && !r.dates.length) {
    return {
      ok: false,
      rule: text,
      description: null,
      dates: [],
      message: "Berechnung zu aufwendig",
      exhausted: false,
    };
  }
  if (!r.dates.length) {
    return {
      ok: false,
      rule: text,
      description: null,
      dates: [],
      message: "Die Regel erzeugt ab dem Start keine Termine",
      exhausted: true,
    };
  }
  return {
    ok: true,
    rule: text,
    description: describeRule(p.rule, f.anchor),
    dates: r.dates,
    message: null,
    exhausted: r.exhausted,
  };
}

function completionPreview(
  rule: Rule,
  start: Temporal.PlainDate,
  limit: number,
): { dates: Temporal.PlainDate[]; exhausted: boolean; aborted: boolean } {
  const dates = [start];
  let exhausted = false;
  let aborted = false;
  while (dates.length < limit) {
    const r = completionOccurrences({ rule, base: dates[dates.length - 1]!, limit: 1 });
    if (!r.dates.length) {
      exhausted = r.exhausted;
      aborted = r.aborted;
      break;
    }
    dates.push(r.dates[0]!);
  }
  if (rule.count !== null && dates.length >= rule.count) {
    dates.splice(rule.count);
    exhausted = true;
  }
  return { dates, exhausted, aborted };
}

export function specFromForm(f: RuleForm): SeriesSpec {
  const offset = f.offset.trim() === "" ? null : parseInt(f.offset, 10);
  return {
    rule: buildRuleText(f),
    anchor: f.anchor,
    field: f.field,
    start: f.startTime ? `${f.startDate}T${f.startTime}` : f.startDate,
    offsetDays: offset === null || Number.isNaN(offset) ? null : offset,
  };
}

/** Aktion zum Speichern des Editors: Serie anlegen oder Regel ändern (5.4). */
export function ruleFormAction(
  f: RuleForm,
  series: Series | null,
  carryExceptions: string[] = [],
): TaskAction {
  let spec: SeriesSpec;
  try {
    spec = specFromForm(f);
  } catch {
    spec = { rule: "", anchor: f.anchor, field: f.field, start: f.startDate, offsetDays: null };
  }
  if (!series) return { type: "createSeries", spec };
  return {
    type: "changeRule",
    revision: series.revisionKey,
    spec,
    restartCount: f.restartCount,
    resetChecklists: f.resetChecklists,
    ...(carryExceptions.length ? { carryExceptions } : {}),
  };
}
