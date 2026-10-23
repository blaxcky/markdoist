// Gemeinsame Testhilfe: alle Regelarten, die das einfache Formular erzeugen kann (Abschnitt 6).
import { Temporal } from "@markdoist/core";
import { defaultForm, type RuleForm } from "../src";

const d = (s: string) => Temporal.PlainDate.from(s);

/** Alle Regelarten, die das einfache Formular erzeugen kann. */
export function producibleForms(): { name: string; form: RuleForm }[] {
  const base: { name: string; start: string; patch: Partial<RuleForm> }[] = [
    { name: "täglich", start: "2026-10-12", patch: { freq: "daily" } },
    { name: "alle 3 Tage", start: "2026-10-12", patch: { freq: "daily", interval: 3 } },
    { name: "werktags", start: "2026-10-12", patch: { freq: "weekdays" } },
    {
      name: "wöchentlich Mo, Termin am Vortag geplant",
      start: "2026-10-12",
      patch: { freq: "weekly", weekdays: ["MO"], offset: "-1" },
    },
    {
      name: "wöchentlich Di, Do",
      start: "2026-10-13",
      patch: { freq: "weekly", weekdays: ["TU", "TH"] },
    },
    {
      name: "alle 2 Wochen Sa, So",
      start: "2026-10-17",
      patch: { freq: "weekly", interval: 2, weekdays: ["SA", "SU"] },
    },
    {
      name: "wöchentlich Mo–Fr alle 2 Wochen",
      start: "2026-10-12",
      patch: { freq: "weekly", interval: 2, weekdays: ["MO", "TU", "WE", "TH", "FR"] },
    },
    {
      name: "monatlich letzter Tag",
      start: "2026-10-31",
      patch: { freq: "monthly", monthlyMode: "last-day" },
    },
    {
      name: "alle 2 Monate letzter Tag",
      start: "2026-10-31",
      patch: { freq: "monthly", interval: 2, monthlyMode: "last-day" },
    },
  ];
  for (const day of [1, 15, 28, 29, 30, 31]) {
    for (const monthEnd of ["skip", "last"] as const) {
      const start = `2026-10-${String(day).padStart(2, "0")}`;
      base.push({
        name: `monatlich am ${day}. (${monthEnd})`,
        start,
        patch: { freq: "monthly", monthlyMode: "day", monthDay: day, monthEnd },
      });
    }
  }
  for (const nth of [1, 2, 3, 4, -1]) {
    for (const wd of ["MO", "SU"] as const) {
      base.push({
        name: `monatlich ${nth}. ${wd}`,
        start: "2026-10-01",
        patch: { freq: "monthly", monthlyMode: "nth-weekday", nth, nthWeekday: wd },
      });
    }
  }
  for (const start of ["2026-10-12", "2027-01-31", "2026-04-30", "2026-02-28", "2028-02-29"]) {
    base.push({ name: `jährlich ab ${start}`, start, patch: { freq: "yearly" } });
    base.push({ name: `alle 2 Jahre ab ${start}`, start, patch: { freq: "yearly", interval: 2 } });
  }
  base.push({
    name: "jährlich 29.02. letzter Februartag",
    start: "2028-02-29",
    patch: { freq: "yearly", monthEnd: "last" },
  });
  base.push({
    name: "alle 4 Jahre 29.02. letzter Februartag",
    start: "2028-02-29",
    patch: { freq: "yearly", interval: 4, monthEnd: "last" },
  });
  for (const freq of ["daily", "weekly", "monthly", "yearly"] as const) {
    base.push({
      name: `ab Erledigung ${freq}`,
      start: "2026-10-31",
      patch: { anchor: "completion", freq, interval: 2 },
    });
  }
  base.push({
    name: "ab Erledigung werktags",
    start: "2026-10-12",
    patch: { anchor: "completion", freq: "weekdays" },
  });

  const ends: { name: string; patch: Partial<RuleForm> }[] = [
    { name: "", patch: { end: "never" } },
    { name: ", 7-mal", patch: { end: "count", count: 7 } },
    { name: ", bis 30.06.2031", patch: { end: "until", until: "2031-06-30" } },
  ];
  const out: { name: string; form: RuleForm }[] = [];
  for (const b of base) {
    for (const e of ends) {
      for (const startTime of ["", "09:30"]) {
        const form: RuleForm = { ...defaultForm(d(b.start)), ...b.patch, ...e.patch, startTime };
        out.push({ name: `${b.name}${e.name}${startTime ? ` um ${startTime}` : ""}`, form });
      }
    }
  }
  return out;
}
