// Nachweise bis zur Speicherung aus docs/REVIEW-WIEDERHOLUNGEN-2026-10-23.md (R1, R4).
import { describe, expect, it } from "vitest";
import { clockAtLocal, readSeries } from "@markdoist/core";
import { fm } from "../../core/test/helpers";
import { MemoryAdapter, MemoryKeyValueStore, Repository, toggleDoneAction } from "../src";

async function setup(rule: string, start: string) {
  const adapter = new MemoryAdapter();
  adapter.tasks.set("S.md", {
    mtime: 1,
    text: fm([
      "title: Audit",
      "status: open",
      `due: ${start}`,
      `recurrence: ${rule}`,
      "recurrence_revision: R1",
      `recurrence_start: ${start}`,
      `recurrence_instance: ${start}`,
      "recurrence_anchor: calendar",
      "recurrence_field: due",
    ]),
  });
  const repo = new Repository({
    adapter,
    kv: new MemoryKeyValueStore(),
    folder: "audit",
    clock: () => clockAtLocal(`${start}T12:00`, "Europe/Vienna"),
  });
  await repo.open();
  return { adapter, repo, view: () => repo.getState().index.tasks[0]! };
}

describe("Repository – Review 23.10.2026", () => {
  it("überlappendes BYSETPOS speichert kein vorzeitiges Serienende", async () => {
    const { adapter, repo, view } = await setup(
      "FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=1,-1;COUNT=2",
      "2026-10-05",
    );
    const result = await repo.perform("tasks/S.md", toggleDoneAction(view()).action);
    expect(result.status).toBe("ok");
    await repo.scan({ full: true });
    expect(readSeries(view().task)?.phase).toBe("active");
    expect(adapter.tasks.get("S.md")!.text).toContain("due: 2026-11-02");
  });

  it("eingereihte Beenden-Aktion kann kein anderes Vorkommen beenden", async () => {
    const { repo, view } = await setup("FREQ=WEEKLY;BYDAY=MO", "2026-10-12");
    const first = repo.perform("tasks/S.md", toggleDoneAction(view()).action);
    const second = repo.perform("tasks/S.md", {
      type: "endSeries",
      revision: "R1",
      instance: "2026-10-12",
      completeCurrent: false,
    });
    expect((await first).status).toBe("ok");
    expect((await second).status).toBe("blocked");
    expect(readSeries(view().task)?.phase).toBe("active");
  });
});
