// Anlegen und Löschen zeigen das Ergebnis sofort; das Schreiben läuft im Hintergrund (4.4, 7.6).
import { describe, expect, it } from "vitest";
import { clockAtLocal } from "@markdoist/core";
import { MemoryAdapter, MemoryKeyValueStore, Repository } from "../src";

/** Hält Neuanlage und Verschieben an, bis der Test sie freigibt. */
class HeldAdapter extends MemoryAdapter {
  private gates: (() => void)[] = [];
  hold = false;
  private gate() {
    if (!this.hold) return Promise.resolve();
    return new Promise<void>((r) => this.gates.push(r));
  }
  release() {
    this.hold = false;
    for (const g of this.gates.splice(0)) g();
  }
  override async create(name: string, text: string) {
    await this.gate();
    return super.create(name, text);
  }
  override async moveToTrash(ref: string, expectedHash: string) {
    await this.gate();
    return super.moveToTrash(ref, expectedHash);
  }
  /** Lesen des Abgleichs getrennt anhalten */
  private readGates: (() => void)[] = [];
  holdReads = false;
  releaseReads() {
    this.holdReads = false;
    for (const g of this.readGates.splice(0)) g();
  }
  override async read(ref: string) {
    if (this.holdReads) await new Promise<void>((r) => this.readGates.push(r));
    return super.read(ref);
  }
}

let seed = 0;
function setup() {
  const adapter = new HeldAdapter();
  const repo = new Repository({
    adapter,
    kv: new MemoryKeyValueStore(),
    folder: "test",
    clock: () => clockAtLocal("2026-10-12T10:00", "Europe/Berlin"),
    random: (b) => {
      for (let i = 0; i < b.length; i++) b[i] = (seed++ * 7 + i) % 256;
    },
  });
  return { repo, adapter };
}
const task = (title: string) =>
  `---\nid: 01K7C9V3QH2T8M4N6P0R5S1W${title.length.toString().padStart(2, "0")}\ntitle: ${title}\nstatus: open\npriority: none\ninbox: true\n---\nNotiz\n`;
const inboxTitles = (repo: Repository) => repo.getState().index.tasks.map((v) => v.task.fields.title).sort();
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("Neuanlage im Hintergrund", () => {
  it("erscheint vor dem Schreiben und meldet die Referenz sofort", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    adapter.hold = true;
    let shownRef: string | null = null;
    const done = repo.create({ title: "Milch" }, (ref) => (shownRef = ref));
    expect(shownRef).toBe("tasks/Milch.md");
    expect(inboxTitles(repo)).toEqual(["Milch"]);
    expect(adapter.tasks.size).toBe(0);
    const index = repo.getState().index;
    adapter.release();
    const o = await done;
    expect(o).toMatchObject({ status: "ok", ref: "tasks/Milch.md", undoable: true });
    expect(adapter.tasks.has("Milch.md")).toBe(true);
    // Ort und Inhalt stimmen: kein zweiter Indexaufbau.
    expect(repo.getState().index).toBe(index);
    expect(repo.getState().undo.at(-1)).toMatchObject({ kind: "create", ref: "tasks/Milch.md" });
  });

  it("Fehlschlag nimmt die Aufgabe wieder heraus und nennt den Titel", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    adapter.failNext("full");
    let shown = false;
    const o = await repo.create({ title: "Brot" }, () => (shown = true));
    expect(shown).toBe(true);
    expect(o.status).toBe("error");
    expect(o.status !== "ok" && o.status !== "noop" && o.message).toContain("„Brot“ nicht angelegt");
    expect(inboxTitles(repo)).toEqual([]);
    expect(repo.getState().files.size).toBe(0);
    expect(repo.getState().undo).toEqual([]);
  });

  it("Vorbedingungen scheitern vor dem Anzeigen", async () => {
    const { repo, adapter } = setup();
    adapter.listFails = true;
    await repo.open();
    let shown = false;
    const o = await repo.create({ title: "X" }, () => (shown = true));
    expect(o.status).toBe("blocked");
    expect(shown).toBe(false);
  });

  it("Abhaken direkt nach dem Anlegen wartet auf das Schreiben", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    adapter.hold = true;
    let ref = "";
    const created = repo.create({ title: "Post" }, (r) => (ref = r));
    const done = repo.perform(ref, { type: "setPriority", priority: "high" });
    adapter.release();
    expect((await created).status).toBe("ok");
    expect((await done).status).toBe("ok");
    expect(adapter.tasks.get("Post.md")!.text).toContain("priority: high");
  });

  it("anderer Name bei Kollision mit unbekannter Datei ersetzt den vorläufigen Eintrag", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    adapter.external("Tee.md", task("Fremd"));
    const o = await repo.create({ title: "Tee" });
    expect(o.status).toBe("ok");
    expect(o.status === "ok" && o.ref).not.toBe("tasks/Tee.md");
    const files = repo.getState().files;
    expect(files.has("tasks/Tee.md")).toBe(false);
    expect(files.has(o.status === "ok" ? o.ref! : "")).toBe(true);
  });

  it("ein Abgleich während des Schreibens lässt die Aufgabe stehen", async () => {
    const { repo, adapter } = setup();
    await repo.open();
    adapter.hold = true;
    const created = repo.create({ title: "Käse" });
    await repo.scan({ full: true });
    expect(inboxTitles(repo)).toEqual(["Käse"]);
    adapter.release();
    expect((await created).status).toBe("ok");
    await repo.scan({ full: true });
    expect(inboxTitles(repo)).toEqual(["Käse"]);
  });

  it("Abgleich, der vor dem Schreiben gelistet hat und danach endet, lässt die Aufgabe stehen", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.hold = true;
    adapter.holdReads = true;
    const created = repo.create({ title: "Senf" });
    const scan = repo.scan({ full: true });
    await tick();
    adapter.release();
    expect((await created).status).toBe("ok");
    expect(inboxTitles(repo)).toEqual(["A", "Senf"]);
    adapter.releaseReads();
    await scan;
    expect(inboxTitles(repo)).toEqual(["A", "Senf"]);
  });

  it("Ordnerwechsel während des Schreibens entfernt den vorläufigen Eintrag", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.hold = true;
    // Der Schreibauftrag ist eingereiht, aber noch nicht gestartet.
    const created = repo.create({ title: "Neu" });
    repo.close();
    adapter.release();
    const o = await created;
    expect(o.status).not.toBe("ok");
    expect(repo.getState().files.has("tasks/Neu.md")).toBe(false);
  });
});

describe("Löschen im Hintergrund", () => {
  it("verschwindet sofort aus den Ansichten, Papierkorb und Undo erst nach dem Verschieben", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    adapter.tasks.set("b.md", { text: task("Bb"), mtime: 1 });
    await repo.open();
    adapter.hold = true;
    const done = repo.moveToTrash("tasks/a.md");
    expect(inboxTitles(repo)).toEqual(["Bb"]);
    expect(repo.getState().files.has("tasks/a.md")).toBe(true);
    expect(repo.getState().trash).toEqual([]);
    const index = repo.getState().index;
    adapter.release();
    expect(await done).toMatchObject({ status: "ok", undoable: true });
    expect(repo.getState().files.has("tasks/a.md")).toBe(false);
    expect(repo.getState().trash.map((m) => m.name)).toEqual(["a.md"]);
    // Der Index war schon ohne die Datei: kein zweiter Aufbau.
    expect(repo.getState().index).toBe(index);
  });

  it("Fehlschlag bringt die Aufgabe zurück, ohne Undo und Papierkorb", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.failNext("full");
    adapter.hold = true;
    const done = repo.moveToTrash("tasks/a.md");
    expect(inboxTitles(repo)).toEqual([]);
    adapter.release();
    expect((await done).status).toBe("error");
    expect(inboxTitles(repo)).toEqual(["A"]);
    expect(repo.getState().undo).toEqual([]);
    expect(repo.getState().trash).toEqual([]);
  });

  it("ein Abgleich während des Verschiebens holt die Aufgabe nicht zurück", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.hold = true;
    const done = repo.moveToTrash("tasks/a.md");
    await repo.scan({ full: true });
    expect(inboxTitles(repo)).toEqual([]);
    adapter.release();
    expect((await done).status).toBe("ok");
    await tick();
    await repo.scan({ full: true });
    expect(inboxTitles(repo)).toEqual([]);
  });

  it("vorher eingereihte Änderung derselben Aufgabe läuft noch, dann wird verschoben", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    await repo.open();
    const edit = repo.perform("tasks/a.md", { type: "setPriority", priority: "high" });
    const del = repo.moveToTrash("tasks/a.md");
    expect(inboxTitles(repo)).toEqual([]);
    expect((await edit).status).toBe("ok");
    expect((await del).status).toBe("ok");
    expect(adapter.trash.get("a.md")!.text).toContain("priority: high");
  });

  it("Rückgängig nach dem Löschen stellt die Aufgabe wieder her", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("a.md", { text: task("A"), mtime: 1 });
    await repo.open();
    expect((await repo.moveToTrash("tasks/a.md")).status).toBe("ok");
    expect((await repo.undo()).status).toBe("ok");
    expect(inboxTitles(repo)).toEqual(["A"]);
    expect(adapter.tasks.has("a.md")).toBe(true);
  });
});
