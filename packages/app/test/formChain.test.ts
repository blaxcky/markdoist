// Kette Formular → Regeltext → Serie anlegen → Vorkommen erledigen für jede Formularvariante (Abschnitt 6).
import { describe, expect, it } from "vitest";
import { applyPlan, planAction, readSeries, Temporal } from "@markdoist/core";
import { ctxAt, fm, task } from "../../core/test/helpers";
import { checkAdvance } from "../../core/test/seriesOracle";
import { previewForm, ruleFormAction } from "../src";
import { producibleForms } from "./forms";

describe("Formular → Serie → Fortschreiben", () => {
  it.each(producibleForms())("$name", ({ form }) => {
    const today = Temporal.PlainDate.from(form.startDate);
    const preview = previewForm(form, today, false);
    expect(preview.ok, preview.message ?? "").toBe(true);
    const base = fm([
      "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
      "title: Formular",
      "status: open",
      "inbox: true",
      "due: 2026-10-01",
    ]);
    const ctx = ctxAt(`${today}T08:00`);
    const plan = planAction(task(base), ruleFormAction(form, null), ctx);
    if (plan.kind !== "edit") throw new Error(`Serie anlegen: ${plan.kind}`);
    const created = applyPlan(base, plan);
    if (!created.ok) throw new Error(created.message);
    const s = readSeries(task(created.text))!;
    expect(s.phase).toBe("active");
    // Erster Termin der Serie = erster Termin der Formularvorschau
    expect(s.instance?.toString()).toBe(preview.dates[0]!.toString());
    expect(task(created.text).data.inbox).toBe(true);
    const r = checkAdvance(created.text, "complete", ctxAt(`${s.instance}T18:00`), form.advanced);
    if (!r.ended) {
      // Kalender: zweiter Termin der Vorschau; ab Erledigung: Abstand ab dem Erledigungstag
      if (form.anchor === "calendar") expect(r.next).toBe(preview.dates[1]!.toString());
    } else expect(preview.exhausted && preview.dates.length === 1).toBe(true);
  });
});
