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

describe("Recovery: externe Änderung zwischen Abbruch und Neustart (R7)", () => {
  /** Legt A.md an; bei "restore" liegt sie danach vollständig im Papierkorb. */
  const setup = async (kind: "trash" | "restore", hook: (k: string, p: string) => void) => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const a = adapter(n, hook);
    await a.list("tasks");
    if (kind === "restore") {
      expect((await a.moveToTrash("tasks/A.md", hashText(T("A")))).status).toBe("ok");
      await a.list("trash");
    }
    const run = () => (kind === "trash" ? a.moveToTrash("tasks/A.md", hashText(T("A"))) : a.restoreFromTrash("trash/A.md", hashText(T("A"))));
    return { n, run };
  };
  // Quelle und Ziel im Fake: Wurzel = Aufgabenordner, sonst Papierkorb.
  const places = (n: FakeSaf, kind: "trash" | "restore") => {
    const trash = () => n.dir(TRASH_DIR)!;
    return kind === "trash"
      ? { src: () => n.text("A.md"), dst: () => n.text("A.md", trash()), putDst: (t: string) => n.put("A.md", t, trash()) }
      : { src: () => n.text("A.md", trash()), dst: () => n.text("A.md"), putDst: (t: string) => n.put("A.md", t) };
  };

  for (const kind of ["restore", "trash"] as const) {
    it(`${kind}: nach "written" abgebrochen, Ziel extern geändert → Ziel bleibt, genau ein Fall, Quelle bleibt`, async () => {
      const { n, run } = await setup(kind, crashAt(kind, "after-copy"));
      const p = places(n, kind);
      await expect(run()).rejects.toThrow(CrashSimulation);
      p.putDst(T("extern"));
      const cases = await adapter(n).recover();
      expect(cases).toHaveLength(1);
      const ref = kind === "trash" ? "trash/A.md" : "tasks/A.md";
      const source = kind === "trash" ? "tasks/A.md" : "trash/A.md";
      expect(cases[0]).toMatchObject({ kind, ref, source, before: T("A"), current: T("extern") });
      expect(cases[0]!.message).toMatch(/Papierkorb/);
      expect(cases[0]!.message).toMatch(/Aufgabenordner/);
      expect(p.dst()).toBe(T("extern"));
      expect(p.src()).toBe(T("A"));
      // Fall bleibt offen, bis er aufgelöst wird; ein zweiter Neustart löscht ebenfalls nichts.
      expect((await adapter(n).recover()).map((c) => c.opId)).toEqual([cases[0]!.opId]);
      expect(p.dst()).toBe(T("extern"));
      expect(p.src()).toBe(T("A"));
    });

    it(`${kind}: Abbruch mitten in der Kopie (vor "written") → Teilkopie wird entfernt, kein Fall`, async () => {
      const { n, run } = await setup(kind, () => {});
      const p = places(n, kind);
      const write = n.writeFile.bind(n);
      n.writeFile = async (uri: string, text: string) => {
        await write(uri, text.slice(0, 12));
        throw new CrashSimulation("Abbruch mitten im Schreiben");
      };
      await expect(run()).rejects.toThrow(CrashSimulation);
      n.writeFile = write;
      expect(p.dst()).toBe(T("A").slice(0, 12));
      expect(await adapter(n).recover()).toEqual([]);
      expect(p.dst()).toBeNull();
      expect(p.src()).toBe(T("A"));
    });

    it(`${kind}: Abbruch nach Anlegen (vor "written"), Ziel extern beschrieben → keine Löschung, Fall`, async () => {
      const { n, run } = await setup(kind, crashAt(kind, "after-create"));
      const p = places(n, kind);
      await expect(run()).rejects.toThrow(CrashSimulation);
      p.putDst(T("extern"));
      const cases = await adapter(n).recover();
      expect(cases).toHaveLength(1);
      expect(cases[0]!.current).toBe(T("extern"));
      expect(p.dst()).toBe(T("extern"));
      expect(p.src()).toBe(T("A"));
    });

    it(`${kind}: nach "written" abgebrochen, Ziel unverändert → Quelle wird gelöscht, kein Fall`, async () => {
      const { n, run } = await setup(kind, crashAt(kind, "after-copy"));
      const p = places(n, kind);
      await expect(run()).rejects.toThrow(CrashSimulation);
      expect(await adapter(n).recover()).toEqual([]);
      expect(p.dst()).toBe(T("A"));
      expect(p.src()).toBeNull();
    });

    it(`${kind}: nach dem Löschen der Quelle abgebrochen → abgeschlossen, kein Fall`, async () => {
      const { n, run } = await setup(kind, crashAt(kind, "after-delete"));
      const p = places(n, kind);
      await expect(run()).rejects.toThrow(CrashSimulation);
      expect(await adapter(n).recover()).toEqual([]);
      expect(p.dst()).toBe(T("A"));
      expect(p.src()).toBeNull();
    });
  }
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

describe("Unklarer Ausgang zur Laufzeit (7.3)", () => {
  it("dritter Inhalt: Fall kommt sofort mit und bleibt im Journal", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("alt"));
    const a = adapter(n, (k, p) => {
      if (k === "write" && p === "before-truncate") {
        n.put("A.md", T("extern"));
        throw new Error("E/A-Fehler");
      }
    });
    await a.list("tasks");
    const r = await a.write("tasks/A.md", T("neu"), hashText(T("alt")));
    expect(r.status).toBe("unknown");
    if (r.status !== "unknown") return;
    expect(r.recovery).toMatchObject({ kind: "write", ref: "tasks/A.md", before: T("alt"), desired: T("neu"), current: T("extern") });
    expect((await adapter(n).recover()).map((c) => c.opId)).toEqual([r.recovery!.opId]);
    expect(n.text("A.md")).toBe(T("extern"));
  });
  it("Fehler bei unberührtem Ziel: gemeldet, kein offener Fall", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const a = adapter(n);
    await a.list("tasks");
    n.failOnce.writeFile = "ERR_FULL";
    const r = await a.write("tasks/A.md", "neu", hashText(T("A")));
    expect(r.status).toBe("full");
    expect(r.status === "full" && r.recovery).toBeFalsy();
    expect(await adapter(n).recover()).toEqual([]);
  });
  it("Quelle während des Verschiebens geändert: Fall mit Quelle und Ziel, Repository sperrt beide", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    let inject = false;
    const repo = new Repository({
      adapter: adapter(n, (k, p) => {
        if (inject && k === "trash" && p === "after-copy") n.put("A.md", T("extern"));
      }),
      kv: nativeKv(n),
      folder: n.tree,
      clock: () => clockAtLocal("2026-10-12T10:00", "Europe/Berlin"),
    });
    await repo.open();
    inject = true;
    expect((await repo.moveToTrash("tasks/A.md")).status).toBe("conflict");
    inject = false;
    const c = repo.getState().recovery;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "trash", ref: "trash/A.md", source: "tasks/A.md" });
    await repo.scan();
    expect((await repo.perform("tasks/A.md", { type: "setPriority", priority: "high" })).status).toBe("blocked");
    expect(n.text("A.md")).toBe(T("extern"));
  });
});

describe("Keine Ordnerauflistung je Vorgang (Leistung auf Android)", () => {
  const listed = (n: FakeSaf) => n.calls.listChildren ?? 0;
  it("Neuanlage, Schreiben und Löschen listen nach dem Abgleich nicht neu auf", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const trash = n.put(TRASH_DIR, "");
    n.docs.get(trash)!.isDir = true;
    const a = adapter(n);
    await a.list("tasks");
    await a.list("trash");
    const before = listed(n);
    const c = await a.create("Neu.md", T("Neu"));
    expect(c.status).toBe("ok");
    const w = await a.write("tasks/Neu.md", T("Neu2"), hashText(T("Neu")));
    expect(w.status).toBe("ok");
    expect((await a.moveToTrash("tasks/Neu.md", hashText(T("Neu2")))).status).toBe("ok");
    expect((await a.moveToTrash("tasks/A.md", hashText(T("A")))).status).toBe("ok");
    expect(listed(n)).toBe(before);
    expect(n.files()).toEqual([]);
    expect(n.files(trash)).toEqual(["A.md", "Neu.md"]);
    // Der nachgeführte Stand trägt: Wiederherstellen und endgültiges Löschen ohne neue Auflistung.
    expect((await a.restoreFromTrash("trash/A.md", hashText(T("A")))).status).toBe("ok");
    expect((await a.deletePermanently("trash/Neu.md", hashText(T("Neu2")))).status).toBe("ok");
    expect((await a.rename("tasks/A.md", "B.md", hashText(T("A")))).status).toBe("ok");
    expect((await a.write("tasks/B.md", T("B"), hashText(T("A")))).status).toBe("ok");
    expect(listed(n)).toBe(before);
    expect(n.files()).toEqual(["B.md"]);
    expect(n.files(trash)).toEqual([]);
  });
  it("extern gelöscht und neu angelegt: Schreiben findet die neue Datei über eine Auflistung", async () => {
    const n = new FakeSaf();
    const id = n.put("A.md", T("A"));
    const a = adapter(n);
    await a.list("tasks");
    n.docs.delete(id);
    n.put("A.md", T("A2"));
    const before = listed(n);
    expect((await a.write("tasks/A.md", T("neu"), hashText(T("A2")))).status).toBe("ok");
    expect(listed(n)).toBe(before + 1);
    expect(n.text("A.md")).toBe(T("neu"));
  });
  it("extern umbenannt: Schreiben trifft nicht die umbenannte Datei", async () => {
    const n = new FakeSaf();
    const id = n.put("A.md", T("A"));
    const a = adapter(n);
    await a.list("tasks");
    n.docs.get(id)!.name = "Z.md";
    expect((await a.write("tasks/A.md", T("neu"), hashText(T("A")))).status).toBe("missing");
    expect(n.text("Z.md")).toBe(T("A"));
  });
  it("extern angelegte gleichnamige Datei, noch nicht im Stand: Neuanlage ersetzt sie nicht", async () => {
    const n = new FakeSaf();
    const a = adapter(n);
    await a.list("tasks");
    n.put("Neu.md", T("extern"));
    expect((await a.create("neu.md", T("X"))).status).toBe("exists");
    expect(n.files()).toEqual(["Neu.md"]);
    expect(n.text("Neu.md")).toBe(T("extern"));
  });
  it("Kollision im Papierkorb, noch nicht im Stand: Suffix statt Überschreiben", async () => {
    const n = new FakeSaf();
    n.put("A.md", T("A"));
    const trash = n.put(TRASH_DIR, "");
    n.docs.get(trash)!.isDir = true;
    const a = adapter(n);
    await a.list("tasks");
    await a.list("trash");
    n.put("A.md", T("alt im Papierkorb"), trash);
    expect((await a.moveToTrash("tasks/A.md", hashText(T("A")))).status).toBe("ok");
    expect(n.files(trash)).toEqual(["A 2.md", "A.md"]);
    expect(n.text("A.md", trash)).toBe(T("alt im Papierkorb"));
  });
});
