// Regressionssperren aus docs/REVIEW-WIEDERHOLUNGEN-2026-10-23.md (R1–R7).
// Die Fälle stammen aus dem externen Review; jeder war am Stand ae4e9df rot.
import { describe, expect, it } from "vitest";
import {
  applyPlan,
  parseRule,
  planAction,
  queryOccurrences,
  readSeries,
  Temporal,
} from "@markdoist/core";
import { ctxAt, fm, run, task } from "../../core/test/helpers";
import { defaultForm, previewForm, ruleFormAction } from "../src";

const d = (s: string) => Temporal.PlainDate.from(s);
const base = fm(["title: Audit", "status: open", "due: 2026-10-12"]);
const series = (rule: string, start = "2026-10-12", anchor = "calendar") =>
  fm([
    "title: Audit",
    "status: open",
    `due: ${start}`,
    `recurrence: ${rule}`,
    "recurrence_revision: R1",
    `recurrence_start: ${start}`,
    `recurrence_instance: ${start.slice(0, 10)}`,
    `recurrence_anchor: ${anchor}`,
    "recurrence_field: due",
  ]);

describe("Review 23.10.2026 – R1/R2 BYSETPOS", () => {
  it("überlappendes BYSETPOS liefert jeden Termin einmal, bevor COUNT zählt", () => {
    const p = parseRule("FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=1,-1;COUNT=2");
    if (p.status !== "ok") throw new Error(p.message);
    expect(
      queryOccurrences({ rule: p.rule, start: d("2026-10-05"), limit: 5 }).dates.map(String),
    ).toEqual(["2026-10-05", "2026-11-02"]);
  });

  it("COUNT=2 endet bei überlappendem BYSETPOS nicht nach dem ersten eindeutigen Termin", () => {
    const text = series("FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=1,-1;COUNT=2", "2026-10-05");
    const p = planAction(
      task(text),
      { type: "completeOccurrence", revision: "R1", instance: "2026-10-05" },
      ctxAt("2026-10-05T12:00"),
    );
    expect(p).toMatchObject({ kind: "edit", set: { recurrence_instance: "2026-11-02" } });
    if (p.kind === "edit") expect(p.set.status).not.toBe("done");
  });

  it("BYSETPOS=-2 wählt nicht den einzigen Monatskandidaten", () => {
    const p = parseRule("FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=-2;UNTIL=20261231");
    if (p.status !== "ok") throw new Error(p.message);
    expect(
      queryOccurrences({ rule: p.rule, start: d("2026-10-01"), limit: 5 }).dates.map(String),
    ).toEqual([]);
  });
});

describe("Review 23.10.2026 – R3 Completion-Vorschau", () => {
  it("Completion mit BYDAY: Vorschau und gespeicherter erster Termin stimmen überein", () => {
    const f = {
      ...defaultForm(d("2026-10-13")),
      mode: "advanced" as const,
      anchor: "completion" as const,
      advanced: "FREQ=WEEKLY;BYDAY=MO",
    };
    const preview = previewForm(f, d(f.startDate), false);
    const p = planAction(task(base), ruleFormAction(f, null), ctxAt("2026-10-13T12:00"));
    expect(p.kind).toBe("edit");
    if (p.kind !== "edit") return;
    expect(preview.dates[0]?.toString()).toBe(p.set.recurrence_instance);
    expect(p.set.recurrence_instance).toBe("2026-10-19");
  });

  it("Completion-Vorschau lehnt einen Start nach UNTIL ab", () => {
    const f = {
      ...defaultForm(d("2026-10-13")),
      anchor: "completion" as const,
      freq: "daily" as const,
      end: "until" as const,
      until: "2026-10-12",
    };
    const preview = previewForm(f, d(f.startDate), false);
    const p = planAction(task(base), ruleFormAction(f, null), ctxAt("2026-10-13T12:00"));
    expect(p.kind).toBe("blocked");
    expect(preview.ok).toBe(false);
  });

  it.each(["calendar", "completion"] as const)(
    "%s-Vorschau beachtet die UNTIL-Uhrzeit",
    (anchor) => {
      const f = {
        ...defaultForm(d("2026-10-12")),
        anchor,
        mode: "advanced" as const,
        startTime: "09:00",
        advanced: "FREQ=DAILY;UNTIL=20261013T080000",
      };
      const preview = previewForm(f, d(f.startDate), false);
      expect(preview.dates.map(String)).toEqual(["2026-10-12"]);
    },
  );
});

describe("Review 23.10.2026 – R4/R7 Serienaktionen", () => {
  it("veraltetes endSeries ohne Erledigung beendet nicht das Folgevorkommen", () => {
    const text = series("FREQ=WEEKLY;BYDAY=MO");
    const ctx = ctxAt("2026-10-12T12:00");
    const advanced = run(
      text,
      { type: "completeOccurrence", revision: "R1", instance: "2026-10-12" },
      ctx,
    );
    expect(task(advanced.text).data.recurrence_instance).toBe("2026-10-19");
    const stale = planAction(
      task(advanced.text),
      { type: "endSeries", revision: "R1", instance: "2026-10-12", completeCurrent: false },
      ctx,
    );
    expect(stale.kind).toBe("blocked");
  });

  it("Bezugsfeld ändern hält Start und Revision einer Fremdserie fest", () => {
    const text = fm([
      "title: Audit",
      "status: open",
      "due: 2026-10-12",
      "scheduled: 2026-10-11",
      "recurrence: FREQ=WEEKLY;BYDAY=MO;COUNT=3",
    ]);
    const s = readSeries(task(text))!;
    const r = run(
      text,
      { type: "changeReference", revision: s.revisionKey, field: "scheduled", offsetDays: 1 },
      ctxAt("2026-10-12T12:00"),
    );
    expect(r.plan.kind).toBe("edit");
    const result = task(r.text);
    expect(result.data.recurrence_start).toBe("2026-10-12");
    expect(typeof result.data.recurrence_revision).toBe("string");
  });
});

describe("Review 23.10.2026 – R5/R6 Grenzen", () => {
  it("seltene gültige Tagesregel (Schalttag am Montag) findet den nächsten echten Termin", () => {
    // Unabhängige Kalendertatsache: 29.02.2016 und 29.02.2044 sind aufeinanderfolgende Schalttage am Montag.
    const text = series("FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO", "2016-02-29");
    const p = planAction(
      task(text),
      { type: "completeOccurrence", revision: "R1", instance: "2016-02-29" },
      ctxAt("2016-02-29T12:00"),
    );
    expect(p).toMatchObject({ kind: "edit", set: { recurrence_instance: "2044-02-29" } });
  });

  it.each(["INTERVAL", "COUNT"])("%s lehnt nicht darstellbare Ganzzahlen ab", (key) => {
    expect(parseRule(`FREQ=DAILY;${key}=${"9".repeat(400)}`).status).toBe("invalid");
  });

  it("nicht darstellbare Termine werden nicht als aktives Vorkommen geschrieben", () => {
    const text = series("FREQ=YEARLY", "9999-12-31", "completion");
    const p = planAction(
      task(text),
      { type: "completeOccurrence", revision: "R1", instance: "9999-12-31" },
      ctxAt("9999-12-31T12:00"),
    );
    if (p.kind === "edit") {
      const applied = applyPlan(text, p);
      expect(applied.ok).toBe(true);
      if (applied.ok) expect(readSeries(task(applied.text))?.phase).toBe("active");
    } else expect(p.kind).toBe("blocked");
  });
});
