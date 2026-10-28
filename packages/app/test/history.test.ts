// Verlauf (4.4): letzte Aktionen mit Zeit und Titel, einzeln zurücknehmbar.
import { describe, expect, it } from "vitest";
import { clockAtLocal } from "@markdoist/core";
import { MemoryAdapter, MemoryKeyValueStore, Repository, undoHistory } from "../src";

let seed = 0;
function setup(kv = new MemoryKeyValueStore()) {
  const adapter = new MemoryAdapter();
  let minute = 0;
  const repo = new Repository({
    adapter,
    kv,
    folder: "test",
    clock: () => clockAtLocal(`2026-10-12T10:${String(minute++ % 60).padStart(2, "0")}`, "Europe/Berlin"),
    random: (b) => {
      for (let i = 0; i < b.length; i++) b[i] = (seed++ * 7 + i) % 256;
    },
  });
  return { repo, adapter, kv };
}
const history = (repo: Repository) => undoHistory(repo.getState()).map((h) => [h.entry.label, h.entry.title, h.status]);

describe("Verlauf", () => {
  it("zeigt Anlegen, Ändern und Löschen mit Titel, neueste zuerst", async () => {
    const { repo } = setup();
    await repo.open();
    const a = await repo.create({ title: "Milch" });
    const b = await repo.create({ title: "Brot" });
    expect(await repo.perform(a.status === "ok" ? a.ref! : "", { type: "complete" }, "Erledigt")).toMatchObject({ status: "ok" });
    await repo.moveToTrash(b.status === "ok" ? b.ref! : "");
    expect(history(repo)).toEqual([
      ["Gelöscht", "Brot", "open"],
      ["Erledigt", "Milch", "open"],
      ["Neue Aufgabe", "Brot", "newer"],
      ["Neue Aufgabe", "Milch", "newer"],
    ]);
    expect(repo.getState().undo.every((e) => typeof e.at === "number")).toBe(true);
  });

  it("nimmt einen älteren Eintrag gezielt zurück und behält ihn als zurückgenommen", async () => {
    const { repo, adapter, kv } = setup();
    await repo.open();
    await repo.create({ title: "Milch" });
    await repo.create({ title: "Brot" });
    const milch = repo.getState().undo[0]!;
    expect(await repo.undoEntry(milch.id)).toMatchObject({ status: "ok" });
    expect(adapter.tasks.has("Milch.md")).toBe(false);
    expect(adapter.tasks.has("Brot.md")).toBe(true);
    expect(history(repo)).toEqual([
      ["Neue Aufgabe", "Brot", "open"],
      ["Neue Aufgabe", "Milch", "undone"],
    ]);
    // überdauert einen Neustart
    const again = setup(kv).repo;
    await again.open();
    expect(again.getState().undone.map((e) => e.title)).toEqual(["Milch"]);
  });

  it("verweigert einen Eintrag, solange eine neuere Aktion auf derselben Datei aussteht", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    const o = await repo.create({ title: "Milch" });
    const ref = o.status === "ok" ? o.ref! : "";
    await repo.perform(ref, { type: "setPriority", priority: "high" }, "Priorität");
    const created = repo.getState().undo[0]!;
    expect(await repo.undoEntry(created.id)).toMatchObject({ status: "blocked", message: expect.stringContaining("neuere Aktion") });
    expect(adapter.tasks.has("Milch.md")).toBe(true);
    expect(await repo.undoEntry(repo.getState().undo[1]!.id)).toMatchObject({ status: "ok" });
    expect(await repo.undoEntry(created.id)).toMatchObject({ status: "ok" });
    expect(adapter.tasks.has("Milch.md")).toBe(false);
  });

  it("meldet eine seitdem fremd geänderte Datei", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    await repo.create({ title: "Milch" });
    const f = adapter.tasks.get("Milch.md")!;
    adapter.tasks.set("Milch.md", { ...f, text: f.text + "extern\n", mtime: (f.mtime ?? 0) + 1 });
    await repo.scan({ full: true });
    expect(history(repo)).toEqual([["Neue Aufgabe", "Milch", "changed"]]);
  });
});
