import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStore, loadSettings, saveSettings, type Settings } from "../src/main/settings";

let base: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "markdoist-settings-"));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const tmpFiles = async (dir: string) => (await readdir(dir)).filter((n) => n.endsWith(".tmp"));

describe("LocalStore gleichzeitige Zugriffe (R3)", () => {
  it("20 gleichzeitige set() auf denselben Schlüssel: alle erfüllt, letzter Aufruf gewinnt, keine Temp-Reste", async () => {
    const store = new LocalStore(base);
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => store.set("drafts", `Wert ${i}`)));
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await store.get("drafts")).toBe("Wert 19");
    expect(await tmpFiles(join(base, "kv"))).toEqual([]);
  });

  it("set() gefolgt von delete() ohne await: Schlüssel ist weg", async () => {
    const store = new LocalStore(base);
    await store.set("undo", "alt");
    const s = store.set("undo", "neu");
    const d = store.delete("undo");
    await Promise.all([s, d]);
    expect(await store.get("undo")).toBeNull();
  });

  it("delete() gefolgt von set() ohne await: Wert ist da", async () => {
    const store = new LocalStore(base);
    await store.set("undo", "alt");
    const d = store.delete("undo");
    const s = store.set("undo", "neu");
    await Promise.all([d, s]);
    expect(await store.get("undo")).toBe("neu");
  });

  it("verschiedene Schlüssel bleiben unabhängig", async () => {
    const store = new LocalStore(base);
    await Promise.all([store.set("a", "1"), store.set("b", "2"), store.set("a", "3")]);
    expect(await store.get("a")).toBe("3");
    expect(await store.get("b")).toBe("2");
  });

  it("Schreibfehler erreichen den Aufrufer und blockieren spätere Aufträge nicht", async () => {
    const store = new LocalStore(base);
    // Eine Datei an der Stelle des kv-Ordners lässt jedes Schreiben scheitern.
    await writeFile(join(base, "kv"), "");
    await expect(store.set("x", "1")).rejects.toThrow();
    await expect(store.set("x", "2")).rejects.toThrow();
    await rm(join(base, "kv"));
    await expect(store.set("x", "3")).resolves.toBeUndefined();
    expect(await store.get("x")).toBe("3");
  });
});

describe("saveSettings gleichzeitige Aufrufe (R3)", () => {
  it("20 gleichzeitige saveSettings(): alle erfüllt, letzter Aufruf gewinnt, keine Temp-Reste", async () => {
    const themes: Settings["theme"][] = ["system", "light", "dark"];
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => saveSettings(base, { folder: `/ordner/${i}`, theme: themes[i % 3]! })),
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await loadSettings(base)).toEqual({ folder: "/ordner/19", theme: themes[19 % 3] });
    expect(JSON.parse(await readFile(join(base, "settings.json"), "utf8")).folder).toBe("/ordner/19");
    expect(await tmpFiles(base)).toEqual([]);
  });
});
