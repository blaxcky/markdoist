// Selbstprüfung vor dem Schreiben neuer Frontmatter (Plan 7.2): create() und adopt().
import { describe, expect, it, vi } from "vitest";

const broken = vi.hoisted(() => ({ create: false, adopt: false }));

vi.mock("@markdoist/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@markdoist/core")>();
  return {
    ...core,
    newTaskText: (...args: Parameters<typeof core.newTaskText>) => {
      const r = core.newTaskText(...args);
      // fehlerhafter Generator: Eingang fällt weg
      return broken.create ? { ...r, text: r.text.replace("inbox: true\n", "") } : r;
    },
    adoptFileText: (...args: Parameters<typeof core.adoptFileText>) => {
      const t = core.adoptFileText(...args);
      // fehlerhafter Generator: Body wird verändert
      return broken.adopt ? t.replace("Inhalt", "Inhalt verändert") : t;
    },
  };
});

const { clockAtLocal } = await import("@markdoist/core");
const { MemoryAdapter, MemoryKeyValueStore, Repository } = await import("../src");

function setup() {
  const adapter = new MemoryAdapter();
  const repo = new Repository({
    adapter,
    kv: new MemoryKeyValueStore(),
    folder: "t",
    clock: () => clockAtLocal("2026-10-12T10:00", "Europe/Berlin"),
  });
  return { adapter, repo };
}

describe("Selbstprüfung (7.2)", () => {
  it("create schreibt nur einen Text, der als erwartete Aufgabe gelesen wird", async () => {
    const { adapter, repo } = setup();
    await repo.open();
    broken.create = true;
    const r = await repo.create({ title: "Zahnarzt: Termin?", note: "Notiz", due: "2026-10-14" });
    broken.create = false;
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.message).toMatch(/Selbstprüfung.*inbox/);
    expect(adapter.writes).toBe(0);
    expect(adapter.tasks.size).toBe(0);
    const ok = await repo.create({ title: "Zahnarzt: Termin?", note: "Notiz", due: "2026-10-14", scheduled: "2026-10-13T09:30" });
    expect(ok.status).toBe("ok");
    expect(adapter.writes).toBe(1);
  });
  it("Sonderfälle im Titel bestehen die Prüfung", async () => {
    const { repo } = setup();
    await repo.open();
    for (const title of ["123", "true", "null", "- Liste", "# Kommentar?", "a: b", "„Zitat“ 'x' \"y\"", "[Klammer]"]) {
      const r = await repo.create({ title });
      expect(r.status, title).toBe("ok");
    }
  });
  it("adopt schreibt nicht, wenn der erzeugte Text den Body verändert", async () => {
    const { adapter, repo } = setup();
    adapter.tasks.set("roh.md", { text: "﻿Inhalt\r\nZeile 2", mtime: 1 });
    await repo.open();
    broken.adopt = true;
    const r = await repo.adopt("tasks/roh.md");
    broken.adopt = false;
    expect(r.status).toBe("error");
    expect(adapter.writes).toBe(0);
    expect(adapter.tasks.get("roh.md")!.text).toBe("﻿Inhalt\r\nZeile 2");
    expect((await repo.adopt("tasks/roh.md")).status).toBe("ok");
    const text = adapter.tasks.get("roh.md")!.text;
    expect(text.startsWith("﻿---\r\n")).toBe(true);
    expect(text.endsWith("---\r\nInhalt\r\nZeile 2")).toBe(true);
  });
});
