// Schreibschutz, Wiederherstellung, Konfliktentscheidungen und Entwürfe (Plan 4.4, 7.1, 7.3, 7.6).
import { describe, expect, it } from "vitest";
import { clockAtLocal, type Clock } from "@markdoist/core";
import { MemoryAdapter, MemoryKeyValueStore, Repository, type ReadResult } from "../src";

const TZ = "Europe/Berlin";
const ID = "01K7C9V3QH2T8M4N6P0R5S1W9X";
const task = (title: string, extra = "", id = ID) =>
  `---\nid: ${id}\ntitle: ${title}\nstatus: open\npriority: none\ninbox: true\n${extra}---\nNotiz\n`;

function setup(adapter = new MemoryAdapter(), kv = new MemoryKeyValueStore()) {
  const time = { local: "2026-10-12T10:00" };
  let seed = 0;
  const repo = new Repository({
    adapter,
    kv,
    folder: "test",
    clock: (): Clock => clockAtLocal(time.local, TZ),
    random: (b) => {
      for (let i = 0; i < b.length; i++) b[i] = (seed++ * 13 + i) % 256;
    },
  });
  return { repo, adapter, kv, time };
}

/** Adapter, dessen nächster Lesezugriff erst nach Freigabe antwortet (deterministische Warteschlange). */
class GatedAdapter extends MemoryAdapter {
  private gate: Promise<void> | null = null;
  private open: () => void = () => {};
  holdNextRead() {
    this.gate = new Promise((r) => (this.open = r));
  }
  release() {
    this.open();
  }
  override async read(ref: string): Promise<ReadResult> {
    const g = this.gate;
    this.gate = null;
    if (g) await g;
    return super.read(ref);
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("Undo nur für rücknehmbare Aktionen (4.4)", () => {
  it("undoable genau dann, wenn ein Undo-Eintrag entstand", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    adapter.tasks.set("roh.md", { text: "# ohne Frontmatter\n", mtime: 1 });
    await repo.open();
    const undoLen = () => repo.getState().undo.length;
    const check = async (p: Promise<unknown>, undoable: boolean) => {
      const before = undoLen();
      const r = (await p) as { status: string; undoable?: boolean };
      expect(r.status).toBe("ok");
      expect(r.undoable === true).toBe(undoable);
      expect(undoLen() - before).toBe(undoable ? 1 : 0);
      return r;
    };
    await check(repo.perform("tasks/A.md", { type: "setPriority", priority: "high" }), true);
    const noop = await repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    expect(noop).toEqual({ status: "noop" });
    await check(repo.create({ title: "Neu" }), true);
    await check(repo.adopt("tasks/roh.md"), true);
    const t = (await check(repo.moveToTrash("tasks/A.md"), true)) as { ref?: string };
    await check(repo.restoreFromTrash(t.ref!), true);
    await repo.moveToTrash("tasks/A.md");
    const hashes = await repo.trashHashes();
    await check(repo.emptyTrash(hashes), false);
    expect(adapter.trash.size).toBe(0);
  });

  it("renameToTitle ist rücknehmbar, Konfliktvariante behalten nicht", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("alt.md", { text: task("Neuer Titel"), mtime: 1 });
    adapter.tasks.set("alt.sync-conflict-20261012-101010-ABC.md", { text: task("Neuer Titel").replace("Notiz", "Andere"), mtime: 1 });
    await repo.open();
    const r = await repo.renameToTitle("tasks/alt.md");
    expect(r).toMatchObject({ status: "ok", undoable: true });
    const len = repo.getState().undo.length;
    const k = await repo.keepVariant("tasks/Neuer Titel.md", ["tasks/alt.sync-conflict-20261012-101010-ABC.md"]);
    expect(k.status).toBe("ok");
    expect(k.status === "ok" && k.undoable).toBeFalsy();
    expect(repo.getState().undo.length).toBe(len);
  });
});

describe("7.1: veralteter Stand ist schreibgeschützt", () => {
  it("fehlgeschlagene Verzeichnisabfrage sperrt alle Schreibaktionen bis zum nächsten Abgleich (AK-34)", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    adapter.tasks.set("V.sync-conflict-20261012-101010-ABC.md", { text: task("A").replace("Notiz", "V"), mtime: 1 });
    adapter.tasks.set("roh.md", { text: "# roh\n", mtime: 1 });
    adapter.trash.set("T.md", { text: task("T", "", "01K7C9V3QH2T8M4N6P0R5S1W9Y"), mtime: 1 });
    await repo.open();
    await repo.perform("tasks/A.md", { type: "setPriority", priority: "low" });
    await repo.saveDraft("tasks/A.md", "Entwurf\n");
    adapter.listFails = true;
    await repo.scan();
    const s = repo.getState();
    expect(s.stale).toBe(true);
    expect(s.files.size).toBe(3);
    expect(s.readError).toMatch(/nicht gelesen/);
    const writes = adapter.writes;
    const results = [
      await repo.perform("tasks/A.md", { type: "setPriority", priority: "high" }),
      await repo.create({ title: "Neu" }),
      await repo.moveToTrash("tasks/A.md"),
      await repo.restoreFromTrash("trash/T.md"),
      await repo.renameToTitle("tasks/roh.md"),
      await repo.adopt("tasks/roh.md"),
      await repo.keepVariant("tasks/A.md", ["tasks/V.sync-conflict-20261012-101010-ABC.md"]),
      await repo.keepBoth("tasks/V.sync-conflict-20261012-101010-ABC.md"),
      await repo.commitDraft("tasks/A.md"),
      await repo.retryDraft("tasks/A.md"),
      await repo.undo(),
      await repo.emptyTrash([{ ref: "trash/T.md", hash: "x" }]),
    ];
    for (const r of results) {
      expect(r.status).toBe("blocked");
      if (r.status === "blocked") expect(r.message).toMatch(/veraltet|schreibgeschützt/);
    }
    expect(adapter.writes).toBe(writes);
    expect(repo.getState().drafts).toHaveLength(1);
    expect(repo.getState().files.size).toBe(3);
    adapter.listFails = false;
    await repo.scan({ full: false });
    expect(repo.getState().stale).toBe(false);
    expect((await repo.commitDraft("tasks/A.md")).status).toBe("ok");
  });
});

describe("7.1: Vollabgleich während eines Teilabgleichs", () => {
  it("folgt nach dem laufenden Teilabgleich", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 5 });
    await repo.open();
    adapter.tasks.set("A.md", { text: task("B"), mtime: 5 }); // gleiche Größe und mtime
    const partial = repo.scan({ full: false });
    const full = repo.scan({ full: true });
    await partial;
    await full;
    expect(repo.getState().files.get("tasks/A.md")!.text).toBe(task("B"));
    expect(repo.getState().lastScan?.full).toBe(true);
  });
  it("ein zweiter Teilabgleich startet keinen weiteren", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 5 });
    await repo.open();
    const a = repo.scan({ full: false });
    expect(repo.scan({ full: false })).toBe(a);
    await a;
  });
});

describe("7.1: externe Umbenennung über die ID", () => {
  it("Entwurf und Undo folgen der Datei, resolveRef liefert den neuen Ort", async () => {
    const kv = new MemoryKeyValueStore();
    const { repo, adapter } = setup(new MemoryAdapter(), kv);
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    await repo.saveDraft("tasks/A.md", "Entwurf\n");
    const text = adapter.tasks.get("A.md")!.text;
    adapter.external("A.md", null);
    adapter.external("Umbenannt.md", text);
    await repo.scan({ full: false });
    expect(repo.resolveRef("tasks/A.md")).toBe("tasks/Umbenannt.md");
    expect(repo.resolveRef("tasks/Umbenannt.md")).toBe("tasks/Umbenannt.md");
    expect(repo.getState().drafts[0]!.ref).toBe("tasks/Umbenannt.md");
    expect(repo.getState().undo.at(-1)!.ref).toBe("tasks/Umbenannt.md");
    expect(repo.orphanDrafts()).toHaveLength(0);
    // überdauert den Neustart
    const b = setup(adapter, kv);
    await b.repo.open();
    expect(b.repo.getState().drafts[0]!.ref).toBe("tasks/Umbenannt.md");
    expect((await b.repo.undo()).status).toBe("ok");
    expect(adapter.tasks.get("Umbenannt.md")!.text).toBe(task("A"));
  });
  it("mehrdeutige ID: keine Zuordnung", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.saveDraft("tasks/A.md", "Entwurf\n");
    adapter.external("A.md", null);
    adapter.external("B.md", task("A"));
    adapter.external("C.md", task("A"));
    await repo.scan();
    expect(repo.resolveRef("tasks/A.md")).toBeNull();
    expect(repo.getState().drafts[0]!.ref).toBe("tasks/A.md");
    expect(repo.orphanDrafts()).toHaveLength(1);
  });
  it("ohne ID keine behauptete Identität", async () => {
    const { repo, adapter } = setup();
    const noId = "---\ntitle: A\nstatus: open\n---\nx\n";
    adapter.tasks.set("A.md", { text: noId, mtime: 1 });
    await repo.open();
    adapter.external("A.md", null);
    adapter.external("B.md", noId);
    await repo.scan();
    expect(repo.resolveRef("tasks/A.md")).toBeNull();
  });
  it("bereits bekannte Datei mit derselben ID ist keine Umbenennung", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    adapter.tasks.set("A.sync-conflict-20261012-101010-ABC.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.saveDraft("tasks/A.md", "Entwurf\n");
    adapter.external("A.md", null);
    await repo.scan();
    expect(repo.resolveRef("tasks/A.md")).toBeNull();
    expect(repo.getState().drafts[0]!.ref).toBe("tasks/A.md");
  });
});

describe("7.3: offene Vorgänge vor neuen Schreibaktionen", () => {
  it("unklarer Ausgang erscheint sofort unter Problemen und sperrt die Datei", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    adapter.tasks.set("B.md", { text: task("B", "", "01K7C9V3QH2T8M4N6P0R5S1W9Y"), mtime: 1 });
    await repo.open();
    adapter.failNext("unknown");
    const r = await repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toMatch(/Probleme/);
    const rec = repo.getState().recovery;
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ ref: "tasks/A.md", before: task("A"), current: task("A") });
    expect(rec[0]!.desired).toContain("priority: high");
    const writes = adapter.writes;
    const again = await repo.perform("tasks/A.md", { type: "setPriority", priority: "low" });
    expect(again.status).toBe("blocked");
    if (again.status === "blocked") expect(again.message).toMatch(/Wiederherstellungsfall/);
    expect((await repo.moveToTrash("tasks/A.md")).status).toBe("blocked");
    expect(adapter.writes).toBe(writes);
    // andere Dateien bleiben beschreibbar
    expect((await repo.perform("tasks/B.md", { type: "setPriority", priority: "high" })).status).toBe("ok");
    // Klären: gewünschte Fassung übernehmen, danach wieder frei
    const a = await repo.applyRecovery(rec[0]!.opId);
    expect(a).toMatchObject({ status: "ok" });
    expect(a.status === "ok" && a.undoable).toBeFalsy();
    expect(repo.getState().recovery).toHaveLength(0);
    expect(adapter.tasks.get("A.md")!.text).toContain("priority: high");
    expect((await repo.perform("tasks/A.md", { type: "setPriority", priority: "low" })).status).toBe("ok");
  });
  it("Fall aus dem Journal beim Start sperrt die Datei", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    adapter.journal.set("op1", {
      opId: "op1",
      kind: "write",
      ref: "tasks/A.md",
      name: "A.md",
      before: task("A"),
      desired: task("A").replace("Notiz", "Neu"),
      current: null,
      message: "Abbruch",
    });
    await repo.open();
    expect(repo.getState().recovery[0]!.current).toBe(task("A"));
    expect((await repo.perform("tasks/A.md", { type: "complete" })).status).toBe("blocked");
    expect(adapter.writes).toBe(0);
  });
  it("Neuanlage vergibt den Namen eines offenen Falls nicht erneut", async () => {
    const { repo, adapter } = setup();
    adapter.journal.set("op1", { opId: "op1", kind: "create", ref: "tasks/Neu.md", name: "Neu.md", before: null, desired: "x", current: null, message: "Abbruch" });
    await repo.open();
    const r = await repo.create({ title: "Neu" });
    expect(r).toMatchObject({ status: "ok" });
    expect(r.status === "ok" && r.ref).not.toBe("tasks/Neu.md");
  });
});

describe("7.3: Wiederherstellungsfall mit Ausgangsfassung", () => {
  it("Fall liefert Vorher, Gewünscht und Aktuell; Ausgangsfassung wiederherstellbar", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.failNext("unknown", { applied: true });
    await repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    const c = repo.getState().recovery[0]!;
    expect(c.before).toBe(task("A"));
    expect(c.desired).toContain("priority: high");
    expect(c.current).toBe(c.desired);
    const r = await repo.applyRecoveryBefore(c.opId);
    expect(r.status).toBe("ok");
    expect(adapter.tasks.get("A.md")!.text).toBe(task("A"));
    expect(repo.getState().recovery).toHaveLength(0);
    expect(adapter.journal.size).toBe(0);
  });
  it("dritter Inhalt seit der Anzeige wird weder durch Gewünscht noch durch Vorher überschrieben (AK-22)", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.failNext("unknown");
    await repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    const c = repo.getState().recovery[0]!;
    const third = task("A").replace("Notiz", "Dritter Inhalt");
    adapter.external("A.md", third);
    const writes = adapter.writes;
    expect((await repo.applyRecovery(c.opId)).status).toBe("conflict");
    expect(adapter.tasks.get("A.md")!.text).toBe(third);
    expect(repo.getState().recovery[0]!.current).toBe(third);
    const fourth = task("A").replace("Notiz", "Vierter Inhalt");
    adapter.external("A.md", fourth);
    expect((await repo.applyRecoveryBefore(c.opId)).status).toBe("conflict");
    expect(adapter.tasks.get("A.md")!.text).toBe(fourth);
    expect(adapter.writes).toBe(writes);
    // Die Anzeige zeigt jetzt den neuen aktuellen Stand; erst eine erneute Entscheidung schreibt.
    expect(repo.getState().recovery[0]!.current).toBe(fourth);
    expect((await repo.applyRecoveryBefore(c.opId)).status).toBe("ok");
    expect(adapter.tasks.get("A.md")!.text).toBe(task("A"));
  });
  it("fehlende Datei: Gewünscht wird nur als neue Datei angelegt, nicht wenn sie inzwischen wieder da ist", async () => {
    const { repo, adapter } = setup();
    adapter.journal.set("op1", { opId: "op1", kind: "write", ref: "tasks/A.md", name: "A.md", before: task("A"), desired: task("A"), current: null, message: "Datei fehlt" });
    await repo.open();
    adapter.external("A.md", task("X"));
    expect((await repo.applyRecovery("op1")).status).toBe("conflict");
    expect(adapter.tasks.get("A.md")!.text).toBe(task("X"));
  });
});

describe("7.3: Konfliktdialog prüft erneut den Hash (AK-10)", () => {
  const conflicted = async () => {
    const s = setup();
    s.adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await s.repo.open();
    await s.repo.saveDraft("tasks/A.md", "Mein Text\n");
    s.adapter.external("A.md", task("A").replace("Notiz", "Fremder Text"));
    await s.repo.scan();
    expect((await s.repo.commitDraft("tasks/A.md")).status).toBe("conflict");
    return s;
  };
  it("dritte Änderung nach dem Konflikt → erneut Konflikt, nichts geschrieben", async () => {
    const { repo, adapter } = await conflicted();
    const third = task("A").replace("Notiz", "Dritte Fassung");
    adapter.external("A.md", third);
    const writes = adapter.writes;
    const r = await repo.resolveDraftConflict("tasks/A.md", "mine");
    expect(r.status).toBe("conflict");
    if (r.status === "conflict") {
      expect(r.mine).toBe("Mein Text\n");
      expect(r.theirs).toBe(third);
    }
    expect(adapter.tasks.get("A.md")!.text).toBe(third);
    expect(adapter.writes).toBe(writes);
    expect(repo.getState().drafts).toHaveLength(1);
    // erneute bewusste Entscheidung gegen die nun verglichene Fassung
    expect((await repo.resolveDraftConflict("tasks/A.md", "mine")).status).toBe("ok");
    expect(adapter.tasks.get("A.md")!.text).toContain("Mein Text");
  });
  it("auch eine Änderung nur an anderen Feldern wird nicht übergangen", async () => {
    const { repo, adapter } = await conflicted();
    adapter.external("A.md", task("A").replace("Notiz", "Fremder Text").replace("priority: none", "priority: high"));
    expect((await repo.resolveDraftConflict("tasks/A.md", "mine")).status).toBe("conflict");
    expect(adapter.tasks.get("A.md")!.text).toContain("Fremder Text");
  });
});

describe("7.6: fehlgeschlagenes Speichern", () => {
  it("retryDraft schreibt den gesicherten Entwurf ohne neue Eingabe", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.saveDraft("tasks/A.md", "Neu\n");
    adapter.failNext("permission");
    expect((await repo.commitDraft("tasks/A.md")).status).toBe("error");
    expect(repo.pendingDrafts().map((d) => d.ref)).toEqual(["tasks/A.md"]);
    const r = await repo.retryDraft("tasks/A.md");
    expect(r).toMatchObject({ status: "ok", undoable: true });
    expect(adapter.tasks.get("A.md")!.text).toContain("Neu\n");
    expect(repo.pendingDrafts()).toHaveLength(0);
  });
  it("pendingDrafts: nur Entwürfe, die vom Dateistand abweichen, auch nach Neustart", async () => {
    const kv = new MemoryKeyValueStore();
    const adapter = new MemoryAdapter();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    adapter.tasks.set("B.md", { text: task("B", "", "01K7C9V3QH2T8M4N6P0R5S1W9Y"), mtime: 1 });
    adapter.tasks.set("C.md", { text: task("C", "", "01K7C9V3QH2T8M4N6P0R5S1W9Z"), mtime: 1 });
    const a = setup(adapter, kv);
    await a.repo.open();
    await a.repo.saveDraft("tasks/A.md", "Abweichend\n");
    await a.repo.saveDraft("tasks/B.md", "Notiz\n"); // gleich dem Dateistand
    await a.repo.saveDraft("tasks/C.md", "Verwaist\n");
    adapter.external("C.md", null);
    const b = setup(adapter, kv);
    await b.repo.open();
    expect(b.repo.pendingDrafts().map((d) => d.ref).sort()).toEqual(["tasks/A.md", "tasks/C.md"]);
    expect(adapter.writes).toBe(0);
  });
  it("saveDraftAsNew auch für vorhandene Dateien; die Datei bleibt unverändert", async () => {
    const { repo, adapter } = setup();
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    await repo.saveDraft("tasks/A.md", "Kopie des Entwurfs\n");
    const r = await repo.saveDraftAsNew("tasks/A.md");
    expect(r).toMatchObject({ status: "ok", undoable: true });
    expect(adapter.tasks.get("A.md")!.text).toBe(task("A"));
    expect(adapter.tasks.size).toBe(2);
    const created = [...adapter.tasks.entries()].find(([n]) => n !== "A.md")![1].text;
    expect(created).toContain("title: A (Entwurf)");
    expect(created).toContain("Kopie des Entwurfs");
    expect(created).toContain("inbox: true");
    expect(repo.getState().drafts).toHaveLength(0);
  });
});

describe("7.3: fester Aktionszeitpunkt ab dem Einreihen", () => {
  it("wartender Auftrag verwendet den Zeitpunkt des Einreihens", async () => {
    const adapter = new GatedAdapter();
    const { repo, time } = setup(adapter);
    adapter.tasks.set("A.md", { text: task("A"), mtime: 1 });
    await repo.open();
    adapter.holdNextRead();
    const first = repo.perform("tasks/A.md", { type: "setPriority", priority: "high" });
    await tick();
    const second = repo.perform("tasks/A.md", { type: "complete" }); // eingereiht um 10:00
    time.local = "2026-10-12T23:30";
    adapter.release();
    expect((await first).status).toBe("ok");
    expect((await second).status).toBe("ok");
    const text = adapter.tasks.get("A.md")!.text;
    expect(text).toContain("completedDate: 2026-10-12T10:00:00+02:00");
    expect(text).toContain("dateModified: 2026-10-12T10:00:00+02:00");
  });
});

describe("AK-15: alte wartende Serienaktion nach Undo", () => {
  const serie = [
    "---",
    `id: ${ID}`,
    "format_version: 1",
    "title: Serie",
    "status: open",
    "inbox: false",
    "due: 2026-10-12",
    "recurrence: FREQ=WEEKLY;BYDAY=MO",
    "recurrence_revision: R1",
    "recurrence_start: 2026-10-05",
    "recurrence_instance: 2026-10-12",
    "---",
    "",
  ].join("\n");
  it("schreibt nichts; wiederholte Serienaktion legt keinen weiteren Undo-Eintrag an", async () => {
    const adapter = new GatedAdapter();
    const { repo } = setup(adapter);
    adapter.tasks.set("S.md", { text: serie, mtime: 1 });
    await repo.open();
    const done = { type: "completeOccurrence", revision: "R1", instance: "2026-10-12" } as const;
    expect((await repo.perform("tasks/S.md", done)).status).toBe("ok");
    expect((await repo.perform("tasks/S.md", done)).status).toBe("noop");
    expect(repo.getState().undo).toHaveLength(1);
    // Ein laufender Auftrag hält die Warteschlange; dahinter wartet die nächste Serienaktion.
    adapter.holdNextRead();
    const running = repo.perform("tasks/S.md", { type: "setDate", field: "due", value: "2026-10-20" });
    await tick();
    const waiting = repo.perform("tasks/S.md", { type: "completeOccurrence", revision: "R1", instance: "2026-10-19" });
    expect((await repo.undo()).status).toBe("ok");
    expect(adapter.tasks.get("S.md")!.text).toBe(serie);
    const writes = adapter.writes;
    adapter.release();
    const w = await waiting;
    expect(w.status).toBe("blocked");
    if (w.status === "blocked") expect(w.message).toMatch(/verworfen/);
    // Der laufende Auftrag trifft auf den zurückgenommenen Stand: Konflikt statt blindem Schreiben.
    expect((await running).status).toBe("conflict");
    expect(adapter.writes).toBe(writes);
    expect(adapter.tasks.get("S.md")!.text).toBe(serie);
  });
});

describe("Fehlertexte", () => {
  it("zeigt bei Expo-Modulfehlern nur die Ursache", async () => {
    const { errMessage } = await import("../src/repository");
    expect(errMessage(new Error("Call to function 'SafStorage.listChildren' has been rejected.\n→ Caused by: Ordner nicht lesbar"))).toBe("Ordner nicht lesbar");
    expect(errMessage(new Error("Datei fehlt"))).toBe("Datei fehlt");
  });
});
