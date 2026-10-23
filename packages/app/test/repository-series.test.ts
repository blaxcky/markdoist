// Serienaktionen über das Repository (7.3, 5.4): Doppeltipp, externe Änderungen, Undo, „in Arbeit“.
import { describe, expect, it } from "vitest";
import { clockAtLocal, readSeries, type Clock } from "@markdoist/core";
import { MemoryAdapter, MemoryKeyValueStore, Repository, toggleDoneAction } from "../src";

const TZ = "Europe/Berlin";
const serie = (extra: string[] = [], body = "- [x] eins\n- [ ] zwei\n") =>
  [
    "---",
    "id: 01K7C9V3QH2T8M4N6P0R5S1W9X",
    "format_version: 1",
    "title: Serie",
    "status: open",
    "priority: none",
    "inbox: false",
    "due: 2026-10-19",
    "scheduled: 2026-10-18",
    "recurrence: FREQ=WEEKLY;BYDAY=MO",
    "recurrence_revision: R1",
    "recurrence_start: 2026-10-05",
    "recurrence_anchor: calendar",
    "recurrence_field: due",
    "recurrence_instance: 2026-10-19",
    ...extra,
    "---",
    body,
  ].join("\n");

function setup(text = serie(), at = "2026-10-19T10:00") {
  const adapter = new MemoryAdapter();
  adapter.tasks.set("S.md", { text, mtime: 1 });
  let seed = 0;
  let now = at;
  const repo = new Repository({
    adapter,
    kv: new MemoryKeyValueStore(),
    folder: "test",
    clock: (): Clock => clockAtLocal(now, TZ),
    random: (b) => {
      for (let i = 0; i < b.length; i++) b[i] = (seed++ * 13 + i) % 256;
    },
  });
  const view = () => repo.getState().index.tasks.find((t) => t.task.ref === "tasks/S.md")!;
  const file = () => adapter.tasks.get("S.md")!.text;
  return { repo, adapter, view, file, setNow: (s: string) => (now = s) };
}

describe("Fortschreiben über das Repository", () => {
  it("Doppeltipp nacheinander: zweiter Tipp ist No-op, genau ein Undo-Eintrag, ein Schreibvorgang", async () => {
    const { repo, adapter, view } = setup();
    await repo.open();
    const a = toggleDoneAction(view());
    const r1 = await repo.perform("tasks/S.md", a.action, a.label);
    expect(r1).toMatchObject({ status: "ok", message: "Nächstes Vorkommen: 2026-10-26" });
    const r2 = await repo.perform("tasks/S.md", a.action, a.label);
    expect(r2.status).toBe("noop");
    expect(adapter.writes).toBe(1);
    expect(repo.getState().undo).toHaveLength(1);
    // Die frische Ansicht zeigt das neue Vorkommen; ein Tipp darauf schreibt wieder.
    const b = toggleDoneAction(view());
    expect(b.action).toEqual({
      type: "completeOccurrence",
      revision: "R1",
      instance: "2026-10-26",
    });
  });

  it("externe Änderung an einem fremden Feld zwischen Anzeige und Tipp: Fortschreibung wird trotzdem übernommen", async () => {
    const { repo, adapter, view, file } = setup();
    await repo.open();
    const a = toggleDoneAction(view());
    adapter.external("S.md", serie(["tags: [neu]"]).replace("priority: none", "priority: high"));
    const r = await repo.perform("tasks/S.md", a.action, a.label);
    expect(r.status).toBe("ok");
    const text = file();
    expect(text).toContain("priority: high");
    expect(text).toContain("tags: [neu]");
    expect(text).toContain("due: 2026-10-26");
    expect(text).toContain("scheduled: 2026-10-25");
    expect(text).toContain("  - 2026-10-19");
  });

  it("externe Änderung an der Frist oder der Historie: Konflikt, nichts geschrieben", async () => {
    for (const ext of [
      serie().replace("due: 2026-10-19", "due: 2026-10-21"),
      serie(["complete_instances: [2026-10-19]"]),
      serie().replace("BYDAY=MO", "BYDAY=TU"),
    ]) {
      const { repo, adapter, view, file } = setup();
      await repo.open();
      const a = toggleDoneAction(view());
      adapter.external("S.md", ext);
      const w = adapter.writes;
      const r = await repo.perform("tasks/S.md", a.action, a.label);
      expect(["conflict", "noop", "blocked"]).toContain(r.status);
      expect(adapter.writes).toBe(w);
      expect(file()).toBe(ext);
    }
  });

  it("Undo nach dem Fortschreiben stellt byte-identisch her; erneutes Erledigen schreibt wieder dasselbe", async () => {
    const { repo, view, file } = setup();
    await repo.open();
    const before = file();
    const a = toggleDoneAction(view());
    await repo.perform("tasks/S.md", a.action, a.label);
    const after = file();
    expect(after).toContain("- [ ] eins");
    const u = await repo.undo();
    expect(u.status).toBe("ok");
    expect(file()).toBe(before);
    expect(readSeries(view().task)!.instance?.toString()).toBe("2026-10-19");
    // Die alte Aktion (gleiches K, gleiche Revision) gilt nach dem Undo wieder als neue Erledigung.
    const r = await repo.perform("tasks/S.md", a.action, a.label);
    expect(r.status).toBe("ok");
    expect(file()).toBe(after);
  });

  it("„in Arbeit“ wird beim Fortschreiben zu „offen“; Statusauswahl „erledigt“ schreibt das Vorkommen fort", async () => {
    const { repo, file } = setup(serie().replace("status: open", "status: in-progress"));
    await repo.open();
    const r = await repo.perform("tasks/S.md", { type: "setStatus", status: "done" });
    expect(r.status).toBe("ok");
    expect(file()).toContain("status: open");
    expect(file()).toContain("due: 2026-10-26");
    expect(file()).not.toContain("completedDate");
  });

  it("Tipp in der Liste auf eine Serie mit bereits aufgelöstem Vorkommen schreibt nichts", async () => {
    const { repo, adapter, view } = setup(serie(["complete_instances: [2026-10-19]"]));
    await repo.open();
    const v = view();
    expect(v.series?.phase).toBe("clarify");
    expect(v.dueDate?.toString()).toBe("2026-10-26");
    const a = toggleDoneAction(v);
    const r = await repo.perform("tasks/S.md", a.action, a.label);
    expect(r.status).toBe("noop");
    expect(adapter.writes).toBe(0);
    expect(repo.getState().undo).toHaveLength(0);
  });

  it("Aktionszeitpunkt ist der Tipp, nicht das Schreiben: Erledigung um 23:59 zählt zum Tag des Tipps", async () => {
    const { repo, view, file, setNow } = setup(
      serie()
        .replace("BYDAY=MO", "BYDAY=MO")
        .replace("recurrence_anchor: calendar", "recurrence_anchor: completion"),
      "2026-10-19T23:59",
    );
    await repo.open();
    const a = toggleDoneAction(view());
    const p = repo.perform("tasks/S.md", a.action, a.label);
    setNow("2026-10-20T00:01");
    await p;
    expect(file()).toContain("last_completed_at: 2026-10-19T23:59:00+02:00");
    expect(file()).toContain("due: 2026-10-26");
  });
});
