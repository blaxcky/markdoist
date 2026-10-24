// Unabhängige Completion-Aktionen mit BY-Teilen aus der Nachprüfung vom 24.10.2026: 770 Fälle,
// Erwartungswerte aus python-dateutil 2.9.0.post0 (Seed 20261024, Generator in tools/).
// Unmögliche Regeln ohne UNTIL müssen gesperrt werden, nicht als Serienende gelten.
import { describe, expect, it } from "vitest";
import { planAction } from "../src";
import { ctxAt, fm, task } from "./helpers";
import fixtures from "./fixtures/completion-by-reference.json";

interface Fixture {
  rule: string;
  k: string;
  actionDay: string;
  time: string;
  action: "complete" | "skip";
  C: string[];
  S: string[];
  next: string | null;
  impossible: boolean;
}

describe("Completion mit BY-Teilen gegen dateutil (Nachprüfung 24.10.2026)", () => {
  it.each(fixtures as Fixture[])("$rule am $actionDay ($action), K=$k", (f) => {
    const text = fm([
      "title: BY audit",
      "status: open",
      `due: ${f.k}T${f.time}`,
      `recurrence: ${f.rule}`,
      "recurrence_revision: BY",
      `recurrence_start: ${f.k}T${f.time}`,
      `recurrence_instance: ${f.k}`,
      "recurrence_anchor: completion",
      "recurrence_field: due",
      `complete_instances: ${JSON.stringify(f.C)}`,
      `skipped_instances: ${JSON.stringify(f.S)}`,
    ]);
    const p = planAction(
      task(text),
      {
        type: f.action === "complete" ? "completeOccurrence" : "skipOccurrence",
        revision: "BY",
        instance: f.k,
      },
      ctxAt(`${f.actionDay}T18:00`, "Europe/Vienna"),
    );
    if (f.impossible) {
      expect(p.kind).toBe("blocked");
      return;
    }
    expect(p.kind).toBe("edit");
    if (p.kind !== "edit") return;
    if (f.next === null) expect(p.set.status).toBe("done");
    else {
      expect(p.set.recurrence_instance).toBe(f.next);
      expect(p.set.status).not.toBe("done");
    }
  });
});
