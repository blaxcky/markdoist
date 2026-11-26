import { describe, expect, it } from "vitest";
import { Temporal, type DateValue } from "@markdoist/core";
import { dueLabel, scheduledText } from "../src/renderer/src/format";

const today = Temporal.PlainDate.from("2026-11-26"); // Donnerstag
const d = (iso: string): DateValue =>
  ({ kind: "date", date: Temporal.PlainDate.from(iso) }) as DateValue;
const tz = "Europe/Berlin";

describe("Datumsanzeige in der Zeile", () => {
  it("künftige Frist mit „bis“, Farbstufe bleibt", () => {
    expect(dueLabel(d("2026-11-27"), today, tz)).toEqual({ text: "bis morgen", tone: "tomorrow" });
    expect(dueLabel(d("2026-11-30"), today, tz)).toEqual({ text: "bis Montag", tone: "week" });
    expect(dueLabel(d("2026-12-03"), today, tz)).toEqual({ text: "bis 3. Dez", tone: "later" });
  });

  it("heute fällige und überfällige Frist ohne „bis“", () => {
    expect(dueLabel(d("2026-11-26"), today, tz)).toEqual({ text: "Heute", tone: "today" });
    expect(dueLabel(d("2026-11-25"), today, tz, true)).toEqual({
      text: "Gestern",
      tone: "overdue",
    });
  });

  it("Planungsdatum als „ab …“", () => {
    expect(scheduledText(d("2026-11-26"), today, tz)).toBe("ab heute");
    expect(scheduledText(d("2026-11-25"), today, tz)).toBe("ab gestern");
    expect(scheduledText(d("2026-11-20"), today, tz)).toBe("ab 20. Nov");
    expect(scheduledText(d("2026-11-27"), today, tz)).toBe("ab morgen");
  });
});
