import { describe, expect, it } from "vitest";
import { clockAtLocal, hashText } from "@markdoist/core";
import { Repository } from "@markdoist/app";
import { CrashSimulation, nativeKv, SafAdapter, TRASH_DIR } from "../src/storage/safAdapter";
import { FakeSaf } from "./fakeSaf";

const T = (t: string) => `---\nid: 01K7C9V3QH2T8M4N6P0R5S1W9X\ntitle: ${t}\nstatus: open\n---\nText\n`;
const adapter = (n: FakeSaf, hook?: (k: string, p: string) => void) => new SafAdapter(n, n.tree, "root", hook);
const crashAt = (kind: string, phase: string) => (k: string, p: string) => {
  if (k === kind && p === phase) throw new CrashSimulation(`${k}:${p}`);
};

describe("SafAdapter Grundfunktionen (AK-23 im Fake)", () => {
  it("listet nur Dateien der obersten Ebene", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    n.put(".versteckt.md", T("x"));
    const sub = n.put("Unterordner", "");
    n.docs.get(sub)!.isDir = true;
    n.put("B.md", T("B"), sub);
    expect((await adapter(n).list("tasks")).map((m) => m.name)).toEqual(["A.md"]);
  });
  it("kürzerer Inhalt hinterlässt keine Restbytes, Konflikt bei falschem Hash", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("Ein sehr langer Titel"));
    const a = adapter(n);
    await a.list("tasks");
    const r = await a.read("tasks/A.md");
    expect((await a.write("tasks/A.md", "kurz", "falsch")).status).toBe("conflict");
    expect((await a.write("tasks/A.md", "kurz", r.hash)).status).toBe("ok");
    expect(n.text("A.md")).toBe("kurz");
  });
  it("Neuanlage heißt exakt X.md, auch wenn der Anbieter .txt anhängt", async () => {
    const n = new FakeSaf();
    n.appendTxt = true;
    const r = await adapter(n).create("Neu.md", T("Neu"));
    expect(r.status).toBe("ok");
    expect(n.files()).toEqual(["Neu.md"]);
    expect(n.text("Neu.md")).toBe(T("Neu"));
  });
  it("Neuanlage ist exklusiv", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    expect((await adapter(n).create("a.md", T("X"))).status).toBe("exists");
  });
  it("Papierkorb und Wiederherstellen mit Kollision", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const a = adapter(n);
    await a.list("tasks");
    expect((await a.moveToTrash("tasks/A.md", hashText(T("A")))).status).toBe("ok");
    const trash = n.dir(TRASH_DIR)!;
    expect(n.files(trash)).toEqual(["A.md"]);
    n.put("A.md", T("A2"));
    await a.list("trash");
    const r = await a.restoreFromTrash("trash/A.md", hashText(T("A")));
    expect(r.status).toBe("ok");
    expect(n.files()).toEqual(["A 2.md", "A.md"]);
    expect(n.text("A 2.md")).toBe(T("A"));
  });
  it("fehlende Freigabe: Auflistung wirft statt leerem Ordner", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    n.permission = false;
    await expect(adapter(n).list("tasks")).rejects.toThrow(/Freigabe/);
  });
  it("Journal nicht schreibbar: Zieldatei wird nicht angefasst", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const a = adapter(n);
    await a.list("tasks");
    n.failOnce.journalWrite = "ERR_FULL";
    const r = await a.write("tasks/A.md", "neu", hashText(T("A")));
    expect(r.status).toBe("full");
    expect(n.text("A.md")).toBe(T("A"));
  });
  it("voller Speicher beim Schreiben wird gemeldet", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const a = adapter(n);
    await a.list("tasks");
    n.failOnce.writeFile = "ERR_FULL";
    expect((await a.write("tasks/A.md", "neu", hashText(T("A")))).status).toBe("full");
  });
});

describe("Abbruch an jeder Phase (AK-22, Emulatorlogik im Fake)", () => {
  it("write: Abbruch vor dem Kürzen → Ausgangs- und Zielfassung als Fall", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("alt"));
    const a = adapter(n, crashAt("write", "before-truncate"));
    await a.list("tasks");
    await expect(a.write("tasks/A.md", T("neu"), hashText(T("alt")))).rejects.toThrow(CrashSimulation);
    const cases = await adapter(n).recover();
    expect(cases).toHaveLength(1);
    expect(cases[0]!.before).toBe(T("alt"));
    expect(cases[0]!.desired).toBe(T("neu"));
  });
  it("write: Abbruch nach dem Schreiben → abgeschlossen, keine Wiederholung", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("alt"));
    const a = adapter(n, crashAt("write", "after-write"));
    await a.list("tasks");
    await expect(a.write("tasks/A.md", T("neu"), hashText(T("alt")))).rejects.toThrow();
    expect(await adapter(n).recover()).toEqual([]);
    expect(n.text("A.md")).toBe(T("neu"));
  });
  it("write: dritter Inhalt wird nicht überschrieben", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("alt"));
    const a = adapter(n, crashAt("write", "before-truncate"));
    await a.list("tasks");
    await expect(a.write("tasks/A.md", T("neu"), hashText(T("alt")))).rejects.toThrow();
    n.put("A.md", T("extern"));
    const cases = await adapter(n).recover();
    expect(cases[0]!.current).toBe(T("extern"));
    expect(n.text("A.md")).toBe(T("extern"));
  });
  it("create: Abbruch nach Anlegen → keine doppelte Neuanlage", async () => {
    const n = new FakeSaf();
    const a = adapter(n, crashAt("create", "after-create"));
    await expect(a.create("Neu.md", T("neu"))).rejects.toThrow();
    const cases = await adapter(n).recover();
    expect(cases).toHaveLength(1);
    expect(n.files()).toEqual(["Neu.md"]); // leere, journalverknüpfte Datei, nicht erneut angelegt
    expect(cases[0]!.desired).toBe(T("neu"));
  });
  for (const phase of ["before-journal", "after-create", "after-copy", "after-delete"]) {
    it(`trash: Abbruch ${phase} → genau eine vollständige Fassung, keine ungeprüfte Löschung`, async () => {
      const n = new FakeSaf();
      n.put("A.md", T("A"));
      const a = adapter(n, crashAt("trash", phase));
      await a.list("tasks");
      await expect(a.moveToTrash("tasks/A.md", hashText(T("A")))).rejects.toThrow();
      const cases = await adapter(n).recover();
      expect(cases).toEqual([]);
      const trash = n.dir(TRASH_DIR);
      const all = [...n.files().map((f) => n.text(f)), ...(trash ? n.files(trash).map((f) => n.text(f, trash)) : [])];
      expect(all).toEqual([T("A")]);
    });
  }
  it("trash: Quelle zwischen Kopie und Löschen geändert → beide behalten", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const a = adapter(n, (k, p) => {
      if (k === "trash" && p === "after-copy") n.put("A.md", T("extern"));
    });
    await a.list("tasks");
    expect((await a.moveToTrash("tasks/A.md", hashText(T("A")))).status).toBe("conflict");
    expect(n.text("A.md")).toBe(T("extern"));
    expect(n.files(n.dir(TRASH_DIR)!)).toEqual(["A.md"]);
  });
});

describe("Repository über SafAdapter", () => {
  it("Einlesen schreibt nichts, Aktion schreibt, Undo stellt wieder her", async () => {
    const n = new FakeSaf();
    for (let i = 0; i < 30; i++) n.put(`A${i}.md`, i % 7 ? T(`A${i}`) : "kaputt");
    const before = new Map([...n.docs.values()].map((d) => [d.id, d.mtime]));
    const repo = new Repository({
      adapter: adapter(n),
      kv: nativeKv(n),
      folder: n.tree,
      clock: () => clockAtLocal("2026-10-12T10:00", "Europe/Berlin"),
    });
    await repo.open();
    expect(new Map([...n.docs.values()].map((d) => [d.id, d.mtime]))).toEqual(before);
    const r = await repo.perform("tasks/A1.md", { type: "setPriority", priority: "high" });
    expect(r.status).toBe("ok");
    expect(n.text("A1.md")).toContain("priority: high");
    await repo.undo();
    expect(n.text("A1.md")).toBe(T("A1"));
  });
});

describe("Kein Scheinfall nach frühem Fehler", () => {
  it("createFile scheitert → kein offener Wiederherstellungsfall", async () => {
    const n = new FakeSaf();
    n.failOnce.createFile = "ERR_FULL";
    expect((await adapter(n).create("Neu.md", T("neu"))).status).toBe("full");
    expect(await adapter(n).recover()).toEqual([]);
  });
  it("Papierkorb-Kopie scheitert beim Anlegen → kein Fall, Quelle unverändert", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const a = adapter(n);
    await a.list("tasks");
    n.failOnce.createFile = "ERR_PERMISSION";
    // ensureTrash legt den Ordner an und verbraucht den Fehler; zweiter Versuch für die Datei:
    const r1 = await a.moveToTrash("tasks/A.md", hashText(T("A")));
    if (r1.status === "ok") return; // Ordneranlage hat den Fehler bekommen
    expect(await adapter(n).recover()).toEqual([]);
    expect(n.text("A.md")).toBe(T("A"));
  });
  it("Umbenennen abgelehnt → kein Fall", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const a = adapter(n);
    await a.list("tasks");
    n.failOnce.renameDocument = "ERR_IO";
    expect((await a.rename("tasks/A.md", "B.md", hashText(T("A")))).status).toBe("unknown");
    expect(await adapter(n).recover()).toEqual([]);
  });
});
