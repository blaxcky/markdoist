import { describe, expect, it } from "vitest";
import { clockAtLocal, fileNameForTitle, utf8Length } from "@markdoist/core";
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
const task = (title: string, extra = "") =>
  `---\nid: 01K7C9V3QH2T8M4N6P0R5S1W${title.length.toString().padStart(2, "0")}\ntitle: ${title}\nstatus: open\npriority: none\ninbox: true\n${extra}---\nNotiz\n`;

describe("Einlesen schreibt nie (AK-08, AK-09)", () => {
  it("200 Dateien inkl. ungültiger: 0 Schreibvorgänge", async () => {
    const { repo, adapter } = setup();
    for (let i = 0; i < 200; i++) {
      const text = i % 10 === 0 ? `---\nkaputt: [\n---\n` : i % 10 === 1 ? "# ohne Frontmatter\n" : task(`Aufgabe ${i}`);
      adapter.tasks.set(`A${i}.md`, { text, mtime: 1 });
    }
    adapter.tasks.set(".versteckt.md", { text: task("x"), mtime: 1 });
    adapter.tasks.set("notiz.txt", { text: "x", mtime: 1 });
    const before = new Map([...adapter.tasks].map(([k, v]) => [k, v.mtime]));
    await repo.open();
    await repo.scan();
    expect(adapter.writes).toBe(0);
    expect(new Map([...adapter.tasks].map(([k, v]) => [k, v.mtime]))).toEqual(before);
    const s = repo.getState();
    expect(s.files.size).toBe(200);
    expect(s.index.unrecognized.length).toBe(40);
  });

  it("ungültige Datei bleibt bei Aktionen an anderen unverändert", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("kaputt.md", { text: "---\na: [\n---\n", mtime: 1 });
    adapter.tasks.set("ok.md", { text: task("Ok"), mtime: 1 });
    await repo.open();
    const r = await repo.perform("tasks/ok.md", { type: "setPriority", priority: "high" });
    expect(r.status).toBe("ok");
    expect(adapter.tasks.get("kaputt.md")!.text).toBe("---\na: [\n---\n");
  });
});

describe("Hash-Abgleich (AK-10)", () => {
  it("externer Body + lokale Priorität bleiben beide erhalten", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.external("a.md", task("A").replace("Notiz", "Extern geändert"));
    const r = await repo.perform("tasks/a.md", { type: "setPriority", priority: "high" });
    expect(r.status).toBe("ok");
    const text = adapter.tasks.get("a.md")!.text;
    expect(text).toContain("Extern geändert");
    expect(text).toContain("priority: high");
  });
  it("gleiche Frist extern Montag, lokal Freitag → Konflikt, nichts überschrieben", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A", "due: 2026-10-14\n"), mtime: 1 });
    await repo.open();
    const ext = task("A", "due: 2026-10-19\n");
    adapter.external("a.md", ext);
    const r = await repo.perform("tasks/a.md", { type: "setDate", field: "due", value: "2026-10-16" });
    expect(r.status).toBe("conflict");
    expect(adapter.tasks.get("a.md")!.text).toBe(ext);
  });
  it("gleicher Zielwert extern schon gesetzt → No-op", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.external("a.md", task("A").replace("priority: none", "priority: high"));
    const w = adapter.writes;
    expect((await repo.perform("tasks/a.md", { type: "setPriority", priority: "high" })).status).toBe("noop");
    expect(adapter.writes).toBe(w);
  });
});

describe("Papierkorb und Undo (AK-24, 4.4)", () => {
  it("Löschen und Wiederherstellen byte-identisch, Kollision mit Suffix", async () => {
    const { repo, adapter } = setup();
    const text = "﻿" + task("A").replace(/\n/g, "\r\n");
    adapter.tasks.set("A.md", { text, mtime: 1 });
    await repo.open();
    expect((await repo.moveToTrash("tasks/A.md")).status).toBe("ok");
    expect(adapter.tasks.has("A.md")).toBe(false);
    adapter.tasks.set("A.md", { text: task("Andere"), mtime: 2 });
    await repo.scan();
    const r = await repo.restoreFromTrash("trash/A.md");
    expect(r.status).toBe("ok");
    expect(adapter.tasks.get("A 2.md")!.text).toBe(text);
  });
  it("Undo stellt exakten Inhalt wieder her, nur bei passendem Hash", async () => {
    const { repo, adapter } = setup();
    const text = task("A");
    adapter.tasks.set("A.md", { text, mtime: 1 });
    await repo.open();
    await repo.perform("tasks/A.md", { type: "complete" });
    expect(adapter.tasks.get("A.md")!.text).toContain("status: done");
    expect((await repo.undo()).status).toBe("ok");
    expect(adapter.tasks.get("A.md")!.text).toBe(text);
    await repo.perform("tasks/A.md", { type: "complete" });
    adapter.external("A.md", adapter.tasks.get("A.md")!.text + "extern\n");
    expect((await repo.undo()).status).toBe("blocked");
  });
  it("Undo einer Neuanlage legt die Datei in den Papierkorb", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    const r = await repo.create({ title: "Neu: Termin?" });
    expect(r.status).toBe("ok");
    expect(adapter.tasks.has("Neu Termin.md")).toBe(true);
    await repo.undo();
    expect(adapter.tasks.has("Neu Termin.md")).toBe(false);
    expect(adapter.trash.has("Neu Termin.md")).toBe(true);
  });
  it("Undo-Journal überdauert Neustart", async () => {
    const kv = new MemoryKeyValueStore();
    const adapter = new MemoryAdapter();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    const a = setup(adapter, kv);
    await a.repo.open();
    await a.repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    const b = setup(adapter, kv);
    await b.repo.open();
    expect(b.repo.getState().undo).toHaveLength(1);
    expect((await b.repo.undo()).status).toBe("ok");
    expect(adapter.tasks.get("A.md")!.text).toBe(task("A"));
  });
  it("No-op erzeugt keinen Undo-Eintrag (AK-15)", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.perform("tasks/A.md", { type: "complete" });
    await repo.perform("tasks/A.md", { type: "complete" });
    expect(repo.getState().undo).toHaveLength(1);
  });
});

describe("Vollständiger Abgleich (AK-34)", () => {
  it("Inhalt bei gleicher Größe/mtime wird erkannt", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 5 });
    await repo.open();
    adapter.tasks.set("A.md", { text: task("B"), mtime: 5 });
    await repo.scan({ full: false });
    expect([...repo.getState().files.values()][0]!.text).toBe(task("A"));
    await repo.scan({ full: true });
    expect([...repo.getState().files.values()][0]!.text).toBe(task("B"));
  });
  it("fehlgeschlagene Auflistung entfernt nichts", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 5 });
    await repo.open();
    adapter.listFails = true;
    await repo.scan();
    expect(repo.getState().files.size).toBe(1);
    expect(repo.getState().readError).toMatch(/nicht gelesen/);
  });
  it("Cache-Neuaufbau aus Dateien", async () => {
    const kv = new MemoryKeyValueStore();
    const adapter = new MemoryAdapter();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 5 });
    await setup(adapter, kv).repo.open();
    kv.data.set("test:cache", "{kaputt");
    const b = setup(adapter, kv);
    await b.repo.open();
    expect(b.repo.getState().files.size).toBe(1);
  });
});

describe("Fehlerzustände und Entwürfe (AK-36)", () => {
  it("voller Speicher: sichtbarer Fehler, Entwurf bleibt", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.saveDraft("tasks/A.md", "Neuer Text\n");
    adapter.failNext("full");
    const r = await repo.commitDraft("tasks/A.md");
    expect(r.status).toBe("error");
    expect(repo.getState().drafts).toHaveLength(1);
    const ok = await repo.commitDraft("tasks/A.md");
    expect(ok.status).toBe("ok");
    expect(repo.getState().drafts).toHaveLength(0);
    expect(adapter.tasks.get("A.md")!.text).toContain("Neuer Text");
  });
  it("extern gelöschte Datei wird nicht durch Autosave neu erzeugt", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.saveDraft("tasks/A.md", "Text\n");
    adapter.external("A.md", null);
    const r = await repo.commitDraft("tasks/A.md");
    expect(r.status === "error" || r.status === "conflict").toBe(true);
    expect(adapter.tasks.size).toBe(0);
    expect(repo.getState().drafts).toHaveLength(1);
  });
  it("Entwurf überdauert Neustart", async () => {
    const kv = new MemoryKeyValueStore();
    const adapter = new MemoryAdapter();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    const a = setup(adapter, kv);
    await a.repo.open();
    await a.repo.saveDraft("tasks/A.md", "Entwurf\n");
    const b = setup(adapter, kv);
    await b.repo.open();
    expect(b.repo.getState().drafts[0]!.text).toBe("Entwurf\n");
    expect(adapter.tasks.get("A.md")!.text).toBe(task("A"));
  });
});

describe("Dateinamen (AK-43)", () => {
  it("Unicode, leerer Titel und Kollisionssuffix im Byte-Limit", () => {
    const long = "Ä".repeat(150);
    const n = fileNameForTitle(long, () => false, "ABC123");
    expect(utf8Length(n)).toBeLessThanOrEqual(240);
    expect([...n.replace(/\.md$/, "")].length).toBeLessThanOrEqual(100);
    const taken = new Set([n.toLowerCase()]);
    const n2 = fileNameForTitle(long, (x) => taken.has(x.toLowerCase()), "ABC123");
    expect(n2).toMatch(/ 2\.md$/);
    expect(utf8Length(n2)).toBeLessThanOrEqual(240);
    expect(fileNameForTitle("///", () => false, "ABC123")).toBe("Aufgabe ABC123.md");
    expect(fileNameForTitle(" .Zahnarzt: [Termin] #1. ", () => false, "x")).toBe("Zahnarzt Termin 1.md");
    const emoji = "😀".repeat(80);
    expect(utf8Length(fileNameForTitle(emoji, () => false, "x"))).toBeLessThanOrEqual(240);
  });
});

describe("Ordnerwechsel (AK-36)", () => {
  it("wartende und neue Aufträge des alten Ordners schreiben nicht", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    const writes = adapter.writes;
    repo.close();
    const r = await repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    expect(r.status).toBe("blocked");
    expect(adapter.writes).toBe(writes);
    expect(adapter.tasks.get("A.md")!.text).toBe(task("A"));
  });
  it("Undo verwirft wartende Aufträge derselben Datei", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.perform("tasks/A.md", { type: "complete" });
    const pending = repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    const undo = repo.undo();
    await Promise.all([pending, undo]);
    // Entweder lief der Auftrag vor dem Undo (dann blockiert das Undo wegen geändertem Hash)
    // oder er wurde verworfen; nie entsteht ein Mischzustand aus Undo und alter Aktion.
    const text = adapter.tasks.get("A.md")!.text;
    expect(text === task("A") || text.includes("priority: high")).toBe(true);
  });
});

describe("Abgleich: Fortschritt und Abbruch (7.1)", () => {
  it("Abbruch entfernt nichts und markiert die Anzeige als ungeprüft", async () => {
    const adapter = new MemoryAdapter();
    for (let i = 0; i < 120; i++) adapter.tasks.set(`A${i}.md`, { text: task(`A${i}`), mtime: 1 });
    const repo = new Repository({ adapter, kv: new MemoryKeyValueStore(), folder: "t", clock: () => clockAtLocal("2026-10-12T10:00", TZ), batchSize: 10 });
    await repo.open();
    expect(repo.getState().files.size).toBe(120);
    const seen: number[] = [];
    repo.subscribe(() => {
      const p = repo.getState().scanProgress;
      if (p) seen.push(p.done);
      if (p && p.done >= 30) repo.cancelScan();
    });
    await repo.scan({ full: true });
    expect(seen.some((d) => d > 0 && d < 120)).toBe(true);
    expect(repo.getState().files.size).toBe(120);
    expect(repo.getState().readError).toMatch(/abgebrochen/);
    expect(repo.getState().scanProgress).toBeNull();
  });
});

describe("Textkonflikt-Entscheidungen (7.3) und Wiederherstellung", () => {
  const conflicted = async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.saveDraft("tasks/A.md", "Mein Text\n");
    adapter.external("A.md", task("A").replace("Notiz", "Fremder Text"));
    await repo.scan();
    expect((await repo.commitDraft("tasks/A.md")).status).toBe("conflict");
    return { repo, adapter };
  };
  it("Meine Version", async () => {
    const { repo, adapter } = await conflicted();
    expect((await repo.resolveDraftConflict("tasks/A.md", "mine")).status).toBe("ok");
    expect(adapter.tasks.get("A.md")!.text).toContain("Mein Text");
    expect(repo.getState().drafts).toHaveLength(0);
  });
  it("Datei-Version", async () => {
    const { repo, adapter } = await conflicted();
    await repo.resolveDraftConflict("tasks/A.md", "file");
    expect(adapter.tasks.get("A.md")!.text).toContain("Fremder Text");
    expect(repo.getState().drafts).toHaveLength(0);
  });
  it("Beide behalten", async () => {
    const { repo, adapter } = await conflicted();
    expect((await repo.resolveDraftConflict("tasks/A.md", "both")).status).toBe("ok");
    expect(adapter.tasks.get("A.md")!.text).toContain("Fremder Text");
    expect([...adapter.tasks.values()].some((f) => f.text.includes("Mein Text"))).toBe(true);
  });
  it("verwaister Entwurf nach externer Löschung", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.saveDraft("tasks/A.md", "Rettung\n");
    adapter.external("A.md", null);
    await repo.scan();
    expect(repo.orphanDrafts()).toHaveLength(1);
    await repo.resolveDraftConflict("tasks/A.md", "both");
    expect([...adapter.tasks.values()].some((f) => f.text.includes("Rettung"))).toBe(true);
  });
});
