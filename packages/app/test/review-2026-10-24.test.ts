// Regressionssperren aus docs/REVIEW-WIEDERHOLUNGEN-2026-10-24.md (N1–N3).
// Die Fälle stammen aus der externen Nachprüfung; jeder war am Stand 0e9a049 rot.
import { describe, expect, it } from "vitest";
import {
  applyPlan,
  nextOccurrence,
  parseDateValue,
  parseRule,
  planAction,
  readSeries,
  Temporal,
} from "@markdoist/core";
import { ctxAt, fm, run, task } from "../../core/test/helpers";
import { defaultForm, previewForm, ruleFormAction } from "../src";

const d = (s: string) => Temporal.PlainDate.from(s);
const leap = "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO";
const series = (rule: string, start: string, anchor = "calendar", extra: string[] = []) =>
  fm([
    "title: Nachprüfung",
    "status: open",
    `due: ${start}`,
    `recurrence: ${rule}`,
    "recurrence_revision: R1",
    `recurrence_start: ${start}`,
    `recurrence_instance: ${start.slice(0, 10)}`,
    `recurrence_anchor: ${anchor}`,
    "recurrence_field: due",
    ...extra,
  ]);

describe("Nachprüfung 24.10.2026 – N1 Suchgrenze", () => {
  it.each(["calendar", "completion"] as const)(
    "%s: Schalttag am Montag springt über das Nicht-Schaltjahr 2100",
    (anchor) => {
      const form = {
        ...defaultForm(d("2044-02-29")),
        mode: "advanced" as const,
        advanced: leap,
        anchor,
      };
      expect(previewForm(form, d(form.startDate), false).ok).toBe(true);
      const made = run(
        fm(["title: Nachprüfung", "status: open"]),
        ruleFormAction(form, null),
        ctxAt("2044-02-29T12:00"),
      );
      expect(made.plan.kind).toBe("edit");
      const s = readSeries(task(made.text))!;
      const first = run(
        made.text,
        { type: "completeOccurrence", revision: s.revisionKey, instance: "2044-02-29" },
        ctxAt("2044-02-29T12:00"),
      );
      expect(task(first.text).data.recurrence_instance).toBe("2072-02-29");
      // Unabhängig mit Python datetime/dateutil geprüft: 2100 ist kein Schaltjahr,
      // der nächste Montag am 29.02. nach 2072 ist 2112 (40 Jahre Lücke).
      const second = planAction(
        task(first.text),
        { type: "completeOccurrence", revision: s.revisionKey, instance: "2072-02-29" },
        ctxAt("2072-02-29T12:00"),
      );
      expect(second).toMatchObject({ kind: "edit", set: { recurrence_instance: "2112-02-29" } });
    },
  );

  it("Regel innerhalb von MAX_INTERVAL findet ihren nächsten Jahrestermin", () => {
    const p = parseRule("FREQ=YEARLY;INTERVAL=500");
    if (p.status !== "ok") throw new Error(p.message);
    expect(
      nextOccurrence({ rule: p.rule, start: d("2026-10-24"), after: d("2026-10-24") }),
    ).toEqual({ kind: "found", date: d("2526-10-24") });
  });
});

describe("Nachprüfung 24.10.2026 – N2 Datumsgrenze", () => {
  it("abgeleitetes zweites Datumsfeld nach 9999 wird nicht geschrieben", () => {
    const text = series("FREQ=DAILY", "9999-12-30", "completion", [
      "scheduled: 9999-12-31",
      "recurrence_offset_days: 1",
    ]);
    const p = planAction(
      task(text),
      { type: "completeOccurrence", revision: "R1", instance: "9999-12-30" },
      ctxAt("9999-12-30T12:00"),
    );
    expect(p).toMatchObject({
      kind: "blocked",
      message: "Termin liegt außerhalb des unterstützten Datumsbereichs",
    });
  });

  it("ein im Bereich liegendes zweites Feld wird weiterhin lesbar geschrieben", () => {
    const text = series("FREQ=DAILY", "9999-12-29", "completion", [
      "scheduled: 9999-12-30",
      "recurrence_offset_days: 1",
    ]);
    const p = planAction(
      task(text),
      { type: "completeOccurrence", revision: "R1", instance: "9999-12-29" },
      ctxAt("9999-12-29T12:00"),
    );
    expect(p.kind).toBe("edit");
    if (p.kind !== "edit") return;
    expect(applyPlan(text, p).ok).toBe(true);
    expect(parseDateValue(p.set.scheduled)).not.toBeNull();
  });
});

describe("Nachprüfung 24.10.2026 – N3 Wiederöffnen einer Fremdserie", () => {
  const reopen = (lines: string[]) => {
    const text = fm(lines);
    const s = readSeries(task(text))!;
    const r = run(
      text,
      { type: "reopenSeries", revision: s.revisionKey },
      ctxAt("2026-10-24T12:00"),
    );
    expect(r.plan.kind).toBe("edit");
    return task(r.text).data;
  };
  const base = [
    "title: Fremdserie",
    "status: done",
    "due: 2026-10-24",
    "recurrence: FREQ=DAILY;COUNT=3",
  ];

  it("fehlen Start und Revision, werden beide festgehalten", () => {
    const data = reopen(base);
    expect(data.status).toBe("open");
    expect(data.recurrence_start).toBe("2026-10-24");
    expect(typeof data.recurrence_revision).toBe("string");
  });

  it("fehlt nur der Start, wird er ergänzt und die Revision bleibt", () => {
    const data = reopen([...base, "recurrence_revision: R9"]);
    expect(data.recurrence_start).toBe("2026-10-24");
    expect(data.recurrence_revision).toBe("R9");
  });

  it("fehlt nur die Revision, wird sie ergänzt und der Start bleibt", () => {
    const data = reopen([...base, "recurrence_start: 2026-10-23"]);
    expect(data.recurrence_start).toBe("2026-10-23");
    expect(typeof data.recurrence_revision).toBe("string");
  });
});
