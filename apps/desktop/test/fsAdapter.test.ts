import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashText, clockAtLocal } from "@markdoist/core";
import { MemoryKeyValueStore, Repository } from "@markdoist/app";
import { CrashSimulation, FsAdapter, TRASH_DIR } from "../src/main/fsAdapter";

let base: string;
let root: string;
let journal: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "markdoist-"));
  root = join(base, "Aufgaben");
  journal = join(base, "journal");
  await mkdir(root);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const T = (title: string) => `---\nid: 01K7C9V3QH2T8M4N6P0R5S1W9X\ntitle: ${title}\nstatus: open\n---\nText\n`;

function crashAt(kind: string, phase: string) {
  return (k: string, p: string) => {
    if (k === kind && p === phase) throw new CrashSimulation(`${k}:${p}`);
  };
}

const visible = async (dir: string) => (await readdir(dir)).filter((n) => !n.startsWith(".")).sort();

describe("FsAdapter Grundfunktionen", () => {
  it("liest nur die oberste Ebene ohne versteckte Einträge und Symlinks (AK-28)", async () => {
    await writeFile(join(root, "A.md"), T("A"));
    await writeFile(join(root, ".hidden.md"), T("H"));
    await mkdir(join(root, "Unterordner"));
    await writeFile(join(root, "Unterordner", "B.md"), T("B"));
    await symlink(join(root, "A.md"), join(root, "Link.md"));
    const a = new FsAdapter(root, journal);
    expect((await a.list("tasks")).map((m) => m.name)).toEqual(["A.md"]);
  });

  it("schreibt atomar, erkennt Konflikte, erhält BOM", async () => {
    const text = "﻿" + T("A");
    await writeFile(join(root, "A.md"), text);
    const a = new FsAdapter(root, journal);
    const r = await a.read("tasks/A.md");
    expect(r.text).toBe(text);
    expect(r.hash).toBe(hashText(text));
    expect((await a.write("tasks/A.md", "neu", "falsch")).status).toBe("conflict");
    const w = await a.write("tasks/A.md", T("B"), r.hash);
    expect(w.status).toBe("ok");
    expect(await readFile(join(root, "A.md"), "utf8")).toBe(T("B"));
    expect(await visible(root)).toEqual(["A.md"]);
    expect((await readdir(root)).filter((n) => n.endsWith(".todo-tmp"))).toEqual([]);
  });

  it("Neuanlage ist exklusiv", async () => {
    await writeFile(join(root, "A.md"), T("A"));
    const a = new FsAdapter(root, journal);
    expect((await a.create("A.md", T("X"))).status).toBe("exists");
    expect(await readFile(join(root, "A.md"), "utf8")).toBe(T("A"));
    expect((await a.create("B.md", T("B"))).status).toBe("ok");
  });

  it("Papierkorb mit Namenskollision, Ordner .todo-trash", async () => {
    await writeFile(join(root, "A.md"), T("A"));
    const a = new FsAdapter(root, journal);
    const h = hashText(T("A"));
    const r = await a.moveToTrash("tasks/A.md", h);
    expect(r.status).toBe("ok");
    await writeFile(join(root, "A.md"), T("A2"));
    await a.moveToTrash("tasks/A.md", hashText(T("A2")));
    expect((await readdir(join(root, TRASH_DIR))).sort()).toEqual(["A 2.md", "A.md"]);
  });

  it("ungültiges UTF-8 wird erkannt", async () => {
    await writeFile(join(root, "X.md"), Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a]));
    const a = new FsAdapter(root, journal);
    expect((await a.read("tasks/X.md")).invalidUtf8).toBe(true);
  });
});

describe("Abbruch an jeder Phase (AK-22)", () => {
  const writePhases = ["before-journal", "before-tmp", "before-rename", "after-rename"];
  for (const phase of writePhases) {
    it(`write: Abbruch ${phase} → vollständige alte oder neue Fassung`, async () => {
      await writeFile(join(root, "A.md"), T("alt"));
      const a = new FsAdapter(root, journal, crashAt("write", phase));
      await expect(a.write("tasks/A.md", T("neu"), hashText(T("alt")))).rejects.toThrow(CrashSimulation);
      const content = await readFile(join(root, "A.md"), "utf8");
      expect([T("alt"), T("neu")]).toContain(content);
      const b = new FsAdapter(root, journal);
      const cases = await b.recover();
      if (content === T("neu")) expect(cases).toEqual([]);
      if (content === T("alt") && phase !== "before-journal") {
        expect(cases).toHaveLength(1);
        expect(cases[0]!.desired).toBe(T("neu"));
        expect(cases[0]!.before).toBe(T("alt"));
      }
      expect((await readdir(root)).filter((n) => n.endsWith(".todo-tmp"))).toEqual([]);
    });
  }

  it("write: dritter externer Inhalt wird nicht überschrieben", async () => {
    await writeFile(join(root, "A.md"), T("alt"));
    const a = new FsAdapter(root, journal, crashAt("write", "before-rename"));
    await expect(a.write("tasks/A.md", T("neu"), hashText(T("alt")))).rejects.toThrow();
    await writeFile(join(root, "A.md"), T("extern"));
    const cases = await new FsAdapter(root, journal).recover();
    expect(cases[0]!.message).toMatch(/dritten/);
    expect(await readFile(join(root, "A.md"), "utf8")).toBe(T("extern"));
  });

  for (const phase of ["before-journal", "before-link", "after-link"]) {
    it(`create: Abbruch ${phase} → keine doppelte Neuanlage`, async () => {
      const a = new FsAdapter(root, journal, crashAt("create", phase));
      await expect(a.create("Neu.md", T("neu"))).rejects.toThrow();
      const b = new FsAdapter(root, journal);
      const cases = await b.recover();
      const files = await visible(root);
      if (phase === "after-link") {
        expect(files).toEqual(["Neu.md"]);
        expect(cases).toEqual([]);
      } else {
        expect(files).toEqual([]);
        if (phase !== "before-journal") expect(cases[0]!.desired).toBe(T("neu"));
      }
      expect((await readdir(root)).filter((n) => n.endsWith(".todo-tmp"))).toEqual([]);
    });
  }

  for (const kind of ["trash", "rename"] as const) {
    for (const phase of ["before-journal", "before-link", "after-link"]) {
      it(`${kind}: Abbruch ${phase} → keine ungeprüfte Löschung`, async () => {
        await writeFile(join(root, "A.md"), T("A"));
        const a = new FsAdapter(root, journal, crashAt(kind, phase));
        const h = hashText(T("A"));
        const op = kind === "trash" ? a.moveToTrash("tasks/A.md", h) : a.rename("tasks/A.md", "B.md", h);
        await expect(op).rejects.toThrow();
        const cases = await new FsAdapter(root, journal).recover();
        expect(cases).toEqual([]);
        const inRoot = await visible(root);
        let inTrash: string[] = [];
        try {
          inTrash = await readdir(join(root, TRASH_DIR));
        } catch {
          /* fehlt */
        }
        const total = inRoot.length + inTrash.length;
        expect(total).toBe(1); // genau eine vollständige Fassung
        const path = inRoot.length ? join(root, inRoot[0]!) : join(root, TRASH_DIR, inTrash[0]!);
        expect(await readFile(path, "utf8")).toBe(T("A"));
      });
    }
  }
});

describe("Repository über FsAdapter (AK-08)", () => {
  it("Einlesen ändert keine mtime", async () => {
    for (let i = 0; i < 20; i++) await writeFile(join(root, `A${i}.md`), i % 5 ? T(`A${i}`) : "kaputt");
    const before = await Promise.all((await readdir(root)).map(async (n) => (await stat(join(root, n))).mtimeMs));
    const repo = new Repository({
      adapter: new FsAdapter(root, journal),
      kv: new MemoryKeyValueStore(),
      folder: root,
      clock: () => clockAtLocal("2026-10-12T10:00", "Europe/Berlin"),
    });
    await repo.open();
    const after = await Promise.all((await readdir(root)).map(async (n) => (await stat(join(root, n))).mtimeMs));
    expect(after).toEqual(before);
    expect(repo.getState().files.size).toBe(20);
  });
});
