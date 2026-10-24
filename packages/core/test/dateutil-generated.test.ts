// Unabhängige Gegenprobe aus dem Review vom 23.10.2026: 1.357 zufällig erzeugte Regeln,
// Erwartungswerte aus python-dateutil 2.9.0.post0 (Seed 20261023, Generator in tools/).
// Im Gegensatz zum Orakel in seriesOracle.ts verwendet diese Prüfung keine App-Berechnung.
import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import { parseRule, queryOccurrences } from "../src";
import fixtures from "./fixtures/dateutil-generated.json";

interface Fixture {
  rule: string;
  start: string;
  time: string;
  dates: string[];
  through: string;
}

describe("Generierte dateutil-Vergleiche (Review 23.10.2026)", () => {
  it.each(fixtures as Fixture[])("$rule ab $start", (f) => {
    const parsed = parseRule(f.rule);
    if (parsed.status !== "ok") {
      // Die App lehnt syntaktisch gültige, aber unmögliche Monat/Tag-Paare ab.
      expect(f.dates).toEqual([]);
      return;
    }
    const actual = queryOccurrences({
      rule: parsed.rule,
      start: Temporal.PlainDate.from(f.start),
      time: Temporal.PlainTime.from(f.time),
      limit: 16,
    });
    const bounded = actual.dates.map(String).filter((s) => s <= f.through);
    expect(bounded).toEqual(f.dates);
  });
});
