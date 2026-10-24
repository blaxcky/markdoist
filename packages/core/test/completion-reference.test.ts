// Unabhängiges Kalendermodell für Completion-Aktionen aus dem Review vom 23.10.2026:
// 1.200 Fälle (Tage/Wochen/Monate/Jahre, Intervalle, Monatsenden, Schaltjahre, frühes und
// verspätetes Erledigen, Überspringen, Kollisionen mit C/S, COUNT/UNTIL, vier Zeitzonen).
// Erwartungswerte stammen aus eigener Python-Arithmetik (tools/generate-review-fixtures.py).
import { describe, expect, it } from "vitest";
import { applyPlan, planAction, readSeries } from "../src";
import { ctxAt, fm, task } from "./helpers";
import fixtures from "./fixtures/completion-reference.json";

interface Fixture {
  rule: string;
  k: string;
  actionDay: string;
  action: "complete" | "skip";
  C: string[];
  S: string[];
  next: string | null;
}

const ZONES = ["Europe/Vienna", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"];

describe("Completion-Referenz (Review 23.10.2026)", () => {
  it.each(fixtures as Fixture[])("$action $rule K=$k am $actionDay", (f) => {
    const text = fm([
      "title: Audit",
      "status: open",
      `due: ${f.k}T09:30`,
      `recurrence: ${f.rule}`,
      "recurrence_revision: R1",
      `recurrence_start: ${f.k}T09:30`,
      `recurrence_instance: ${f.k}`,
      "recurrence_anchor: completion",
      "recurrence_field: due",
      `complete_instances: [${f.C.join(", ")}]`,
      `skipped_instances: [${f.S.join(", ")}]`,
    ]);
    const tz = ZONES[Number(f.k.slice(-2)) % 4]!;
    const plan = planAction(
      task(text),
      {
        type: f.action === "complete" ? "completeOccurrence" : "skipOccurrence",
        revision: "R1",
        instance: f.k,
      },
      ctxAt(`${f.actionDay}T00:30`, tz),
    );
    expect(plan.kind).toBe("edit");
    if (plan.kind !== "edit") return;
    const written = applyPlan(text, plan);
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    const result = readSeries(task(written.text))!;
    if (f.next === null) expect(result.phase).toBe("ended");
    else {
      expect(result.phase).toBe("active");
      expect(result.instance?.toString()).toBe(f.next);
      expect(task(written.text).data.due).toBe(`${f.next}T09:30`);
    }
  });
});
