// Müllabfuhr-Import (4.7): ICS-Einleser, Vorschau und Übernehmen über das Repository (AK-46).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clockAtLocal, readSeries, todayView, wasteView, type Clock } from "@markdoist/core";
import {
  applyWasteImport,
  describeWasteEffect,
  MemoryAdapter,
  MemoryKeyValueStore,
  parseIcs,
  readWasteFile,
  reassignWasteRow,
  Repository,
  suggestWasteName,
  wasteImportMessage,
  wasteRows,
} from "../src";

const TZ = "Europe/Berlin";
const FIXTURE = readFileSync(new URL("./fixtures/abfuhr-2026.ics", import.meta.url), "utf8");

// Echter Zufall: Bei fester Testuhr hängen eindeutige IDs allein am Zufallsteil der ULID.
function setup(at: string) {
  const adapter = new MemoryAdapter();
  let clock: Clock = clockAtLocal(at, TZ);
  const repo = new Repository({
    adapter,
    kv: new MemoryKeyValueStore(),
    folder: "test",
    clock: () => clock,
    random: (b) => {
      crypto.getRandomValues(b);
    },
  });
  return { repo, adapter, setNow: (local: string) => (clock = clockAtLocal(local, TZ)) };
}

/** Folgedatei des Anbieters: neue UIDs, ein verlegter Termin, Termine im neuen Jahr. */
function followUp(): string {
  return FIXTURE.replace(/UID:1700000000000-/g, "UID:1800000000000-")
    .replace("DTSTART;VALUE=DATE:20261211", "DTSTART;VALUE=DATE:20261212")
    .replace(
      "END:VCALENDAR",
      [
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20270108",
        "SUMMARY;LANGUAGE=de:Restabfallbehaelter  120 l",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20270107",
        "SUMMARY;LANGUAGE=de:Papierbehaelter  240 l",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
}

describe("ICS einlesen (4.7)", () => {
  it("Nachbildung der Vorlage: 10 Termine in 4 Arten, Zeitraum", () => {
    const f = readWasteFile(FIXTURE, TZ);
    expect(f.groups.map((g) => [g.key, g.dates.length])).toEqual([
      ["Bioabfallbehaelter 80 l", 5],
      ["Leichtverpackungen 110 l", 2],
      ["Restabfallbehaelter 120 l", 2],
      ["Papierbehaelter 240 l", 1],
    ]);
    expect(f.range).toEqual({ from: "2026-10-29", to: "2026-12-19" });
    expect({ withRule: f.withRule, cancelled: f.cancelled, unreadable: f.unreadable }).toEqual({ withRule: 0, cancelled: 0, unreadable: 0 });
  });

  it("Escapes, gefaltete Zeilen, VALARM, abgesagte und Regel-Termine, Uhrzeiten", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20270105",
      "SUMMARY:Gelber Sack\\, gr",
      " oß",
      "BEGIN:VALARM",
      "TRIGGER:-PT12H",
      "DESCRIPTION:Erinnerung",
      "SUMMARY:Alarm",
      "END:VALARM",
      "DESCRIPTION:Hinweis\\nwird nicht übernommen",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;TZID=America/New_York:20270105T233000",
      "SUMMARY:Spät",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART:20270105T230000Z",
      "SUMMARY:UTC",
      "END:VEVENT",
      "BEGIN:VEVENT",
      'DTSTART;TZID="W. Europe Standard Time":20270105T070000',
      "SUMMARY:Windowszone",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20270106",
      "SUMMARY:Abgesagt",
      "STATUS:CANCELLED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20270106",
      "RRULE:FREQ=WEEKLY",
      "SUMMARY:Regel",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:Ohne Datum",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const p = parseIcs(text, TZ);
    expect(p.events).toEqual([
      { summary: "Gelber Sack, groß", date: "2027-01-05" },
      { summary: "Spät", date: "2027-01-06" },
      { summary: "UTC", date: "2027-01-06" },
      { summary: "Windowszone", date: "2027-01-05" },
    ]);
    expect([p.cancelled, p.withRule, p.unreadable]).toEqual([1, 1, 1]);
  });

  it("Namensvorschlag ohne Behältergröße", () => {
    expect(suggestWasteName("Bioabfallbehaelter 80 l")).toBe("Bioabfallbehaelter");
    expect(suggestWasteName("Restmüll 1.100 Liter")).toBe("Restmüll");
    expect(suggestWasteName("Gelber Sack")).toBe("Gelber Sack");
  });
});

describe("AK-46: Import über das Repository", () => {
  it("legt 4 Serien an, zweiter Import schreibt nichts, Folgedatei ergänzt, verlegt und setzt fort", async () => {
    const { repo, adapter, setNow } = setup("2026-10-28T19:10");
    await repo.open();
    const file = readWasteFile(FIXTURE, TZ);
    let rows = wasteRows(file, repo.getState().index, repo.previewContext());
    expect(rows.map((r) => [r.name, describeWasteEffect(r.effect), r.include])).toEqual([
      ["Bioabfallbehaelter", "neu, 5 Termine", true],
      ["Leichtverpackungen", "neu, 2 Termine", true],
      ["Restabfallbehaelter", "neu, 2 Termine", true],
      ["Papierbehaelter", "neu, 1 Termin", true],
    ]);
    const names = ["Biotonne", "Gelber Sack", "Restmüll", "Papier"];
    rows = rows.map((r, i) => ({ ...r, name: names[i]! }));
    const result = await applyWasteImport(repo, rows, file, 7);
    expect(wasteImportMessage(result)).toBe("Kalender importiert: 4 Abfuhrarten, 10 Termine");

    expect([...adapter.tasks.keys()].sort()).toEqual(["Biotonne.md", "Gelber Sack.md", "Papier.md", "Restmüll.md"]);
    const rest = adapter.tasks.get("Restmüll.md")!.text;
    expect(rest).toMatch(/^format_version: 2$/m);
    expect(rest).toMatch(/^inbox: false$/m);
    expect(rest).toMatch(/^due: 2026-11-13$/m);
    expect(rest).toMatch(/^scheduled: 2026-11-06$/m);
    expect(rest).toMatch(/^recurrence_offset_days: -7$/m);
    expect(rest).toMatch(/^waste_type: Restabfallbehaelter 120 l$/m);
    expect(rest).toMatch(/recurrence_dates:\n {2}- 2026-11-13\n {2}- 2026-12-11\n/);
    // Der Bereitstellhinweis der Termine (DESCRIPTION) wird nicht übernommen: Body leer.
    expect(rest.endsWith("---\n")).toBe(true);
    for (const { text } of adapter.tasks.values()) expect(text).not.toMatch(/MUSTERWEG|BEISPIELORT|Muellsammelgefaesse/);

    const idx = repo.getState().index;
    expect(wasteView(idx).map((e) => [e.view.task.fields.title, e.next?.toString()])).toEqual([
      ["Biotonne", "2026-10-29"],
      ["Gelber Sack", "2026-11-13"],
      ["Restmüll", "2026-11-13"],
      ["Papier", "2026-12-03"],
    ]);
    // Biotonne am 29.10.: geplant seit dem 22.10.
    expect(todayView(idx, TZ).plannedEarlier.map((v) => v.task.fields.title)).toEqual(["Biotonne"]);

    // Zweiter Import derselben Datei: keine Änderung, kein Schreibvorgang.
    const writes = adapter.writes;
    const again = wasteRows(readWasteFile(FIXTURE, TZ), repo.getState().index, repo.previewContext());
    expect(again.map((r) => describeWasteEffect(r.effect))).toEqual(Array(4).fill("keine Änderung"));
    expect(again.every((r) => !r.include)).toBe(true);
    await applyWasteImport(repo, again, readWasteFile(FIXTURE, TZ), 7);
    expect(adapter.writes).toBe(writes);

    // Papier abholen lassen: Die Liste ist ausgeschöpft, die Serie endet.
    setNow("2026-12-03T08:00");
    const papier = repo.getState().index.tasks.find((v) => v.task.fields.title === "Papier")!;
    const done = await repo.perform(papier.task.ref, {
      type: "completeOccurrence",
      revision: papier.series!.revisionKey,
      instance: "2026-12-03",
    });
    expect(done.status).toBe("ok");
    expect(adapter.tasks.get("Papier.md")!.text).toMatch(/^status: done$/m);

    // Folgedatei am 05.12.: neue UIDs, Restmüll 11.12. → 12.12., Termine im Januar.
    setNow("2026-12-05T10:00");
    const next = readWasteFile(followUp(), TZ);
    const rows2 = wasteRows(next, repo.getState().index, repo.previewContext());
    expect(Object.fromEntries(rows2.map((r) => [r.name, describeWasteEffect(r.effect)]))).toEqual({
      Biotonne: "keine Änderung",
      "Gelber Sack": "keine Änderung",
      Restmüll: "+2 Termine, 1 Termin verlegt",
      Papier: "wird fortgesetzt, +1 Termin",
    });
    const r2 = await applyWasteImport(repo, rows2, next, 7);
    expect(wasteImportMessage(r2)).toBe("Kalender importiert: 2 Abfuhrarten, 3 Termine");
    const rest2 = adapter.tasks.get("Restmüll.md")!.text;
    expect(rest2).toMatch(/recurrence_dates:\n {2}- 2026-11-13\n {2}- 2026-12-12\n {2}- 2027-01-08\n/);
    const papier2 = adapter.tasks.get("Papier.md")!.text;
    expect(papier2).toMatch(/^status: open$/m);
    expect(papier2).toMatch(/^recurrence_instance: 2027-01-07$/m);
    expect(papier2).toMatch(/^scheduled: 2026-12-31$/m);
    expect(papier2).not.toMatch(/completedDate/);
    expect(papier2).toMatch(/complete_instances:\n {2}- 2026-12-03\n/);
  });

  it("geänderter Schlüssel lässt sich einer bestehenden Serie zuordnen", async () => {
    const { repo, adapter } = setup("2026-10-28T19:10");
    await repo.open();
    const file = readWasteFile(FIXTURE, TZ);
    await applyWasteImport(repo, wasteRows(file, repo.getState().index, repo.previewContext()), file, 7);
    const bigger = readWasteFile(followUp().replace(/Restabfallbehaelter {2}120 l/g, "Restabfallbehaelter  240 l"), TZ);
    let rows = wasteRows(bigger, repo.getState().index, repo.previewContext());
    const row = rows.find((r) => r.group.key === "Restabfallbehaelter 240 l")!;
    expect(row.target).toBeNull();
    expect(describeWasteEffect(row.effect)).toBe("neu, 3 Termine");
    const old = repo.getState().index.tasks.find((v) => v.task.fields.title === "Restabfallbehaelter")!;
    rows = rows.map((r) => (r === row ? reassignWasteRow(r, old, bigger, repo.previewContext()) : r));
    const assigned = rows.find((r) => r.group.key === "Restabfallbehaelter 240 l")!;
    expect(describeWasteEffect(assigned.effect)).toBe("+2 Termine, 1 Termin verlegt");
    await applyWasteImport(repo, rows, bigger, 7);
    const text = adapter.tasks.get("Restabfallbehaelter.md")!.text;
    expect(text).toMatch(/^waste_type: Restabfallbehaelter 240 l$/m);
    expect([...adapter.tasks.keys()].filter((k) => k.startsWith("Restabfall"))).toEqual(["Restabfallbehaelter.md"]);
  });

  it("seit der Vorschau geänderte Datei wird nicht überschrieben", async () => {
    const { repo, adapter } = setup("2026-10-28T19:10");
    await repo.open();
    const file = readWasteFile(FIXTURE, TZ);
    await applyWasteImport(repo, wasteRows(file, repo.getState().index, repo.previewContext()), file, 7);
    const next = readWasteFile(followUp(), TZ);
    const rows = wasteRows(next, repo.getState().index, repo.previewContext());
    const external = adapter.tasks.get("Restabfallbehaelter.md")!.text.replace("priority: none", "priority: high");
    adapter.external("Restabfallbehaelter.md", external);
    const r = await applyWasteImport(repo, rows, next, 7);
    expect(r.failures.map((f) => f.name)).toEqual(["Restabfallbehaelter"]);
    expect(adapter.tasks.get("Restabfallbehaelter.md")!.text).toBe(external);
    // Die übrigen Arten werden übernommen.
    expect(adapter.tasks.get("Papierbehaelter.md")!.text).toMatch(/- 2027-01-07/);
    expect(readSeries(repo.getState().index.tasks.find((v) => v.task.fields.title === "Papierbehaelter")!.task)!.phase).toBe("active");
  });
});
