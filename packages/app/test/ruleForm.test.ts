import { describe, expect, it } from "vitest";
import { hashText, parseRule, queryOccurrences, readSeries, readTaskFile, Temporal, type Series, type SeriesSpec } from "@markdoist/core";
import { buildRuleText, defaultForm, formFromSeries, needsMonthEndChoice, previewForm, specFromForm, type RuleForm } from "../src";

const today = Temporal.PlainDate.from("2026-10-12");

describe("Regelformular", () => {
  it("wöchentlich Montag, 5-mal", () => {
    const f = { ...defaultForm(today), end: "count" as const, count: 5 };
    expect(buildRuleText(f)).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=5");
    const p = previewForm(f, today, false);
    expect(p.dates.map(String)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(p.description).toBe("wöchentlich am Mo, 5-mal");
  });
  it("Monatsende-Abfrage für den 31.", () => {
    const f = { ...defaultForm(Temporal.PlainDate.from("2026-10-31")), freq: "monthly" as const, monthDay: 31 };
    expect(needsMonthEndChoice(f)).toBe(true);
    expect(buildRuleText(f)).toBe("FREQ=MONTHLY;BYMONTHDAY=31");
    expect(buildRuleText({ ...f, monthEnd: "last" })).toBe("FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(buildRuleText({ ...f, monthDay: 30, monthEnd: "last" })).toBe("FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1");
  });
  it("29.02. jährlich: letzter Februartag", () => {
    const f = { ...defaultForm(Temporal.PlainDate.from("2028-02-29")), freq: "yearly" as const, monthEnd: "last" as const };
    expect(buildRuleText(f)).toBe("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
  });
  it("erweiterte Eingabe validiert", () => {
    const f = { ...defaultForm(today), mode: "advanced" as const, advanced: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30" };
    expect(previewForm(f, today, false).ok).toBe(false);
    const g = { ...f, advanced: "FREQ=DAILY;COUNT=2;UNTIL=20261231" };
    expect(previewForm(g, today, false).message).toMatch(/COUNT und UNTIL/);
  });
  it("Completion", () => {
    const f = { ...defaultForm(today), anchor: "completion" as const, interval: 14, freq: "daily" as const };
    expect(buildRuleText(f)).toBe("FREQ=DAILY;INTERVAL=14");
  });
});

describe("Vorschautexte (seriesPreview)", () => {
  it("nennt nächstes Vorkommen und Kollision", async () => {
    const { previewLines } = await import("../src");
    const { Temporal } = await import("@markdoist/core");
    const lines = previewLines(
      {
        result: "change",
        message: null,
        newSection: false,
        ended: false,
        reopened: false,
        instance: Temporal.PlainDate.from("2026-10-26"),
        dates: [{ field: "due", from: "2026-10-19", to: "2026-10-26" }],
        shifted: false,
        supersededOverdue: null,
        passedOver: [{ date: Temporal.PlainDate.from("2026-10-19"), reason: "done" }],
      },
      "Europe/Berlin",
    );
    expect(lines).toEqual([
      "Nächstes Vorkommen: Mo, 26.10.2026",
      "Mo, 19.10.2026 ist schon erledigt und wird übergangen",
      "Frist: Mo, 19.10.2026 → Mo, 26.10.2026",
    ]);
  });
});

// R8: Öffnen einer Serie im Formular und unverändertes Speichern darf die Regel nicht verändern.
function seriesOf(spec: SeriesSpec): Series {
  const lines = [
    "id: 01K69X4D2M7Q0B5T8V3W6Y1Z4C",
    "format_version: 1",
    "title: Serie",
    "status: open",
    `recurrence: ${spec.rule}`,
    `recurrence_start: ${spec.start}`,
    `recurrence_anchor: ${spec.anchor}`,
    `recurrence_field: ${spec.field}`,
    ...(spec.offsetDays === null ? [] : [`recurrence_offset_days: ${spec.offsetDays}`]),
  ];
  const text = `---\n${lines.join("\n")}\n---\n`;
  const t = readTaskFile({ ref: "/x/Serie.md", name: "Serie.md", text, hash: hashText(text), mtime: null });
  if (t.kind !== "task") throw new Error(`keine Aufgabe: ${JSON.stringify(t.diagnostics)}`);
  const s = readSeries(t);
  if (!s?.rule) throw new Error(`keine auswertbare Serie: ${spec.rule}`);
  return s;
}

/** Die nächsten Termine einer Regel ab Start (inklusive Erschöpfung) als fachlicher Vergleich. */
function occurrences(spec: SeriesSpec): string[] {
  const p = parseRule(spec.rule);
  if (p.status !== "ok") throw new Error(`Regel ungültig: ${spec.rule}`);
  const [d, t] = spec.start.split("T");
  const start = Temporal.PlainDate.from(d!);
  const r = queryOccurrences({ rule: p.rule, start, from: start, time: t ? Temporal.PlainTime.from(t) : null, limit: 60 });
  return [...r.dates.map(String), r.exhausted ? "erschöpft" : "offen"];
}

function roundtrip(spec: SeriesSpec): { form: RuleForm; spec: SeriesSpec } {
  const form = formFromSeries(seriesOf(spec), today);
  return { form, spec: specFromForm(form) };
}

const d = (s: string) => Temporal.PlainDate.from(s);

/** Alle Regelarten, die das einfache Formular erzeugen kann. */
function producibleForms(): { name: string; form: RuleForm }[] {
  const base: { name: string; start: string; patch: Partial<RuleForm> }[] = [
    { name: "täglich", start: "2026-10-12", patch: { freq: "daily" } },
    { name: "alle 3 Tage", start: "2026-10-12", patch: { freq: "daily", interval: 3 } },
    { name: "werktags", start: "2026-10-12", patch: { freq: "weekdays" } },
    { name: "wöchentlich Mo, Termin am Vortag geplant", start: "2026-10-12", patch: { freq: "weekly", weekdays: ["MO"], offset: "-1" } },
    { name: "wöchentlich Di, Do", start: "2026-10-13", patch: { freq: "weekly", weekdays: ["TU", "TH"] } },
    { name: "alle 2 Wochen Sa, So", start: "2026-10-17", patch: { freq: "weekly", interval: 2, weekdays: ["SA", "SU"] } },
    { name: "wöchentlich Mo–Fr alle 2 Wochen", start: "2026-10-12", patch: { freq: "weekly", interval: 2, weekdays: ["MO", "TU", "WE", "TH", "FR"] } },
    { name: "monatlich letzter Tag", start: "2026-10-31", patch: { freq: "monthly", monthlyMode: "last-day" } },
    { name: "alle 2 Monate letzter Tag", start: "2026-10-31", patch: { freq: "monthly", interval: 2, monthlyMode: "last-day" } },
  ];
  for (const day of [1, 15, 28, 29, 30, 31]) {
    for (const monthEnd of ["skip", "last"] as const) {
      const start = `2026-10-${String(day).padStart(2, "0")}`;
      base.push({ name: `monatlich am ${day}. (${monthEnd})`, start, patch: { freq: "monthly", monthlyMode: "day", monthDay: day, monthEnd } });
    }
  }
  for (const nth of [1, 2, 3, 4, -1]) {
    for (const wd of ["MO", "SU"] as const) {
      base.push({ name: `monatlich ${nth}. ${wd}`, start: "2026-10-01", patch: { freq: "monthly", monthlyMode: "nth-weekday", nth, nthWeekday: wd } });
    }
  }
  for (const start of ["2026-10-12", "2027-01-31", "2026-04-30", "2026-02-28", "2028-02-29"]) {
    base.push({ name: `jährlich ab ${start}`, start, patch: { freq: "yearly" } });
    base.push({ name: `alle 2 Jahre ab ${start}`, start, patch: { freq: "yearly", interval: 2 } });
  }
  base.push({ name: "jährlich 29.02. letzter Februartag", start: "2028-02-29", patch: { freq: "yearly", monthEnd: "last" } });
  base.push({ name: "alle 4 Jahre 29.02. letzter Februartag", start: "2028-02-29", patch: { freq: "yearly", interval: 4, monthEnd: "last" } });
  for (const freq of ["daily", "weekly", "monthly", "yearly"] as const) {
    base.push({ name: `ab Erledigung ${freq}`, start: "2026-10-31", patch: { anchor: "completion", freq, interval: 2 } });
  }
  base.push({ name: "ab Erledigung werktags", start: "2026-10-12", patch: { anchor: "completion", freq: "weekdays" } });

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

describe("Regelformular: Öffnen und unverändertes Speichern (R8)", () => {
  it("Fall aus dem Review: letzter Februartag ab 29.02.2028 bleibt erhalten", () => {
    const spec: SeriesSpec = { rule: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", anchor: "calendar", field: "due", start: "2028-02-29", offsetDays: null };
    const r = roundtrip(spec);
    expect(r.form.mode).toBe("simple");
    expect(r.form.freq).toBe("yearly");
    expect(r.form.monthEnd).toBe("last");
    expect(r.spec.rule).toBe("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
    expect(occurrences(r.spec).slice(0, 3)).toEqual(["2028-02-29", "2029-02-28", "2030-02-28"]);
  });

  it.each(producibleForms())("$name: Regel → Formular → Regel ist identisch und einfach", ({ form }) => {
    const spec = specFromForm(form);
    const r = roundtrip(spec);
    expect(r.form.mode).toBe("simple");
    expect(r.spec).toEqual(spec);
    expect(occurrences(r.spec)).toEqual(occurrences(spec));
  });

  // Regeln von außen: entweder im einfachen Modus ohne fachliche Änderung oder unverändert im erweiterten Modus.
  const cal = (rule: string, start: string, anchor: "calendar" | "completion" = "calendar"): SeriesSpec => ({ rule, anchor, field: "due", start, offsetDays: null });
  const external: { spec: SeriesSpec; mode: "simple" | "advanced" }[] = [
    // jährlich passend zum Start bzw. ohne BY-Teile (Starttag gilt)
    { spec: cal("FREQ=YEARLY", "2026-10-12"), mode: "simple" },
    { spec: cal("FREQ=YEARLY", "2028-02-29"), mode: "simple" },
    { spec: cal("FREQ=YEARLY;BYMONTH=10", "2026-10-12"), mode: "simple" },
    { spec: cal("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", "2028-02-29"), mode: "simple" },
    // jährlich, nicht durch das Formular darstellbar
    { spec: cal("FREQ=YEARLY;BYMONTHDAY=12", "2026-10-12"), mode: "advanced" },
    { spec: cal("FREQ=YEARLY;BYMONTH=3", "2026-10-12"), mode: "advanced" },
    { spec: cal("FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=5", "2026-10-12"), mode: "advanced" },
    { spec: cal("FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=5", "2026-10-12"), mode: "advanced" },
    { spec: cal("FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=-1", "2027-01-31"), mode: "advanced" },
    { spec: cal("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "2026-02-28"), mode: "advanced" },
    { spec: cal("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "2027-02-28"), mode: "advanced" },
    { spec: cal("FREQ=YEARLY;BYMONTHDAY=-1", "2028-02-29"), mode: "advanced" },
    // monatlich
    { spec: cal("FREQ=MONTHLY;BYMONTHDAY=-2", "2026-10-30"), mode: "advanced" },
    { spec: cal("FREQ=MONTHLY;BYMONTHDAY=29,30;BYSETPOS=-1", "2026-10-30"), mode: "advanced" },
    { spec: cal("FREQ=MONTHLY;BYDAY=5MO", "2026-11-30"), mode: "advanced" },
    { spec: cal("FREQ=MONTHLY;BYDAY=-2FR", "2026-10-23"), mode: "advanced" },
    { spec: cal("FREQ=MONTHLY;BYDAY=MO", "2026-10-12"), mode: "advanced" },
    // wöchentlich ohne BYDAY: Wochentag des Starts
    { spec: cal("FREQ=WEEKLY", "2026-10-14"), mode: "simple" },
    // ab Erledigung mit BY-Teilen kann das Formular nicht erzeugen
    { spec: cal("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-10-12", "completion"), mode: "advanced" },
    { spec: cal("FREQ=MONTHLY;BYMONTHDAY=-1", "2026-10-31", "completion"), mode: "advanced" },
    { spec: cal("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "2028-02-29", "completion"), mode: "advanced" },
    // UNTIL mit Uhrzeit vor dem Serientermin bzw. in UTC
    { spec: cal("FREQ=DAILY;UNTIL=20261020T080000", "2026-10-12T09:30"), mode: "advanced" },
    { spec: cal("FREQ=DAILY;UNTIL=20261020T235959Z", "2026-10-12T09:30"), mode: "advanced" },
    { spec: cal("FREQ=DAILY;UNTIL=20261020", "2026-10-12T09:30"), mode: "simple" },
    { spec: cal("FREQ=DAILY;UNTIL=20261020T080000", "2026-10-12"), mode: "simple" },
  ];

  it.each(external)("$spec.rule ab $spec.start ($spec.anchor) → $mode", ({ spec, mode }) => {
    const r = roundtrip(spec);
    expect(r.form.mode).toBe(mode);
    if (mode === "advanced") expect(r.spec.rule).toBe(spec.rule);
    expect(r.spec.start).toBe(spec.start);
    expect(occurrences(r.spec)).toEqual(occurrences(spec));
  });
});
