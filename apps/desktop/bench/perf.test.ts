// M7/AK-40: Leistung mit 2 000 Aufgaben à höchstens 4 KiB (Desktop, echter FsAdapter).
// Ausführen: pnpm exec vitest run --config apps/desktop/bench/vitest.bench.config.ts
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clockAtLocal, search, todayView } from "@markdoist/core";
import { MemoryKeyValueStore, Repository } from "@markdoist/app";
import { FsAdapter } from "../src/main/fsAdapter";

const N = 2000;
const words = ["Zahnarzt", "Steuer", "Bettwäsche", "Einkauf", "Projekt", "Rückblick", "Garten", "Rechnung", "Auto", "Urlaub"];

function taskText(i: number): string {
  const due = `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
  const lines = [
    "---",
    `id: 01K7C9V3QH2T8M4N6P${String(i).padStart(8, "0")}`,
    "format_version: 1",
    `title: ${words[i % words.length]} Aufgabe ${i}`,
    `status: ${i % 5 === 0 ? "done" : "open"}`,
    `priority: ${["none", "low", "normal", "high"][i % 4]}`,
    `inbox: ${i % 3 === 0}`,
    `due: ${due}`,
    ...(i % 7 === 0 ? ["recurrence: FREQ=WEEKLY;BYDAY=MO", "recurrence_start: 2026-01-05", `recurrence_instance: ${due}`] : []),
    "dateCreated: 2026-10-01T08:00:00+02:00",
    "---",
  ];
  let body = "";
  while (body.length < 3000) body += `- [ ] Schritt ${body.length} für ${words[(i + body.length) % words.length]}\n`;
  return `${lines.join("\n")}\n${body}`;
}

describe("Leistung 2 000 Dateien (Desktop)", () => {
  it("misst Vollscan, Cache-Anzeige und Suche", async () => {
    const base = await mkdtemp(join(tmpdir(), "markdoist-perf-"));
    const folder = join(base, "A");
    await mkdir(folder);
    for (let i = 0; i < N; i++) await writeFile(join(folder, `Aufgabe ${i}.md`), taskText(i));
    const kv = new MemoryKeyValueStore();
    const clock = () => clockAtLocal("2026-10-12T10:00", "Europe/Berlin");
    const mk = () => new Repository({ adapter: new FsAdapter(folder, join(base, "j")), kv, folder, clock });

    let t = performance.now();
    const r1 = mk();
    await r1.open();
    const fullScan = performance.now() - t;
    expect(r1.getState().files.size).toBe(N);

    // Cache-Anzeige: zweiter Start, Zeit bis der Index aus dem Cache steht (vor dem Abgleich).
    const r2 = mk();
    t = performance.now();
    let cacheShown = 0;
    const unsub = r2.subscribe(() => {
      if (!cacheShown && r2.getState().files.size === N) cacheShown = performance.now() - t;
    });
    await r2.open();
    unsub();

    const idx = r2.getState().index;
    t = performance.now();
    const hits = search(idx, "bettwasche schritt");
    const searchMs = performance.now() - t;
    t = performance.now();
    todayView(idx, "Europe/Berlin");
    const todayMs = performance.now() - t;

    const result = { N, fullScanMs: Math.round(fullScan), cacheShownMs: Math.round(cacheShown), searchMs: +searchMs.toFixed(1), todayMs: +todayMs.toFixed(1), hits: hits.length };
    console.log(`MARKDOIST_PERF ${JSON.stringify(result)}`);
    expect(cacheShown).toBeLessThan(2000);
    expect(searchMs).toBeLessThan(100);
    await rm(base, { recursive: true, force: true });
  }, 120_000);
});
