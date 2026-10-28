// Ergänzende Abnahmetests (Plan 9) über das Repository: AK-07, -11, -33, -34, -37, -38.
import { describe, expect, it } from "vitest";
import { clockAtLocal, type TaskAction } from "@markdoist/core";
import { MemoryAdapter, MemoryKeyValueStore, Repository } from "../src";

const TZ = "Europe/Berlin";
const ID = "01K7C9V3QH2T8M4N6P0R5S1W9X";

function setup(adapter = new MemoryAdapter(), kv = new MemoryKeyValueStore()) {
  const repo = new Repository({ adapter, kv, folder: "test", clock: () => clockAtLocal("2026-10-12T10:00", TZ) });
  return { repo, adapter, kv };
}

const serie = (extra: string[] = [], formatVersion = "format_version: 1") =>
  [
    "---",
    `id: ${ID}`,
    formatVersion,
    "title: Serie",
    "status: open",
    "priority: none",
    "inbox: false",
    "due: 2026-10-12",
    "recurrence: FREQ=WEEKLY;BYDAY=MO",
    "recurrence_revision: R1",
    "recurrence_start: 2026-10-05",
    "recurrence_instance: 2026-10-12",
    ...extra,
    "---",
    "- [ ] Punkt",
    "",
  ].join("\n");

const ACTIONS: TaskAction[] = [
  { type: "complete" },
  { type: "reopen" },
  { type: "setStatus", status: "in-progress" },
  { type: "setPriority", priority: "high" },
  { type: "setInbox", inbox: true },
  { type: "setTitle", title: "Neu" },
  { type: "setDate", field: "scheduled", value: "2026-10-13" },
  { type: "setBody", body: "x\n" },
  { type: "toggleCheckbox", line: 0 },
  { type: "assignNewId" },
  { type: "completeOccurrence", revision: "R1", instance: "2026-10-12" },
  { type: "skipOccurrence", revision: "R1", instance: "2026-10-12" },
  { type: "endSeries", revision: "R1", instance: "2026-10-12", completeCurrent: false },
  { type: "setException", revision: "R1", date: "2026-10-19", skipped: true },
  { type: "changeReference", revision: "R1", field: "due", offsetDays: -1 },
  { type: "removeRecurrence", revision: "R1" },
];

describe("AK-37: schreibgeschützte Dateien und Historie", () => {
  for (const [name, text] of [
    ["höhere format_version", serie([], "format_version: 3")],
    ["unbekannte Serienstruktur", serie(["skipped_instances: 2026-10-19"])],
  ] as const) {
    it(`${name}: alle Aktionen blocked, 0 Schreibvorgänge`, async () => {
      const { repo, adapter } = setup();
      adapter.tasks.set("S.md", { text, mtime: 1 });
      await repo.open();
      expect(repo.getState().index.tasks[0]!.readOnly).toBe(true);
      for (const a of ACTIONS) {
        const r = await repo.perform("tasks/S.md", a);
        expect(r.status, a.type).toBe("blocked");
      }
      await repo.saveDraft("tasks/S.md", "Entwurf\n");
      expect((await repo.commitDraft("tasks/S.md")).status).toBe("blocked");
      expect(repo.getState().drafts).toHaveLength(1);
      expect(adapter.writes).toBe(0);
      expect(adapter.tasks.get("S.md")!.text).toBe(text);
      expect(repo.getState().undo).toHaveLength(0);
    });
  }
  it("versionslose Fremddatei wird beim Lesen nicht migriert", async () => {
    const { repo, adapter } = setup();
    const text = "---\ntitle: Fremd\ndue: 2026-10-12\nrecurrence: FREQ=WEEKLY;BYDAY=MO\n---\n";
    adapter.tasks.set("F.md", { text, mtime: 1 });
    await repo.open();
    await repo.scan({ full: true });
    await repo.scan({ full: false });
    expect(adapter.writes).toBe(0);
    expect(adapter.tasks.get("F.md")!.text).toBe(text);
    expect(repo.getState().files.get("tasks/F.md")!.text).toBe(text);
  });
  it("Cache-Neuaufbau und Cache-Anzeige verlieren keine Historie", async () => {
    const kv = new MemoryKeyValueStore();
    const adapter = new MemoryAdapter();
    const text = serie([
      "complete_instances: [2026-10-05]",
      "skipped_instances: [2026-09-28]",
      "last_completed_at: 2026-10-05T18:00:00+02:00",
      "recurrence_archive:",
      "  - recurrence_revision: ALT",
      "    recurrence: FREQ=DAILY",
      "    complete_instances: [2026-09-01, 2026-09-02]",
      "    skipped_instances: []",
      "    closed_reason: rule-change",
    ]);
    adapter.tasks.set("S.md", { text, mtime: 1 });
    const a = setup(adapter, kv);
    await a.repo.open();
    const fresh = a.repo.getState().index.tasks[0]!;
    // Anzeige nur aus dem Cache
    adapter.listFails = true;
    const b = setup(adapter, kv);
    await b.repo.open();
    const cached = b.repo.getState().index.tasks[0]!;
    expect(cached.task.data).toEqual(fresh.task.data);
    expect([...cached.series!.C]).toEqual(["2026-10-05"]);
    expect(cached.series!.archive).toEqual(fresh.series!.archive);
    // Cache defekt → aus den Dateien neu aufgebaut
    adapter.listFails = false;
    kv.data.set("test:cache", "[{\"meta\":");
    const c = setup(adapter, kv);
    await c.repo.open();
    const rebuilt = c.repo.getState().index.tasks[0]!;
    expect(rebuilt.task.data).toEqual(fresh.task.data);
    expect(rebuilt.series!.archive).toHaveLength(1);
    expect(adapter.writes).toBe(0);
  });
});

describe("AK-07 über das Repository", () => {
  it("Priorität an Datei ohne format_version ergänzt keine Format-/Serienfelder", async () => {
    const { repo, adapter } = setup();
    const text = `---\nid: ${ID}\ntitle: Fremd\npriority: low\ndue: 2026-10-12\nrecurrence: FREQ=WEEKLY;BYDAY=MO\n---\nText`;
    adapter.tasks.set("F.md", { text, mtime: 1 });
    await repo.open();
    expect((await repo.perform("tasks/F.md", { type: "setPriority", priority: "high" })).status).toBe("ok");
    const after = adapter.tasks.get("F.md")!.text;
    expect(after).not.toMatch(/format_version|recurrence_revision|recurrence_instance|recurrence_start/);
    expect(after.replace(/\ndateModified: .*\n/, "\n")).toBe(text.replace("priority: low", "priority: high"));
  });
});

describe("AK-11: Konfliktkopie", () => {
  const variant = (body: string, modified: string) =>
    `---\nid: ${ID}\ntitle: A\nstatus: open\ndateModified: ${modified}\n---\n${body}\n`;
  for (const newer of ["original", "kopie"] as const) {
    it(`ohne Entscheidung keine Schreibvorgänge, keine Bevorzugung nach dateModified (neuer: ${newer})`, async () => {
      const { repo, adapter } = setup();
      const old = "2026-10-01T10:00:00+02:00";
      const recent = "2026-10-11T10:00:00+02:00";
      adapter.tasks.set("A.md", { text: variant("Original", newer === "original" ? recent : old), mtime: newer === "original" ? 9 : 1 });
      adapter.tasks.set("A.sync-conflict-20261011-101010-ABCDEFG.md", {
        text: variant("Kopie", newer === "kopie" ? recent : old),
        mtime: newer === "kopie" ? 9 : 1,
      });
      adapter.tasks.set("B.md", { text: "---\ntitle: B\nstatus: open\n---\n", mtime: 1 });
      await repo.open();
      await repo.scan();
      await repo.perform("tasks/B.md", { type: "setPriority", priority: "high" });
      expect(adapter.writes).toBe(1); // nur die andere Datei
      const idx = repo.getState().index;
      expect(idx.conflicts).toHaveLength(1);
      // Primär ist unabhängig von dateModified/mtime die Datei ohne Konfliktnamen.
      expect(idx.conflicts[0]!.files.map((f) => f.name)).toEqual(["A.md", "A.sync-conflict-20261011-101010-ABCDEFG.md"]);
      const view = idx.tasks.find((t) => t.task.name === "A.md")!;
      expect(view.variants.map((v) => v.name)).toEqual(["A.sync-conflict-20261011-101010-ABCDEFG.md"]);
      expect(idx.tasks.some((t) => t.task.name.includes("sync-conflict"))).toBe(false);
      expect(adapter.tasks.size).toBe(3);
      expect(adapter.trash.size).toBe(0);
    });
  }
});

describe("AK-33: Konfliktvarianten auflösen", () => {
  const prepare = async () => {
    const s = setup();
    s.adapter.tasks.set("A.md", { text: `---\nid: ${ID}\ntitle: A\nstatus: open\n---\nOriginal\n`, mtime: 1 });
    s.adapter.tasks.set("A (Konflikt).md", { text: `---\nid: ${ID}\ntitle: A\nstatus: open\n---\nKopie\n`, mtime: 1 });
    await s.repo.open();
    return s;
  };
  it("beide behalten: verschiedene IDs, beide Dateien bleiben", async () => {
    const { repo, adapter } = await prepare();
    const r = await repo.keepBoth("tasks/A (Konflikt).md");
    expect(r.status).toBe("ok");
    await repo.scan();
    const ids = [...repo.getState().files.values()].map((f) => (f.kind === "task" ? f.fields.id : null));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain(ID);
    expect(repo.getState().index.conflicts).toHaveLength(0);
    expect(adapter.tasks.get("A.md")!.text).toContain("Original");
    expect(adapter.tasks.get("A (Konflikt).md")!.text).toContain("Kopie");
  });
  it("gewählte Variante inzwischen geändert: nichts in den Papierkorb", async () => {
    const { repo, adapter } = await prepare();
    const changed = `---\nid: ${ID}\ntitle: A\nstatus: open\n---\nOriginal, extern geändert\n`;
    adapter.external("A.md", changed);
    const r = await repo.keepVariant("tasks/A.md", ["tasks/A (Konflikt).md"]);
    expect(r.status).toBe("conflict");
    expect(adapter.trash.size).toBe(0);
    expect(adapter.tasks.get("A.md")!.text).toBe(changed);
    expect(adapter.tasks.get("A (Konflikt).md")!.text).toContain("Kopie");
    expect(adapter.writes).toBe(0);
  });
  it("Variante behalten: gewählte Datei byte-identisch, andere im Papierkorb", async () => {
    const { repo, adapter } = await prepare();
    const keep = adapter.tasks.get("A (Konflikt).md")!.text;
    expect((await repo.keepVariant("tasks/A (Konflikt).md", ["tasks/A.md"])).status).toBe("ok");
    expect(adapter.tasks.get("A (Konflikt).md")!.text).toBe(keep);
    expect(adapter.tasks.has("A.md")).toBe(false);
    expect(adapter.trash.get("A.md")!.text).toContain("Original");
  });
});

describe("AK-34: fehlende Metadaten erzwingen Lesen", () => {
  it("Teilabgleich liest alle Dateien ohne mtime/size", async () => {
    const { repo, adapter } = setup();
    adapter.unknownMeta = true;
    for (let i = 0; i < 5; i++) adapter.tasks.set(`A${i}.md`, { text: `---\ntitle: A${i}\n---\n`, mtime: 1 });
    await repo.open();
    adapter.tasks.set("A3.md", { text: "---\ntitle: B3\n---\n", mtime: 1 });
    await repo.scan({ full: false });
    expect(repo.getState().lastScan).toMatchObject({ full: false, read: 5, files: 5 });
    const f = repo.getState().files.get("tasks/A3.md")!;
    expect(f.kind === "task" && f.fields.title).toBe("B3");
    expect(adapter.writes).toBe(0);
  });
  it("mit Metadaten liest der Teilabgleich nur Geändertes", async () => {
    const { repo, adapter } = setup();
    for (let i = 0; i < 5; i++) adapter.tasks.set(`A${i}.md`, { text: `---\ntitle: A${i}\n---\n`, mtime: 1 });
    await repo.open();
    adapter.external("A3.md", "---\ntitle: B3 länger\n---\n");
    await repo.scan({ full: false });
    expect(repo.getState().lastScan).toMatchObject({ full: false, read: 1 });
  });
});

describe("AK-38: aufwendige und unmögliche Regeln über das Repository", () => {
  it("Diagnose statt Serienende, 0 Schreibvorgänge", async () => {
    const { repo, adapter } = setup();
    // gültig, aber ohne Termin im Suchhorizont
    const impossible = serie().replace("FREQ=WEEKLY;BYDAY=MO", "FREQ=YEARLY;BYMONTH=1;BYYEARDAY=200");
    adapter.tasks.set("S.md", { text: impossible, mtime: 1 });
    adapter.tasks.set("P.md", { text: `---\nid: 01K7C9V3QH2T8M4N6P0R5S1W9Y\ntitle: P\nstatus: open\n---\n`, mtime: 1 });
    await repo.open();
    for (const type of ["completeOccurrence", "skipOccurrence"] as const) {
      const r = await repo.perform("tasks/S.md", { type, revision: "R1", instance: "2026-10-12" });
      expect(r.status).toBe("blocked");
      if (r.status === "blocked") expect(r.message).toMatch(/aufwendig/);
    }
    const spec = { rule: "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", anchor: "calendar" as const, field: "due" as const, start: "2026-10-12", offsetDays: null };
    expect((await repo.perform("tasks/P.md", { type: "createSeries", spec })).status).toBe("blocked");
    const both = { ...spec, rule: "FREQ=DAILY;COUNT=2;UNTIL=20261231" };
    const r = await repo.perform("tasks/P.md", { type: "createSeries", spec: both });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.message).toMatch(/COUNT und UNTIL/);
    expect(adapter.writes).toBe(0);
    expect(adapter.tasks.get("S.md")!.text).toBe(impossible);
    const v = repo.getState().index.tasks.find((t) => t.task.name === "S.md")!;
    expect(v.task.fields.status).toBe("open");
  });
});
