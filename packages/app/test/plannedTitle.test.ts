import { describe, expect, it } from "vitest";
import { Temporal, type PlannedGroup } from "@markdoist/core";
import { plannedGroupTitle } from "../src";

const today = Temporal.PlainDate.from("2026-10-12");
const g = (kind: PlannedGroup["kind"], date: string): PlannedGroup => ({ kind, date: Temporal.PlainDate.from(date), items: [] });

describe("Überschriften in Geplant (4.2a)", () => {
  it("Früher, Heute, Morgen, sonst Wochentag und Datum", () => {
    expect(plannedGroupTitle(g("earlier", "2026-10-01"), today)).toBe("Früher");
    expect(plannedGroupTitle(g("day", "2026-10-12"), today)).toBe("Heute");
    expect(plannedGroupTitle(g("day", "2026-10-13"), today)).toBe("Morgen");
    expect(plannedGroupTitle(g("day", "2026-10-15"), today)).toBe("Do 15.10.");
    expect(plannedGroupTitle(g("day", "2027-01-04"), today)).toBe("Mo 4.1.2027");
  });
});
