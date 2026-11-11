import { describe, expect, it } from "vitest";
import { clockAtLocal, Temporal } from "@markdoist/core";
import { MemoryAdapter, MemoryKeyValueStore, Repository, shortDay, sideCollections, wasteColor } from "../src";

const TZ = "Europe/Berlin";
let seed = 0;
let minute = 0;
function setup() {
  return new Repository({
    adapter: new MemoryAdapter(),
    kv: new MemoryKeyValueStore(),
    folder: "test",
    // Jede Aktion eine Minute später, damit „zuletzt geändert“ eindeutig ist.
    clock: () => clockAtLocal(`2026-10-12T10:${String(minute++ % 60).padStart(2, "0")}`, TZ),
    random: (b) => {
      for (let i = 0; i < b.length; i++) b[i] = (seed++ * 7 + i) % 256;
    },
  });
}

describe("Bereiche der Seitenleiste (4.5)", () => {
  it("zeigt höchstens drei Listen, zuletzt geänderte zuerst, mit offenen Einträgen", async () => {
    const repo = setup();
    await repo.open();
    for (const [title, note] of [
      ["Packliste", "- [ ] Zahnbürste\n- [x] Ladekabel"],
      ["Einkauf", "- [ ] Milch\n- [ ] Brot"],
      ["Mama", "- [x] Urlaub"],
      ["Baumarkt", ""],
    ] as const)
      expect((await repo.create({ title, kind: "list", note })).status).toBe("ok");
    const s = sideCollections(repo.getState().index);
    expect(s.lists.total).toBe(4);
    expect(s.lists.summary).toBe("4");
    expect(s.lists.kids.map((k) => [k.title, k.meta])).toEqual([
      ["Baumarkt", null],
      ["Mama", null],
      ["Einkauf", "2"],
    ]);
    expect(s.dev).toEqual({ total: 0, summary: null, kids: [] });
    expect(s.waste).toEqual({ total: 0, summary: null, kids: [] });
  });

  it("kurzes Datum und Tonnenfarben", () => {
    expect(shortDay(Temporal.PlainDate.from("2026-11-13"))).toBe("Fr 13.11.");
    expect(wasteColor("Biotonne")).toBe("#8a5a2b");
    expect(wasteColor("Altpapier")).toBe("#246fe0");
    expect(wasteColor("Gelber Sack")).toBe("#e0b000");
    expect(wasteColor("Leichtverpackungen")).toBe("#e0b000");
    expect(wasteColor("Restmüll")).toBe("#5f5f5f");
    expect(wasteColor("Sperrmüll")).toBe("#a8a29e");
  });
});
