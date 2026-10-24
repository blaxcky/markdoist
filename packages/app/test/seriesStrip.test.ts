// Vorkommen-Streifen und Verlaufsraster (Detail auf beiden Plattformen).
import { describe, expect, it } from "vitest";
import { readSeries } from "@markdoist/core";
import { task } from "../../core/test/helpers";
import { pastSkippedCount, seriesHistory, seriesStrip, skippedBeyondStrip, stripByMonth } from "../src";

const weekly = (extra: string[]) =>
  readSeries(
    task(
      [
        "---",
        "id: 01K69X4D2M7Q0B5T8V3W6Y1Z4C",
        "title: Wochenrückblick",
        "status: open",
        "due: 2026-10-12",
        "recurrence: FREQ=WEEKLY;BYDAY=MO",
        "recurrence_revision: 01K69X4D2M7Q0B5T8V3W6Y1Z4D",
        "recurrence_start: 2026-09-07",
        "recurrence_anchor: calendar",
        "recurrence_field: due",
        "recurrence_instance: 2026-10-12",
        ...extra,
        "---",
        "",
      ].join("\n"),
    ),
  )!;

describe("seriesStrip", () => {
  it("zeigt Verlauf, aktuelles Vorkommen und drei nächste Termine, insgesamt höchstens sieben", () => {
    const s = weekly(["complete_instances: [2026-09-07, 2026-09-14, 2026-09-21, 2026-10-05]", "skipped_instances: [2026-09-28, 2026-10-19, 2027-03-01]"]);
    const cells = seriesStrip(s);
    expect(cells.map((c) => `${c.date}:${c.kind}`)).toEqual([
      "2026-09-21:done",
      "2026-09-28:skipped",
      "2026-10-05:done",
      "2026-10-12:current",
      "2026-10-19:future-skipped",
      "2026-10-26:future",
      "2026-11-02:future",
    ]);
    expect(stripByMonth(cells)).toBe(true); // alle montags
    expect(skippedBeyondStrip(s, cells)).toEqual(["2027-03-01"]);
    expect(pastSkippedCount(s)).toBe(1);
  });

  it("zeigt bei beendeter Serie keine künftigen Termine", () => {
    const ended = readSeries(
      task(["---", "title: x", "status: done", "recurrence: FREQ=DAILY", "recurrence_start: 2026-10-10", "recurrence_anchor: calendar", "recurrence_field: due", "recurrence_instance: 2026-10-12", "due: 2026-10-12", "complete_instances: [2026-10-11, 2026-10-12]", "---", ""].join("\n")),
    )!;
    expect(ended.phase).toBe("ended");
    expect(seriesStrip(ended).map((c) => `${c.date.day}:${c.kind}`)).toEqual(["11:done", "12:done"]);
  });
});

describe("seriesHistory", () => {
  it("liefert Monate vom aktuellen bis zum Startmonat und markiert die Tage", () => {
    const s = weekly(["complete_instances: [2026-09-07]", "skipped_instances: [2026-09-14]"]);
    const h = seriesHistory(s);
    expect(h.months.map((m) => `${m.year}-${m.month}`)).toEqual(["2026-10", "2026-9"]);
    const oct = h.months[0]!;
    expect(oct.cells.slice(0, 3)).toEqual([null, null, null]); // 1.10.2026 ist ein Donnerstag
    const day = (m: number, d: number) => h.mark(oct.cells.find((c) => c?.month === m && c.day === d) ?? h.months[1]!.cells.find((c) => c?.day === d)!);
    expect(day(9, 7)).toBe("done");
    expect(day(9, 14)).toBe("skipped");
    expect(day(10, 12)).toBe("current");
    expect(day(10, 19)).toBe("upcoming");
    expect(day(10, 13)).toBeNull();
  });
});
