import { describe, expect, it } from "vitest";
import { Temporal } from "@markdoist/core";
import { buildRuleText, defaultForm, needsMonthEndChoice, previewForm } from "../src";

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
