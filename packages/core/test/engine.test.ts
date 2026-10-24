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

describe("BYSETPOS-Grenzfälle (Review 23.10.2026, R1/R2)", () => {
  it("überlappende Positionen liefern jeden Termin einmal und verbrauchen COUNT nicht doppelt", () => {
    const r = queryOccurrences({ rule: rule("FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=1,-1;COUNT=2"), start: D("2026-10-05"), limit: 5 });
    expect(r.dates.map(String)).toEqual(["2026-10-05", "2026-11-02"]);
    expect(r.exhausted).toBe(true);
  });
  it("negative Position jenseits der Kandidatenliste erzeugt keinen Termin", () => {
    const r = queryOccurrences({ rule: rule("FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=-2;UNTIL=20261231"), start: D("2026-10-01"), limit: 5 });
    expect(r.dates).toEqual([]);
    expect(r.exhausted).toBe(true);
  });
  it("Schalttag am Montag liegt im Tageshorizont (R5)", () => {
    const n = nextOccurrence({ rule: rule("FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO"), start: D("2016-02-29"), after: D("2016-02-29") });
    expect(n).toEqual({ kind: "found", date: D("2044-02-29") });
  });
});

describe("INTERVAL und COUNT als sichere Ganzzahlen (R6)", () => {
  it.each(["INTERVAL", "COUNT"])("%s mit 400 Ziffern ist ungültig", (key) => {
    expect(parseRule(`FREQ=DAILY;${key}=${"9".repeat(400)}`).status).toBe("invalid");
  });
  it("Obergrenzen gelten, Werte darunter bleiben gültig", () => {
    expect(parseRule("FREQ=DAILY;INTERVAL=1000").status).toBe("ok");
    expect(parseRule("FREQ=DAILY;INTERVAL=1001").status).toBe("invalid");
    expect(parseRule("FREQ=DAILY;COUNT=10000").status).toBe("ok");
    expect(parseRule("FREQ=DAILY;COUNT=10001").status).toBe("invalid");
  });
});

describe("Zweistufige Suche bis zum Kalenderzyklus (Nachprüfung 24.10.2026, N1)", () => {
  it("Schalttag am Montag: 2072 → 2112 über das Nicht-Schaltjahr 2100", () => {
    const n = nextOccurrence({ rule: rule("FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO"), start: D("2016-02-29"), after: D("2072-02-29") });
    expect(n).toEqual({ kind: "found", date: D("2112-02-29") });
  });
  it("großes INTERVAL erreicht seinen Folgetermin", () => {
    const n = nextOccurrence({ rule: rule("FREQ=YEARLY;INTERVAL=500"), start: D("2026-10-24"), after: D("2026-10-24") });
    expect(n).toEqual({ kind: "found", date: D("2526-10-24") });
  });
  it("Tagesregel ohne jeden Treffer: voller Zyklus begrenzt, Abbruch statt Serienende", () => {
    const t0 = Date.now();
    const r = queryOccurrences({ rule: { ...rule("FREQ=DAILY"), bymonth: [2], bymonthday: [31] }, start: D("2026-10-24"), limit: 1 });
    expect(r).toMatchObject({ dates: [], exhausted: false, aborted: true });
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe("Zeitbudget (Abschnitt 6)", () => {
  it("beendet eine Suche ohne Treffer auch ohne Rückruf von rrule, als Abbruch", () => {
    let calls = 0;
    const r = queryOccurrences({
      rule: { ...rule("FREQ=DAILY"), bymonth: [2], bymonthday: [31] },
      start: D("2026-10-24"),
      limit: 1,
      deadline: { now: () => ++calls, until: 3 },
    });
    expect(r).toMatchObject({ dates: [], exhausted: false, aborted: true });
    // Der Haken fragt die Uhr alle 1024 Zeiträume: nach wenigen Abfragen ist Schluss.
    expect(calls).toBeLessThan(10);
    expect((globalThis as { __markdoistRruleStop?: unknown }).__markdoistRruleStop).toBeUndefined();
  });
});
