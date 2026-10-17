import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import { parseRule, type Rule } from "../src/recurrence/rule";
import { queryOccurrences, nextOccurrence } from "../src/recurrence/engine";

const D = (s: string) => Temporal.PlainDate.from(s);
function rule(s: string): Rule {
  const p = parseRule(s);
  if (p.status !== "ok") throw new Error(p.message);
  return p.rule;
}
function list(r: string, start: string, n: number) {
  return queryOccurrences({ rule: rule(r), start: D(start), limit: n }).dates.map(String);
}

describe("parseRule", () => {
  it("akzeptiert Positivliste und Präfixe", () => {
    expect(parseRule("RRULE:FREQ=WEEKLY;BYDAY=MO").status).toBe("ok");
    const t = parseRule("DTSTART:20250101T090000Z;FREQ=DAILY");
    expect(t.status).toBe("ok");
    expect(t.dtstart?.date.toString()).toBe("2025-01-01");
  });
  it.each([
    ["FREQ=HOURLY", "unsupported"],
    ["FREQ=DAILY;BYHOUR=8,20", "unsupported"],
    ["FREQ=YEARLY;RSCALE=GREGORIAN;SKIP=FORWARD", "unsupported"],
    ["FREQ=WEEKLY;BYDAI=MO", "invalid"],
    ["FREQ=WEEKLY;COUNT=3;UNTIL=20261231", "invalid"],
    ["FREQ=WEEKLY;INTERVAL=0", "invalid"],
    ["FREQ=WEEKLY;BYDAY=1MO", "invalid"],
    ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", "invalid"],
    ["FREQ=WEEKLY;BYDAY=MO;BYDAY=TU", "invalid"],
    ["FREQ=MONTHLY;BYSETPOS=-1", "invalid"],
    ["BYDAY=MO", "invalid"],
  ])("%s → %s", (r, status) => {
    expect(parseRule(r).status).toBe(status);
  });
});

describe("Monatsenden und Schaltjahre (AK-17)", () => {
  it("BYMONTHDAY=31 lässt November aus", () => {
    expect(list("FREQ=MONTHLY;BYMONTHDAY=31", "2026-10-31", 3)).toEqual([
      "2026-10-31",
      "2026-12-31",
      "2027-01-31",
    ]);
  });
  it("BYMONTHDAY=-1", () => {
    const r = list("FREQ=MONTHLY;BYMONTHDAY=-1", "2026-11-30", 16);
    expect(r).toContain("2026-11-30");
    expect(r).toContain("2027-02-28");
    expect(r).toContain("2028-02-29");
  });
  it("BYMONTHDAY=28,29,30;BYSETPOS=-1", () => {
    expect(list("FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1", "2027-01-30", 3)).toEqual([
      "2027-01-30",
      "2027-02-28",
      "2027-03-30",
    ]);
  });
  it("BYMONTH=2;BYMONTHDAY=29 nur Schaltjahre", () => {
    expect(list("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", "2028-02-29", 2)).toEqual([
      "2028-02-29",
      "2032-02-29",
    ]);
  });
  it("letzter Freitag", () => {
    expect(list("FREQ=MONTHLY;BYDAY=-1FR", "2026-10-30", 3)).toEqual([
      "2026-10-30",
      "2026-11-27",
      "2026-12-25",
    ]);
  });
});

describe("Grenzen", () => {
  it("COUNT zählt ab Start einschließlich", () => {
    const r = queryOccurrences({ rule: rule("FREQ=WEEKLY;BYDAY=MO;COUNT=5"), start: D("2026-10-12"), limit: 10 });
    expect(r.dates.map(String)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(r.exhausted).toBe(true);
  });
  it("UNTIL ist inklusiv", () => {
    const r = queryOccurrences({ rule: rule("FREQ=DAILY;UNTIL=20261014"), start: D("2026-10-12"), limit: 10 });
    expect(r.dates.map(String)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(r.exhausted).toBe(true);
  });
  it("Kalender: nächstes nach max(K, Aktionstag)", () => {
    const n = nextOccurrence({ rule: rule("FREQ=WEEKLY;BYDAY=MO"), start: D("2026-10-05"), after: D("2026-10-08") });
    expect(n).toEqual({ kind: "found", date: D("2026-10-12") });
  });
  it("unmögliche Tagesregel endet begrenzt und nicht als Serienende", () => {
    const t0 = Date.now();
    const r = queryOccurrences({
      rule: { ...rule("FREQ=DAILY"), bymonth: [2], bymonthday: [31] },
      start: D("2026-01-01"),
      limit: 1,
    });
    expect(r.dates).toEqual([]);
    expect(r.exhausted).toBe(false);
    expect(r.aborted).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
