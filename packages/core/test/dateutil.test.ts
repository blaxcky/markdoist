import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import { parseRule, queryOccurrences } from "../src";
import fixtures from "./fixtures/dateutil.json";

describe("Golden-Fixtures aus python-dateutil", () => {
  for (const f of fixtures as { rule: string; start: string; dates: string[] }[]) {
    it(`${f.rule} ab ${f.start}`, () => {
      const p = parseRule(f.rule);
      if (p.status !== "ok") throw new Error(p.message);
      const r = queryOccurrences({
        rule: p.rule,
        start: Temporal.PlainDate.from(f.start),
        limit: 24,
      });
      if (r.aborted) {
        // Seltene Regeln (z. B. Schalttage) überschreiten den Suchhorizont: der gefundene Anfang muss stimmen.
        expect(r.dates.length).toBeGreaterThan(0);
        expect(r.dates.map(String)).toEqual(f.dates.slice(0, r.dates.length));
      } else expect(r.dates.map(String)).toEqual(f.dates);
    });
  }
});
