// Abhak-Ablauf: Haken halten, ausblenden, bei Fehler zurückspringen (PLAN1 7.6).
import { describe, expect, it, vi } from "vitest";
import type { TaskView } from "@markdoist/core";
import { createCompletionFlow, type Outcome } from "../src";

const view = (ref: string, status = "open") =>
  ({ task: { ref, fields: { status } } }) as unknown as TaskView;
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(outcome: Outcome = { status: "ok", undoable: true }) {
  const present = new Set<string>();
  const notify = vi.fn();
  const perform = vi.fn(async () => outcome);
  const flow = createCompletionFlow({
    perform,
    notify,
    isPresent: (r) => present.has(r),
    holdMs: () => 0,
    // Sicherungs-Zeitgeber nie auslösen: Die Tests melden das Ende selbst.
    wait: (ms) => (ms > 0 ? new Promise(() => {}) : Promise.resolve()),
  });
  return { flow, present, notify, perform };
}

describe("createCompletionFlow", () => {
  it("zeigt den Haken sofort, blendet nach dem Schreiben aus und gibt die Liste danach frei", async () => {
    const { flow, notify } = setup();
    flow.start(view("A.md"));
    expect(flow.getState().pending.get("A.md")).toBe("checked");
    expect(flow.getState().frozen).toBe(true);
    await flush();
    expect(flow.getState().pending.get("A.md")).toBe("leaving");
    expect(notify).toHaveBeenCalledWith({ status: "ok", undoable: true }, "Erledigt");
    flow.left("A.md");
    expect(flow.getState()).toEqual({ pending: new Map(), frozen: false });
  });

  it("setzt den Haken zurück, wenn die Aufgabe in der Liste bleibt (Serie)", async () => {
    const { flow, present } = setup();
    present.add("S.md");
    flow.start(view("S.md"));
    await flush();
    expect(flow.getState().frozen).toBe(false);
  });

  it("lässt die Zeile bei einem Fehler stehen und meldet ihn", async () => {
    const { flow, notify } = setup({ status: "error", message: "Schreibschutz" });
    flow.start(view("A.md"));
    await flush();
    expect(flow.getState().pending.size).toBe(0);
    expect(notify).toHaveBeenCalledWith({ status: "error", message: "Schreibschutz" }, "Erledigt");
  });

  it("ignoriert einen zweiten Tipp, solange die Zeile im Ablauf ist", async () => {
    const { flow, perform } = setup();
    expect(flow.start(view("A.md"))).toBe(true);
    expect(flow.start(view("A.md"))).toBe(false);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it("hält die Liste eingefroren, bis die letzte Zeile ausgeblendet ist", async () => {
    const { flow } = setup();
    flow.start(view("A.md"));
    flow.start(view("B.md"));
    await flush();
    flow.left("A.md");
    expect(flow.getState().frozen).toBe(true);
    flow.left("B.md");
    expect(flow.getState().frozen).toBe(false);
  });

  it("gesperrte Serie: kein Schreiben, Grund wird gemeldet, Haken bleibt zurück", async () => {
    const { flow, notify, perform } = setup();
    const blocked = {
      task: { ref: "C.md", fields: { status: "open" } },
      series: {
        phase: "clarify",
        instance: null,
        revisionKey: "R",
        diagnostics: [
          {
            code: "series-needs-clarification",
            message: "Fortschreibung klären: Vorkommen 2026-10-12 ist bereits aufgelöst",
            severity: "warning",
          },
        ],
      },
    } as unknown as TaskView;
    expect(flow.start(blocked)).toBe(false);
    expect(perform).not.toHaveBeenCalled();
    expect(flow.getState().pending.size).toBe(0);
    expect(notify).toHaveBeenCalledWith(
      {
        status: "blocked",
        message: "Fortschreibung klären: Vorkommen 2026-10-12 ist bereits aufgelöst",
      },
      "Erledigt",
    );
    // beendete Serie wird dagegen normal wiederöffnet
    const ended = {
      task: { ref: "E.md", fields: { status: "done" } },
      series: { phase: "ended", revisionKey: "R", diagnostics: [] },
    } as unknown as TaskView;
    expect(flow.start(ended)).toBe(true);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it("wiederöffnet erledigte Aufgaben auf demselben Weg", async () => {
    const { flow, notify } = setup();
    flow.start(view("D.md", "done"));
    await flush();
    expect(notify).toHaveBeenCalledWith(expect.anything(), "Wiederöffnet");
  });
});
