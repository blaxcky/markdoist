import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import { nextOccurrence, parseRule, queryOccurrences } from "../src";
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
      if (!r.aborted) {
        expect(r.dates.map(String)).toEqual(f.dates);
        return;
      }
      // Eine einzelne Suche nach 24 seltenen Terminen darf den Horizont überschreiten. Ein Abbruch
      // zählt aber nur als bestanden, wenn jeder Folgetermin so gefunden wird, wie das Fortschreiben
      // ihn sucht: einzeln nach dem vorigen (Review 23.10.2026, Abschnitt „Warum die Tests grün bleiben“).
      expect(r.dates.map(String)).toEqual(f.dates.slice(0, r.dates.length));
      const start = Temporal.PlainDate.from(f.start);
      let prev: Temporal.PlainDate | null = null;
      for (const want of f.dates) {
        const n = nextOccurrence({ rule: p.rule, start, ...(prev ? { after: prev } : { from: start }) });
        expect(n, `nach ${prev ?? "Start"}`).toEqual({ kind: "found", date: Temporal.PlainDate.from(want) });
        prev = Temporal.PlainDate.from(want);
      }
    });
  }
});
