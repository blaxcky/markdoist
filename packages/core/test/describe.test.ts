import { describe, expect, it } from "vitest";
import { describeRule, parseRule } from "../src";

const d = (s: string, a: "calendar" | "completion" = "calendar") => {
  const p = parseRule(s);
  if (p.status !== "ok") throw new Error(p.message);
  return describeRule(p.rule, a);
};

describe("Deutsche Regelbeschreibung", () => {
  it.each([
    ["FREQ=DAILY", "täglich"],
    ["FREQ=DAILY;INTERVAL=3", "alle 3 Tage"],
    ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "werktags (Mo–Fr)"],
    ["FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,MO", "alle 2 Wochen am Mo, Di"],
    ["FREQ=MONTHLY;BYDAY=2TU", "jeden 2. Dienstag im Monat"],
    ["FREQ=MONTHLY;BYDAY=-1FR", "jeden letzten Freitag im Monat"],
    ["FREQ=MONTHLY;BYMONTHDAY=-1", "monatlich am letzten Tag"],
    ["FREQ=MONTHLY;BYMONTHDAY=15;COUNT=5", "monatlich am 15., 5-mal"],
    ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "jährlich am letzten Tag im Februar"],
    ["FREQ=WEEKLY;BYDAY=FR;UNTIL=20261231", "wöchentlich am Fr, bis 31.12.2026"],
  ])("%s", (rule, text) => {
    expect(d(rule)).toBe(text);
  });
  it("Completion", () => {
    expect(d("FREQ=WEEKLY;INTERVAL=2", "completion")).toBe("2 Wochen nach Erledigung");
  });
  it("Komplexe Regel ohne Beschreibung", () => {
    expect(d("FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO")).toBeNull();
  });
});
