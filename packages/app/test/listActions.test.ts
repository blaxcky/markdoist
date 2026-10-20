// Listenaktionen sind an das angezeigte Serienvorkommen gebunden (R6, Plan 5.2).
import { describe, expect, it } from "vitest";
import { clockAtLocal, type Clock } from "@markdoist/core";
import { MemoryAdapter, MemoryKeyValueStore, Repository, toggleDoneAction } from "../src";

const TZ = "Europe/Berlin";
const serie = [
  "---",
  "id: 01K7C9V3QH2T8M4N6P0R5S1W9X",
  "format_version: 1",
  "title: Serie",
  "status: open",
  "inbox: false",
  "due: 2026-10-19",
  "recurrence: FREQ=DAILY",
  "recurrence_revision: R1",
  "recurrence_start: 2026-10-19",
  "recurrence_instance: 2026-10-19",
  "---",
  "",
].join("\n");

function setup() {
  const adapter = new MemoryAdapter();
  adapter.tasks.set("S.md", { text: serie, mtime: 1 });
  adapter.tasks.set("E.md", { text: "---\nid: 01K7C9V3QH2T8M4N6P0R5S1W9Y\ntitle: Einfach\nstatus: open\n---\n", mtime: 1 });
  let seed = 0;
  const repo = new Repository({
    adapter,
    kv: new MemoryKeyValueStore(),
    folder: "test",
    clock: (): Clock => clockAtLocal("2026-10-19T10:00", TZ),
    random: (b) => {
      for (let i = 0; i < b.length; i++) b[i] = (seed++ * 13 + i) % 256;
    },
  });
  const view = (ref: string) => repo.getState().index.tasks.find((t) => t.task.ref === ref)!;
  return { repo, adapter, view };
}

describe("toggleDoneAction", () => {
  it("bindet Serien an Revision und angezeigtes Vorkommen, einfache Aufgaben nicht", async () => {
    const { repo, view } = setup();
    await repo.open();
    expect(toggleDoneAction(view("tasks/S.md")).action).toEqual({ type: "completeOccurrence", revision: "R1", instance: "2026-10-19" });
    expect(toggleDoneAction(view("tasks/E.md")).action).toEqual({ type: "complete" });
    await repo.perform("tasks/E.md", { type: "complete" });
    expect(toggleDoneAction(view("tasks/E.md")).action).toEqual({ type: "reopen" });
  });

  it("zweimal schnell erledigen trifft nicht das nächste Vorkommen (R6)", async () => {
    const { repo, adapter, view } = setup();
    await repo.open();
    const v = view("tasks/S.md");
    const a = toggleDoneAction(v);
    const b = toggleDoneAction(v); // zweite Eingabe, bevor die erste geschrieben ist
    const [r1, r2] = await Promise.all([repo.perform(v.task.ref, a.action, a.label), repo.perform(v.task.ref, b.action, b.label)]);
    expect(r1.status).toBe("ok");
    expect(r2.status).toBe("noop");
    const text = adapter.tasks.get("S.md")!.text;
    expect(text).toContain("  - 2026-10-19");
    expect(text).not.toContain("  - 2026-10-20");
    expect(text).toContain("due: 2026-10-20");
  });

  it("Gegenprobe: der ungebundene Befehl erledigt beide Vorkommen", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    await Promise.all([repo.perform("tasks/S.md", { type: "complete" }), repo.perform("tasks/S.md", { type: "complete" })]);
    const text = adapter.tasks.get("S.md")!.text;
    expect(text).toContain("  - 2026-10-20");
    expect(text).toContain("due: 2026-10-21");
  });
});
