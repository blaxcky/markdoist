import { describe, expect, it } from "vitest";
import { producibleForms } from "./forms";
import {
  hashText,
  parseRule,
  queryOccurrences,
  readSeries,
  readTaskFile,
  Temporal,
  type Series,
  type SeriesSpec,
} from "@markdoist/core";
import {
  buildRuleText,
  defaultForm,
  formFromSeries,
  needsMonthEndChoice,
  previewForm,
  specFromForm,
  type RuleForm,
} from "../src";

const today = Temporal.PlainDate.from("2026-10-12");

describe("Regelformular", () => {
  it("wöchentlich Montag, 5-mal", () => {
    const f = { ...defaultForm(today), end: "count" as const, count: 5 };
    expect(buildRuleText(f)).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=5");
    const p = previewForm(f, today, false);
    expect(p.dates.map(String)).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
    expect(p.description).toBe("wöchentlich am Mo, 5-mal");
  });
  it("Monatsende-Abfrage für den 31.", () => {
    const f = {
      ...defaultForm(Temporal.PlainDate.from("2026-10-31")),
      freq: "monthly" as const,
      monthDay: 31,
    };
    expect(needsMonthEndChoice(f)).toBe(true);
    expect(buildRuleText(f)).toBe("FREQ=MONTHLY;BYMONTHDAY=31");
    expect(buildRuleText({ ...f, monthEnd: "last" })).toBe("FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(buildRuleText({ ...f, monthDay: 30, monthEnd: "last" })).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1",
    );
  });
  it("29.02. jährlich: letzter Februartag", () => {
    const f = {
      ...defaultForm(Temporal.PlainDate.from("2028-02-29")),
      freq: "yearly" as const,
      monthEnd: "last" as const,
    };
    expect(buildRuleText(f)).toBe("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
  });
  it("erweiterte Eingabe validiert", () => {
    const f = {
      ...defaultForm(today),
      mode: "advanced" as const,
      advanced: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30",
    };
    expect(previewForm(f, today, false).ok).toBe(false);
    const g = { ...f, advanced: "FREQ=DAILY;COUNT=2;UNTIL=20261231" };
    expect(previewForm(g, today, false).message).toMatch(/COUNT und UNTIL/);
  });
  it("ab Erledigung monatlich: Vorschau ab dem 31. klemmt ans Monatsende", () => {
    const f = {
      ...defaultForm(Temporal.PlainDate.from("2026-10-31")),
      anchor: "completion" as const,
      freq: "monthly" as const,
    };
    const p = previewForm(f, Temporal.PlainDate.from("2026-10-31"), false);
    expect(p.ok).toBe(true);
    expect(p.dates.slice(0, 4).map(String)).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-30",
      "2027-01-30",
    ]);
    const c = previewForm(
      { ...f, end: "count", count: 2 },
      Temporal.PlainDate.from("2026-10-31"),
      false,
    );
    expect(c.dates.map(String)).toEqual(["2026-10-31", "2026-11-30"]);
    expect(c.exhausted).toBe(true);
  });

  it("Completion", () => {
    const f = {
      ...defaultForm(today),
      anchor: "completion" as const,
      interval: 14,
      freq: "daily" as const,
    };
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
  const t = readTaskFile({
    ref: "/x/Serie.md",
    name: "Serie.md",
    text,
    hash: hashText(text),
    mtime: null,
  });
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
  const r = queryOccurrences({
    rule: p.rule,
    start,
    from: start,
    time: t ? Temporal.PlainTime.from(t) : null,
    limit: 60,
  });
  return [...r.dates.map(String), r.exhausted ? "erschöpft" : "offen"];
}

function roundtrip(spec: SeriesSpec): { form: RuleForm; spec: SeriesSpec } {
  const form = formFromSeries(seriesOf(spec), today);
  return { form, spec: specFromForm(form) };
}

describe("Regelformular: Öffnen und unverändertes Speichern (R8)", () => {
  it("Fall aus dem Review: letzter Februartag ab 29.02.2028 bleibt erhalten", () => {
    const spec: SeriesSpec = {
      rule: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1",
      anchor: "calendar",
      field: "due",
      start: "2028-02-29",
      offsetDays: null,
    };
    const r = roundtrip(spec);
    expect(r.form.mode).toBe("simple");
    expect(r.form.freq).toBe("yearly");
    expect(r.form.monthEnd).toBe("last");
    expect(r.spec.rule).toBe("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
    expect(occurrences(r.spec).slice(0, 3)).toEqual(["2028-02-29", "2029-02-28", "2030-02-28"]);
  });

  it.each(producibleForms())(
    "$name: Regel → Formular → Regel ist identisch und einfach",
    ({ form }) => {
      const spec = specFromForm(form);
      const r = roundtrip(spec);
      expect(r.form.mode).toBe("simple");
      expect(r.spec).toEqual(spec);
      expect(occurrences(r.spec)).toEqual(occurrences(spec));
    },
  );

  // Regeln von außen: entweder im einfachen Modus ohne fachliche Änderung oder unverändert im erweiterten Modus.
  const cal = (
    rule: string,
    start: string,
    anchor: "calendar" | "completion" = "calendar",
  ): SeriesSpec => ({ rule, anchor, field: "due", start, offsetDays: null });
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
    {
      spec: cal("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "2028-02-29", "completion"),
      mode: "advanced",
    },
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
