// Deutsche Beschreibung einfacher Regeln (Abschnitt 6). Sonst null → Rohregel anzeigen.
import { Temporal } from "temporal-polyfill";
import type { Rule, Weekday } from "./rule";

const WD_LONG: Record<Weekday, string> = {
  MO: "Montag",
  TU: "Dienstag",
  WE: "Mittwoch",
  TH: "Donnerstag",
  FR: "Freitag",
  SA: "Samstag",
  SU: "Sonntag",
};
const WD_SHORT: Record<Weekday, string> = { MO: "Mo", TU: "Di", WE: "Mi", TH: "Do", FR: "Fr", SA: "Sa", SU: "So" };
const ORD: Record<number, string> = { 1: "1.", 2: "2.", 3: "3.", 4: "4.", 5: "5.", [-1]: "letzten" };
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function every(n: number, one: string, many: string): string {
  return n === 1 ? one : `alle ${n} ${many}`;
}

function limits(r: Rule, anchor: "calendar" | "completion"): string {
  const out: string[] = [];
  if (r.count !== null) out.push(anchor === "completion" ? `insgesamt ${r.count}-mal erledigen` : `${r.count}-mal`);
  if (r.until) {
    const d = r.until.date;
    out.push(`bis ${String(d.day).padStart(2, "0")}.${String(d.month).padStart(2, "0")}.${d.year}`);
  }
  return out.length ? `, ${out.join(", ")}` : "";
}

/** Beschreibt eine Regel, z. B. „jeden 2. Dienstag im Monat“. */
export function describeRule(r: Rule, anchor: "calendar" | "completion" = "calendar"): string | null {
  const others = r.byyearday.length || r.byweekno.length || r.wkst !== "MO" && r.interval > 1 && r.freq === "WEEKLY";
  if (others) return null;
  let core: string | null = null;
  if (anchor === "completion") {
    if (r.byday.length || r.bymonthday.length || r.bymonth.length || r.bysetpos.length) return null;
    const unit = { DAILY: ["Tag", "Tage"], WEEKLY: ["Woche", "Wochen"], MONTHLY: ["Monat", "Monate"], YEARLY: ["Jahr", "Jahre"] }[r.freq];
    core = `${r.interval === 1 ? `1 ${unit[0]}` : `${r.interval} ${unit[1]}`} nach Erledigung`;
    return core + limits(r, anchor);
  }
  switch (r.freq) {
    case "DAILY":
      if (r.byday.length || r.bymonthday.length || r.bymonth.length || r.bysetpos.length) return null;
      core = every(r.interval, "täglich", "Tage");
      break;
    case "WEEKLY": {
      if (r.bymonth.length || r.bysetpos.length || r.byday.some((d) => d.n !== null)) return null;
      const days = r.byday.map((d) => d.wd);
      const workdays = days.length === 5 && ["MO", "TU", "WE", "TH", "FR"].every((d) => days.includes(d as Weekday));
      if (workdays && r.interval === 1) core = "werktags (Mo–Fr)";
      else {
        const base = every(r.interval, "wöchentlich", "Wochen");
        core = days.length ? `${base} am ${sortDays(days).map((d) => WD_SHORT[d]).join(", ")}` : base;
      }
      break;
    }
    case "MONTHLY": {
      if (r.bymonth.length) return null;
      const base = every(r.interval, "monatlich", "Monate");
      if (!r.byday.length && !r.bysetpos.length && r.bymonthday.length === 1) {
        const d = r.bymonthday[0]!;
        core = d === -1 ? `${base} am letzten Tag` : d > 0 ? `${base} am ${d}.` : null;
      } else if (
        !r.byday.length &&
        r.bysetpos.length === 1 &&
        r.bysetpos[0] === -1 &&
        r.bymonthday.join(",") === "28,29,30"
      ) {
        core = `${base} am 30. oder letzten Tag`;
      } else if (r.byday.length === 1 && !r.bymonthday.length && !r.bysetpos.length && r.byday[0]!.n !== null) {
        const b = r.byday[0]!;
        const ord = ORD[b.n!];
        if (!ord) return null;
        core =
          r.interval === 1
            ? `jeden ${ord} ${WD_LONG[b.wd]} im Monat`
            : `${base} am ${ord} ${WD_LONG[b.wd]}`;
      } else if (!r.byday.length && !r.bymonthday.length && !r.bysetpos.length) {
        core = base;
      }
      break;
    }
    case "YEARLY": {
      const base = every(r.interval, "jährlich", "Jahre");
      if (r.byday.length || r.bysetpos.length) return null;
      if (r.bymonth.length === 1 && r.bymonthday.length === 1) {
        const d = r.bymonthday[0]!;
        const m = MONTHS[r.bymonth[0]! - 1]!;
        core = d === -1 ? `${base} am letzten Tag im ${m}` : d > 0 ? `${base} am ${d}. ${m}` : null;
      } else if (!r.bymonth.length && !r.bymonthday.length) core = base;
      break;
    }
  }
  return core ? core + limits(r, anchor) : null;
}

function sortDays(days: Weekday[]): Weekday[] {
  const order: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function describeOccurrence(d: Temporal.PlainDate): string {
  return `${WD_SHORT[(["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as Weekday[])[d.dayOfWeek - 1]!]} ${String(d.day).padStart(2, "0")}.${String(d.month).padStart(2, "0")}.${d.year}`;
}
