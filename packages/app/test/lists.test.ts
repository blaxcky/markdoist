import { describe, expect, it } from "vitest";
import { clockAtLocal, listsView, inboxView } from "@markdoist/core";
import { MemoryAdapter, MemoryKeyValueStore, Repository } from "../src";

const TZ = "Europe/Berlin";
let seed = 0;
function setup(adapter = new MemoryAdapter(), kv = new MemoryKeyValueStore()) {
  const repo = new Repository({
    adapter,
    kv,
    folder: "test",
    clock: () => clockAtLocal("2026-10-12T10:00", TZ),
    random: (b) => {
      for (let i = 0; i < b.length; i++) b[i] = (seed++ * 7 + i) % 256;
    },
  });
  return { repo, adapter, kv };
}

describe("Listen im Repository (4.6)", () => {
  it("anlegen, Einträge hinzufügen, abhaken, rückgängig", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    const r = await repo.create({ title: "Packliste", kind: "list" });
    expect(r.status).toBe("ok");
    const ref = r.status === "ok" ? r.ref! : "";
    const idx = repo.getState().index;
    expect(listsView(idx).map((v) => v.task.fields.title)).toEqual(["Packliste"]);
    expect(inboxView(idx, TZ)).toEqual([]);

    expect((await repo.perform(ref, { type: "addItem", text: "Zahnbürste" })).status).toBe("ok");
    expect((await repo.perform(ref, { type: "addItem", text: "Ladekabel" })).status).toBe("ok");
    expect((await repo.perform(ref, { type: "toggleCheckbox", line: 0 })).status).toBe("ok");
    const text = adapter.tasks.get("Packliste.md")!.text;
    expect(text).toMatch(/kind: list\n/);
    expect(text.endsWith("---\n- [x] Zahnbürste\n- [ ] Ladekabel\n")).toBe(true);

    expect((await repo.undo()).status).toBe("ok");
    expect(adapter.tasks.get("Packliste.md")!.text.endsWith("- [ ] Zahnbürste\n- [ ] Ladekabel\n")).toBe(true);
  });

  it("externe Änderung am Body → Konflikt statt falscher Zeile", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    const r = await repo.create({ title: "Einkauf", kind: "list", note: "- [ ] Milch\n- [ ] Brot" });
    const ref = r.status === "ok" ? r.ref! : "";
    const before = adapter.tasks.get("Einkauf.md")!.text;
    const external = before.replace("- [ ] Milch\n", "");
    adapter.external("Einkauf.md", external);
    // Zeile 1 war „Brot“; nach der externen Änderung steht dort nichts mehr – nicht blind löschen.
    const res = await repo.perform(ref, { type: "removeItem", line: 1 });
    expect(res.status).toBe("conflict");
    expect(adapter.tasks.get("Einkauf.md")!.text).toBe(external);
  });
});
