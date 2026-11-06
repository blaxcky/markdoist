import { describe, expect, it } from "vitest";
import { allOpenView, clockAtLocal, devItemsView, devListsView, inboxView } from "@markdoist/core";
import { createDevItem, MemoryAdapter, MemoryKeyValueStore, Repository, startDevWorkAction, toggleDoneAction, trashDevList, trashDoneDevItems } from "../src";

const TZ = "Europe/Berlin";
function setup(adapter = new MemoryAdapter(), kv = new MemoryKeyValueStore()) {
  const repo = new Repository({
    adapter,
    kv,
    folder: "test",
    clock: () => clockAtLocal("2026-10-12T10:00", TZ),
    // echte Zufallswerte: Liste und Einträge brauchen verschiedene IDs
    random: (b) => crypto.getRandomValues(b),
  });
  return { repo, adapter, kv };
}

async function withList(title = "Markdoist") {
  const s = setup();
  await s.repo.open();
  const r = await s.repo.create({ title, kind: "dev-list" });
  expect(r.status).toBe("ok");
  const list = () => devListsView(s.repo.getState().index).find((v) => v.task.fields.title === title)!;
  return { ...s, list };
}

const titles = (vs: { task: { fields: { title: string } } }[]) => vs.map((v) => v.task.fields.title);

describe("Programmieren im Repository (4.8)", () => {
  it("anlegen, Eintrag mit Notiz, erledigen, rückgängig", async () => {
    const { repo, adapter, list } = await withList();
    const r = await createDevItem(repo, list(), "Absturz unter Mesa");
    expect(r.status).toBe("ok");
    const ref = r.status === "ok" ? r.ref! : "";
    let idx = repo.getState().index;
    expect(titles(devItemsView(idx, list()).open)).toEqual(["Absturz unter Mesa"]);
    expect(inboxView(idx, TZ)).toEqual([]);
    expect(allOpenView(idx, TZ)).toEqual([]);
    expect(adapter.tasks.get("Absturz unter Mesa.md")!.text).toContain(`dev_list: ${list().task.fields.id}\n`);

    await repo.saveDraft(ref, "Tritt nur mit Mesa 26 auf.\n");
    expect((await repo.commitDraft(ref)).status).toBe("ok");
    expect(adapter.tasks.get("Absturz unter Mesa.md")!.text.endsWith("---\nTritt nur mit Mesa 26 auf.\n")).toBe(true);

    expect((await repo.perform(ref, { type: "complete" }, "Erledigt")).status).toBe("ok");
    idx = repo.getState().index;
    expect(titles(devItemsView(idx, list()).done)).toEqual(["Absturz unter Mesa"]);
    expect(adapter.tasks.get("Absturz unter Mesa.md")!.text).toMatch(/status: done\n/);

    expect((await repo.undo()).status).toBe("ok");
    expect(titles(devItemsView(repo.getState().index, list()).open)).toEqual(["Absturz unter Mesa"]);
  });

  it("Kreis: offen → in Arbeit → erledigt → wieder offen", async () => {
    const { repo, adapter, list } = await withList();
    const r = await createDevItem(repo, list(), "Halbmond");
    const ref = r.status === "ok" ? r.ref! : "";
    const view = () => repo.getState().index.tasks.find((v) => v.task.ref === ref)!;
    const text = () => adapter.tasks.get("Halbmond.md")!.text;
    const click = () => {
      const { action, label } = startDevWorkAction(view()) ?? toggleDoneAction(view());
      return repo.perform(ref, action, label);
    };

    expect((await click()).status).toBe("ok");
    expect(text()).toMatch(/status: in-progress\n/);
    expect(text()).not.toContain("completedDate");
    expect(titles(devItemsView(repo.getState().index, list()).open)).toEqual(["Halbmond"]);

    expect((await click()).status).toBe("ok");
    expect(text()).toMatch(/status: done\n/);
    expect(text()).toContain("completedDate: ");
    expect(titles(devItemsView(repo.getState().index, list()).done)).toEqual(["Halbmond"]);

    expect((await click()).status).toBe("ok");
    expect(text()).toMatch(/status: open\n/);
    expect(text()).not.toContain("completedDate");
  });

  it("Aufgaben und einfache Listen kennen keinen Zwischenschritt", async () => {
    const { repo } = setup();
    await repo.open();
    await repo.create({ title: "Aufgabe" });
    const t = repo.getState().index.tasks.find((v) => v.task.fields.title === "Aufgabe")!;
    expect(startDevWorkAction(t)).toBeNull();
  });

  it("Liste ohne ID erhält beim ersten Eintrag eine", async () => {
    const { repo, adapter } = setup();
    adapter.external("Alt.md", "---\ntitle: Alt\nkind: dev-list\n---\n");
    await repo.open();
    const list = devListsView(repo.getState().index)[0]!;
    expect(list.task.fields.id).toBeNull();
    expect((await createDevItem(repo, list, "Idee")).status).toBe("ok");
    const id = /\nid: (\S+)\n/.exec(adapter.tasks.get("Alt.md")!.text)?.[1];
    expect(id).toBeTruthy();
    const after = devListsView(repo.getState().index)[0]!;
    expect(titles(devItemsView(repo.getState().index, after).open)).toEqual(["Idee"]);
  });

  it("Erledigte entfernen legt nur erledigte Einträge in den Papierkorb", async () => {
    const { repo, adapter, list } = await withList();
    const a = await createDevItem(repo, list(), "Offen");
    const b = await createDevItem(repo, list(), "Fertig");
    expect(a.status === "ok" && b.status === "ok").toBe(true);
    await repo.perform(b.status === "ok" ? b.ref! : "", { type: "complete" });
    expect((await trashDoneDevItems(repo, repo.getState().index, list())).status).toBe("ok");
    expect([...adapter.tasks.keys()].sort()).toEqual(["Markdoist.md", "Offen.md"]);
    expect([...adapter.trash.keys()]).toEqual(["Fertig.md"]);
  });

  it("Liste löschen: Einträge und Liste in den Papierkorb, wiederhergestellte Einträge ohne Liste", async () => {
    const { repo, adapter, list } = await withList();
    await createDevItem(repo, list(), "Eins");
    await createDevItem(repo, list(), "Zwei");
    expect((await trashDevList(repo, repo.getState().index, list())).status).toBe("ok");
    expect(adapter.tasks.size).toBe(0);
    expect([...adapter.trash.keys()].sort()).toEqual(["Eins.md", "Markdoist.md", "Zwei.md"]);
    expect(devListsView(repo.getState().index)).toEqual([]);

    const trashRef = repo.getState().trash.find((t) => t.name === "Eins.md")!.ref;
    expect((await repo.restoreFromTrash(trashRef)).status).toBe("ok");
    expect(titles(devItemsView(repo.getState().index, null).open)).toEqual(["Eins"]);
  });
});
