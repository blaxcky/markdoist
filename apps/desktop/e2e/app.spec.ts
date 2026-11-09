// Desktop-E2E (M4): echte Electron-App gegen einen temporären Aufgabenordner, Testuhr 12.10.2026.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const appDir = join(__dirname, "..");
// Fenster bleiben verborgen; MARKDOIST_E2E_SHOW=1 zeigt sie zum Zuschauen.
const hide = process.env.MARKDOIST_E2E_SHOW ? {} : { MARKDOIST_TEST_HIDDEN: "1" };
let base: string;
let folder: string;
let app: ElectronApplication;
let page: Page;

const fm = (lines: string[], body = "") => `---\n${lines.join("\n")}\n---\n${body}`;

async function seed() {
  await writeFile(
    join(folder, "Zahnarzt.md"),
    fm(["id: 01K7C9V3QH2T8M4N6P0R5S1W9X", "format_version: 1", "title: Zahnarzttermin vereinbaren", "status: open", "priority: none", "inbox: true", "due: 2026-10-12", "dateCreated: 2026-10-10T08:00:00+02:00", "dateModified: 2026-10-10T08:00:00+02:00"], "Praxis anrufen.\n"),
  );
  await writeFile(
    join(folder, "Bettwäsche.md"),
    fm(["id: 01K6B2N8R4T6V8X0Z2C4E6G8J0", "format_version: 1", "title: Bettwäsche wechseln", "status: open", "priority: low", "inbox: false", "scheduled: 2026-10-12", "dateCreated: 2026-10-01T08:00:00+02:00"], "- [x] Bezüge\n- [ ] Laken\n"),
  );
  await writeFile(
    join(folder, "Wochenrückblick.md"),
    fm([
      "id: 01K69X4D2M7Q0B5T8V3W6Y1Z4C",
      "format_version: 1",
      "title: Wochenrückblick",
      "status: open",
      "priority: normal",
      "inbox: false",
      "due: 2026-10-12",
      "recurrence: FREQ=WEEKLY;BYDAY=MO",
      "recurrence_revision: 01K69X4D2M7Q0B5T8V3W6Y1Z4D",
      "recurrence_start: 2026-10-05",
      "recurrence_anchor: calendar",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-12",
      "complete_instances: [2026-10-05]",
    ]),
  );
  await writeFile(
    join(folder, "Packliste.md"),
    fm(["id: 01K7LISTE0000000000000000P", "format_version: 1", "title: Packliste Urlaub", "kind: list", "status: open", "inbox: false", "dateModified: 2026-10-11T08:00:00+02:00"], "- [ ] Zahnbürste\n- [x] Pass\n- [ ] Ladekabel\n"),
  );
  await writeFile(join(folder, "Kaputt.md"), "---\ntitle: [\n---\n");
  await writeFile(join(folder, "Notiz ohne Frontmatter.md"), "# Nur Text\n");
  await mkdir(join(folder, "Unterordner"));
  await writeFile(join(folder, "Unterordner", "Versteckt.md"), fm(["title: Unterordneraufgabe"]));
}

test.beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "markdoist-e2e-"));
  folder = join(base, "Aufgaben");
  await mkdir(folder);
  await seed();
  app = await electron.launch({
    args: [join(appDir, "out/main/index.js")],
    env: {
      ...process.env,
      ...hide,
      MARKDOIST_FOLDER: folder,
      MARKDOIST_DATA_DIR: join(base, "data"),
      MARKDOIST_TEST_NOW: "2026-10-12T10:00",
      MARKDOIST_TEST_TZ: "Europe/Berlin",
    },
  });
  page = await app.firstWindow();
  await page.getByTestId("list").waitFor();
  await expect(page.getByText(/wird geprüft/)).toHaveCount(0);
});

test.afterEach(async () => {
  await app.close();
  await rm(base, { recursive: true, force: true });
});

const row = (title: string) => page.locator(`[data-testid=task-row][data-title="${title}"]`);
const file = (name: string) => readFile(join(folder, name), "utf8");

test("Heute zeigt Fällig und Geplant; Unterordner wird nicht eingelesen (AK-28)", async () => {
  await expect(page.getByTestId("section-0")).toContainText("Zahnarzttermin vereinbaren");
  await expect(page.getByTestId("section-0")).toContainText("Wochenrückblick");
  await expect(page.getByTestId("section-1")).toContainText("Bettwäsche wechseln");
  await page.getByTestId("search").fill("Unterordneraufgabe");
  await expect(page.getByText("Keine Treffer.")).toBeVisible();
});

test("Erfassung aus Heute landet im Eingang ohne Termin (AK-01)", async () => {
  await page.keyboard.press("n");
  // Lange Titel brechen um und bleiben ganz sichtbar; eingefügte Zeilenumbrüche werden zu Leerzeichen, Enter erfasst.
  const title = page.getByTestId("capture-title");
  const oneLine = (await title.boundingBox())!.height;
  await title.fill("Sehr lange Aufgabe ".repeat(12));
  expect((await title.boundingBox())!.height).toBeGreaterThan(oneLine * 1.5);
  await title.fill("Steuer: Belege\nsammeln?");
  await expect(title).toHaveValue("Steuer: Belege sammeln?");
  await title.press("Enter");
  // Neuanlage landet im Verlauf, nicht in einer Meldung (4.4).
  await expect.poll(() => file("Steuer Belege sammeln.md").catch(() => "")).toContain("inbox: true");
  await expect(page.getByTestId("toast")).toHaveCount(0);
  const text = await file("Steuer Belege sammeln.md");
  expect(text).toContain("inbox: true");
  expect(text).toContain("title: \"Steuer: Belege sammeln?\"");
  expect(text).not.toMatch(/^due:|^scheduled:/m);
  await expect(row("Steuer: Belege sammeln?")).toHaveCount(0); // nicht in Heute
  await page.getByTestId("nav-inbox").click();
  await expect(row("Steuer: Belege sammeln?")).toBeVisible();
});

test("Frist setzen: Heute und Geplant statt Eingang, inbox bleibt (AK-02)", async () => {
  await page.getByTestId("capture-button").click();
  await page.getByTestId("capture-title").fill("Neue Frist");
  await page.getByTestId("capture-edit").click();
  await page.getByTestId("field-due").fill("2026-10-12");
  await expect(row("Neue Frist")).toBeVisible();
  // Das Kopier-Icon gibt es nur bei Programmier-Einträgen (4.8).
  await expect(page.getByTestId("copy-item")).toHaveCount(0);
  const text = await file("Neue Frist.md");
  expect(text).toContain("due: 2026-10-12");
  expect(text).toContain("inbox: true");
  // Erstes Escape verlässt das Datumsfeld, zweites schließt das Detail.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("detail")).toHaveCount(0);
  await page.getByTestId("nav-inbox").click();
  await expect(row("Neue Frist")).toHaveCount(0);
  await page.getByTestId("nav-planned").click();
  await expect(page.locator(".section", { hasText: "Heute" }).first()).toBeVisible();
  await expect(row("Neue Frist")).toBeVisible();
  await page.getByTestId("nav-today").click();
  await expect(row("Neue Frist")).toBeVisible();
});

test("Erledigen per Leertaste und Aufgaben-Undo stellt exakt wieder her", async () => {
  const before = await file("Zahnarzt.md");
  await row("Zahnarzttermin vereinbaren").click();
  await page.keyboard.press(" ");
  await expect.poll(() => file("Zahnarzt.md")).toContain("status: done");
  await page.keyboard.press("Control+z");
  await expect.poll(() => file("Zahnarzt.md")).toBe(before);
});

test("Abhaken per Klick: Haken sofort, Zeile blendet aus, Rückgängig über den Verlauf", async () => {
  const r = row("Zahnarzttermin vereinbaren");
  const check = r.getByRole("checkbox");
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "true");
  await expect(r).toHaveCount(0);
  await expect.poll(() => file("Zahnarzt.md")).toContain("status: done");
  await expect(page.getByTestId("toast")).toHaveCount(0);
  await page.getByTestId("nav-history").click();
  const h = page.locator('[data-testid=history-row][data-title="Zahnarzttermin vereinbaren"]');
  await expect(h).toContainText("Erledigt");
  await h.getByTestId("history-undo").click();
  await expect(h).toContainText("Zurückgenommen");
  await expect(h.getByTestId("history-undo")).toHaveCount(0);
  await page.getByTestId("nav-today").click();
  await expect(row("Zahnarzttermin vereinbaren")).toBeVisible();
  await expect(row("Zahnarzttermin vereinbaren").getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
});

test("Haken trifft auch knapp neben dem Kreis, der Titel daneben wählt nur aus", async () => {
  const r = row("Zahnarzttermin vereinbaren");
  const check = r.getByRole("checkbox");
  // Titelbeginn: Klick dort öffnet nur das Detail, hakt nicht ab.
  await r.locator(".title").click({ position: { x: 2, y: 10 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(check).toHaveAttribute("aria-checked", "false");
  const box = (await check.boundingBox())!;
  // 5 px links unterhalb des Kreises liegt noch in der unsichtbaren Klickfläche.
  await page.mouse.click(box.x - 5, box.y + box.height + 5);
  await expect.poll(() => file("Zahnarzt.md")).toContain("status: done");
});

test("Priorität ändert nur priority und dateModified (AK-07)", async () => {
  const before = await file("Zahnarzt.md");
  await row("Zahnarzttermin vereinbaren").click();
  await page.getByTestId("field-priority").selectOption("high");
  await expect.poll(() => file("Zahnarzt.md")).toContain("priority: high");
  const after = await file("Zahnarzt.md");
  const strip = (s: string) => s.replace(/priority: \w+\n/, "").replace(/dateModified: .*\n/, "");
  expect(strip(after)).toBe(strip(before));
});

test("Tastenbefehle wirken nicht im Eingabefeld (AK-43)", async () => {
  const before = await file("Zahnarzt.md");
  await row("Zahnarzttermin vereinbaren").click();
  await page.getByTestId("field-title").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" e d");
  await page.keyboard.press("Escape");
  expect(await file("Zahnarzt.md")).toBe(before);
});

test("Suche ignoriert Umlaute (AK-25)", async () => {
  await page.getByTestId("search").fill("bettwasche");
  await expect(row("Bettwäsche wechseln")).toBeVisible();
  await page.getByTestId("search").fill("PRAXIS");
  await expect(row("Zahnarzttermin vereinbaren")).toBeVisible();
});

test("Serie: Vorkommen erledigen schreibt nächsten Termin", async () => {
  await row("Wochenrückblick").click();
  await page.getByTestId("series-complete").click();
  await expect.poll(() => file("Wochenrückblick.md")).toContain("due: 2026-10-19");
  const t = await file("Wochenrückblick.md");
  expect(t).toContain("  - 2026-10-12");
  expect(t).toContain("inbox: false");
});

test("Wiederholung anlegen: wöchentlich 5-mal mit Vorschau", async () => {
  await row("Zahnarzttermin vereinbaren").click();
  await page.getByTestId("edit-recurrence").click();
  await page.getByTestId("rec-end").selectOption("count");
  await page.getByTestId("rec-count").fill("5");
  await expect(page.getByTestId("rec-preview")).toContainText("wöchentlich am Mo, 5-mal");
  await expect(page.getByTestId("rec-preview")).toContainText("Mo 09.11.2026");
  await page.getByTestId("rec-save").click();
  await expect.poll(() => file("Zahnarzt.md")).toContain("recurrence: FREQ=WEEKLY;BYDAY=MO;COUNT=5");
});

test("Probleme: ungültige Datei und Übernahme ohne Frontmatter (AK-09)", async () => {
  await page.getByTestId("nav-problems").click();
  await expect(page.getByTestId("problem-file")).toHaveCount(2);
  const before = await file("Kaputt.md");
  await page.getByRole("button", { name: "Als Aufgabe übernehmen" }).click();
  await expect.poll(() => file("Notiz ohne Frontmatter.md")).toContain("title: Notiz ohne Frontmatter");
  expect(await file("Notiz ohne Frontmatter.md")).toMatch(/---\n# Nur Text\n$/);
  expect(await file("Kaputt.md")).toBe(before);
});

test("Löschen und Wiederherstellen (AK-24)", async () => {
  const before = await file("Zahnarzt.md");
  await row("Zahnarzttermin vereinbaren").click();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await readdir(folder)).includes("Zahnarzt.md")).toBe(false);
  expect(await readFile(join(folder, ".todo-trash", "Zahnarzt.md"), "utf8")).toBe(before);
  await page.getByTestId("nav-trash").click();
  await page.getByRole("button", { name: "Wiederherstellen" }).click();
  await expect.poll(() => file("Zahnarzt.md")).toBe(before);
});

test("Notiz bearbeiten: Autosave und Checkbox in der Vorschau", async () => {
  await page.getByTestId("nav-all").click();
  await row("Bettwäsche wechseln").click();
  await page.getByTestId("tab-preview").click();
  await page.locator(".md-check").nth(1).click();
  await expect.poll(() => file("Bettwäsche.md")).toContain("- [x] Laken");
  await page.getByRole("tab", { name: "Bearbeiten" }).click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Neue Zeile");
  await expect(page.getByTestId("save-state")).toHaveText("Gespeichert", { timeout: 5000 });
  expect(await file("Bettwäsche.md")).toContain("Neue Zeile");
});

test("Konfliktkopie: Variante behalten (AK-33)", async () => {
  const orig = await file("Zahnarzt.md");
  await writeFile(join(folder, "Zahnarzt.sync-conflict-20261012-101010-ABCDEFG.md"), orig.replace("priority: none", "priority: high"));
  await page.getByTestId("rescan").click();
  await page.getByTestId("nav-problems").click();
  await page.getByTestId("open-conflict").click();
  await page.getByTestId("keep-variant").first().click();
  await expect.poll(async () => (await readdir(folder)).filter((n) => n.startsWith("Zahnarzt"))).toEqual(["Zahnarzt.md"]);
  expect(await file("Zahnarzt.md")).toBe(orig);
  expect((await readdir(join(folder, ".todo-trash"))).length).toBe(1);
});

test("Externe Änderung wird per Watcher erkannt (7.1)", async () => {
  await writeFile(join(folder, "Extern.md"), fm(["id: 01K7C9V3QH2T8M4N6P0R5S1EXT", "title: Extern angelegt", "status: open", "inbox: true"]));
  await page.getByTestId("nav-inbox").click();
  await expect(row("Extern angelegt")).toBeVisible({ timeout: 5000 });
});

test("Externer Body + lokale Priorität bleiben beide erhalten (AK-10)", async () => {
  await row("Zahnarzttermin vereinbaren").click();
  const orig = await file("Zahnarzt.md");
  // Externe Änderung am Body, ohne dass die App sie vorher eingelesen haben muss.
  await writeFile(join(folder, "Zahnarzt.md"), orig.replace("Praxis anrufen.", "Praxis anrufen – extern ergänzt."));
  await page.getByTestId("field-priority").selectOption("high");
  await expect.poll(() => file("Zahnarzt.md")).toContain("priority: high");
  expect(await file("Zahnarzt.md")).toContain("extern ergänzt");
});

test("Gleiche Frist extern und lokal geändert → Konflikt, nichts überschrieben (AK-10)", async () => {
  await row("Zahnarzttermin vereinbaren").click();
  const orig = await file("Zahnarzt.md");
  const ext = orig.replace("due: 2026-10-12", "due: 2026-10-19");
  await writeFile(join(folder, "Zahnarzt.md"), ext);
  await page.getByTestId("field-due").fill("2026-10-16");
  await expect(page.getByTestId("toast")).toContainText(/geändert|Konflikt/);
  expect(await file("Zahnarzt.md")).toBe(ext);
});

test("Dialoge: Fokus beim Öffnen, Escape schließt, keine Aufgabenkürzel im Dialog (4.5)", async () => {
  await row("Zahnarzttermin vereinbaren").click();
  await page.getByTestId("edit-recurrence").click();
  await expect(page.getByTestId("recurrence-editor")).toBeVisible();
  const focused = await page.evaluate(() => document.activeElement?.closest("[data-testid=recurrence-editor]") !== null);
  expect(focused).toBe(true);
  const before = await file("Zahnarzt.md");
  await page.keyboard.press("n");
  await expect(page.getByTestId("capture")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("recurrence-editor")).toHaveCount(0);
  expect(await file("Zahnarzt.md")).toBe(before);
});

test("Prozessabbruch beim Schreiben: alte Fassung bleibt, Wiederherstellung angeboten (AK-22, M7)", async () => {
  const before = await file("Zahnarzt.md");
  await app.close();
  const env = { ...process.env, ...hide, MARKDOIST_FOLDER: folder, MARKDOIST_DATA_DIR: join(base, "data"), MARKDOIST_TEST_NOW: "2026-10-12T10:00" };
  const crashing = await electron.launch({ args: [join(appDir, "out/main/index.js")], env: { ...env, MARKDOIST_TEST_CRASH: "write:before-rename" } });
  const p1 = await crashing.firstWindow();
  await p1.getByTestId("list").waitFor();
  await p1.locator('[data-testid=task-row][data-title="Zahnarzttermin vereinbaren"]').click();
  const exited = new Promise((r) => crashing.process().on("exit", r));
  await p1.getByTestId("field-priority").selectOption("high");
  await exited;
  expect(await file("Zahnarzt.md")).toBe(before);
  // Neustart ohne Haken: Wiederherstellungsfall unter Probleme, Datei unverändert, keine Temp-Reste.
  app = await electron.launch({ args: [join(appDir, "out/main/index.js")], env });
  page = await app.firstWindow();
  await page.getByTestId("list").waitFor();
  await page.getByTestId("nav-problems").click();
  await expect(page.getByText(/Änderung wurde nicht gespeichert/)).toBeVisible();
  expect(await file("Zahnarzt.md")).toBe(before);
  expect((await readdir(folder)).filter((n) => n.endsWith(".todo-tmp"))).toEqual([]);
});

test("Textkonflikt: externe Änderung während der Eingabe, „Meine Version“ (7.3)", async () => {
  await row("Zahnarzttermin vereinbaren").click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Mein Zusatz");
  const orig = await file("Zahnarzt.md");
  await writeFile(join(folder, "Zahnarzt.md"), orig.replace("Praxis anrufen.", "Praxis per Mail kontaktieren."));
  await expect(page.getByTestId("draft-conflict")).toBeVisible({ timeout: 6000 });
  await page.getByTestId("resolve-mine").click();
  await expect.poll(() => file("Zahnarzt.md")).toContain("Mein Zusatz");
});

test("Sortierung wählbar und Zeitraum-Filter (4.3)", async () => {
  await page.getByTestId("nav-all").click();
  await page.getByTestId("filter-toggle").click();
  await page.getByTestId("sort").selectOption("title");
  const titles = await page.locator("[data-testid=task-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-title")));
  expect(titles).toEqual([...titles].sort((a, b) => a!.localeCompare(b!, "de")));
  await page.getByTestId("filter-due").selectOption("range");
  await page.getByLabel("von").first().fill("2026-10-12");
  await page.getByLabel("bis").first().fill("2026-10-12");
  await expect(page.locator("[data-testid=task-row]")).toHaveCount(2); // Zahnarzt und Wochenrückblick
});

test("Ausnahme: künftigen Termin überspringen (5.4)", async () => {
  await row("Wochenrückblick").click();
  await page.getByTestId("exception-2026-10-19").click();
  await expect(page.getByTestId("exception-2026-10-19")).toBeChecked();
  await expect.poll(() => file("Wochenrückblick.md")).toContain("skipped_instances:\n  - 2026-10-19");
  await page.getByTestId("series-complete").click();
  await expect.poll(() => file("Wochenrückblick.md")).toContain("due: 2026-10-26");
});

test("Vorschau vor dem Erledigen nennt Folgetermin und übergangene Ausnahme (5.2, 5.4)", async () => {
  await row("Wochenrückblick").click();
  await expect(page.getByTestId("complete-preview")).toContainText("Nächstes Vorkommen: Mo, 19.10.2026");
  await page.getByTestId("exception-2026-10-19").click();
  await expect(page.getByTestId("complete-preview")).toContainText("Nächstes Vorkommen: Mo, 26.10.2026");
  await expect(page.getByTestId("complete-preview")).toContainText("19.10.2026 ist als Ausnahme übersprungen");
  // weiter entfernter Termin über das Datumsfeld im Serien-Menü
  await page.getByTestId("series-menu").click();
  await page.getByTestId("exception-date").fill("2027-03-01");
  await page.getByTestId("exception-add").click();
  await expect.poll(() => file("Wochenrückblick.md")).toContain("  - 2027-03-01");
  await expect(page.getByTestId("exception-2027-03-01")).toBeChecked();
});

test("Regel ändern: Ausnahmen ausdrücklich übernehmen, Vorschau zeigt Wirkung (5.1)", async () => {
  await row("Wochenrückblick").click();
  await page.getByTestId("exception-2026-10-26").click();
  await expect.poll(() => file("Wochenrückblick.md")).toContain("  - 2026-10-26");
  await page.getByTestId("edit-recurrence").click();
  await expect(page.getByTestId("rec-effect")).toContainText("Keine Änderung");
  await page.getByTestId("rec-end").selectOption("count");
  await page.getByTestId("rec-count").fill("3");
  await expect(page.getByTestId("rec-effect")).toContainText("Neuer Abschnitt");
  await page.getByTestId("rec-carry-2026-10-26").check();
  await page.getByTestId("rec-save").click();
  await expect.poll(() => file("Wochenrückblick.md")).toContain("recurrence: FREQ=WEEKLY;BYDAY=MO;COUNT=3");
  const t = await file("Wochenrückblick.md");
  expect(t).toMatch(/\nskipped_instances:\n {2}- 2026-10-26\n/);
  expect(t).toContain("closed_reason: rule-change");
});

test("Beendete Serie: mit neuer Regel fortsetzen (5.4, AK-32)", async () => {
  await writeFile(
    join(folder, "Einmal.md"),
    fm([
      "id: 01K7EINMAL0000000000000000",
      "format_version: 1",
      "title: Einmalige Serie",
      "status: done",
      "priority: none",
      "inbox: false",
      "due: 2026-10-05",
      "completedDate: 2026-10-05T10:00:00+02:00",
      "recurrence: FREQ=WEEKLY;BYDAY=MO;COUNT=1",
      "recurrence_revision: REVEINMAL",
      "recurrence_start: 2026-10-05",
      "recurrence_anchor: calendar",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-05",
      "complete_instances: [2026-10-05]",
    ]),
  );
  await page.getByTestId("rescan").click();
  await page.getByTestId("nav-done").click();
  await row("Einmalige Serie").click();
  await expect(page.getByTestId("series-reopen")).toHaveCount(0);
  await page.getByTestId("series-continue").click();
  await expect(page.getByTestId("rec-restart")).toBeChecked();
  await expect(page.getByTestId("rec-effect")).toContainText("Erster Termin: Mo, 12.10.2026");
  await page.getByTestId("rec-save").click();
  await expect.poll(() => file("Einmal.md")).toContain("status: open");
  const t = await file("Einmal.md");
  expect(t).toContain("due: 2026-10-12");
  expect(t).not.toMatch(/^recurrence_revision: REVEINMAL$/m);
  expect(t).toContain("closed_reason: rule-change");
});

test("Filter: Mehrfachauswahl Priorität (ODER) und Frist mit Offset in Ortszeit (4.3, 3.3)", async () => {
  await writeFile(
    join(folder, "Import.md"),
    fm(["id: 01K7IMPORT0000000000000000", "title: Importierte Frist", "status: open", "priority: high", "inbox: false", "due: 2026-10-14T15:00Z"]),
  );
  await page.getByTestId("rescan").click();
  await page.getByTestId("nav-all").click();
  await page.getByTestId("filter-toggle").click();
  await page.getByTestId("filter-priority-high").check();
  await page.getByTestId("filter-priority-low").check();
  const titles = await page.locator("[data-testid=task-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-title")).sort());
  expect(titles).toEqual(["Bettwäsche wechseln", "Importierte Frist"]);
  await row("Importierte Frist").click();
  await expect(page.getByTestId("field-due")).toHaveValue("2026-10-14");
  await expect(page.getByLabel("Uhrzeit").first()).toHaveValue("17:00");
  expect(await file("Import.md")).toContain("due: 2026-10-14T15:00Z");
});

test("Papierkorb leeren ist endgültig: kein „Rückgängig“ (4.4)", async () => {
  await row("Zahnarzttermin vereinbaren").click();
  await page.getByTestId("detail-more").click();
  await page.getByTestId("delete").click();
  await page.getByTestId("nav-history").click();
  const h = page.locator('[data-testid=history-row][data-title="Zahnarzttermin vereinbaren"]');
  await expect(h.getByTestId("history-undo")).toBeVisible();
  await page.getByTestId("nav-trash").click();
  await page.getByTestId("empty-trash").click();
  await page.getByTestId("confirm-empty").click();
  await expect.poll(async () => (await readdir(join(folder, ".todo-trash"))).length).toBe(0);
  await page.getByTestId("nav-history").click();
  await expect(h).toContainText("Datei nicht mehr vorhanden");
  await expect(h.getByTestId("history-undo")).toHaveCount(0);
});

test("Menü einer anderen Aufgabe: Leertaste trifft die Menüaufgabe, nicht die Auswahl (R9)", async () => {
  await row("Zahnarzttermin vereinbaren").click();
  await page.keyboard.press("Escape"); // Detail schließen, Auswahl bleibt auf A
  await expect(row("Zahnarzttermin vereinbaren")).toHaveAttribute("aria-selected", "true");
  const other = row("Bettwäsche wechseln");
  await other.hover();
  await other.getByRole("button", { name: "Weitere Aktionen" }).click();
  const menu = page.getByRole("menu", { name: "Aufgabenaktionen" });
  await expect(menu).toBeVisible();
  // Der erste Eintrag („Erledigen“) hat den Fokus; Pfeil runter und wieder hoch prüfen die Menünavigation.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  expect(await page.evaluate(() => document.activeElement?.textContent)).toContain("Erledigen");
  await page.keyboard.press(" ");
  await expect.poll(() => file("Bettwäsche.md")).toContain("status: done");
  await expect(menu).toHaveCount(0);
  expect(await file("Zahnarzt.md")).toContain("status: open");
});

test("Listen: anlegen, Einträge hinzufügen, abhaken, Abgehakte entfernen (4.6)", async () => {
  await page.getByTestId("nav-lists").click();
  await page.getByTestId("new-list").click();
  await page.getByTestId("new-list-title").fill("Einkauf Samstag");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("list-title")).toHaveText("Einkauf Samstag");
  const add = page.getByTestId("add-item");
  await expect(add).toBeFocused();
  await add.fill("Milch");
  await add.press("Enter");
  await expect(page.locator('[data-testid="item-row"][data-text="Milch"]')).toBeVisible();
  await add.fill("Brot");
  await add.press("Enter");
  await expect.poll(() => file("Einkauf Samstag.md")).toMatch(/kind: list\n[\s\S]*---\n- \[ \] Milch\n- \[ \] Brot\n$/);
  await page.locator('[data-testid="item-row"][data-text="Milch"]').getByTestId("item-check").click();
  await expect.poll(() => file("Einkauf Samstag.md")).toContain("- [x] Milch\n- [ ] Brot\n");
  await expect(page.getByTestId("checked-toggle")).toContainText("1");
  await page.getByTestId("list-menu").click();
  await page.getByTestId("remove-checked").click();
  await expect.poll(() => file("Einkauf Samstag.md")).not.toContain("Milch");
  // Listen erscheinen nicht zwischen den Aufgaben
  await page.getByTestId("nav-all").click();
  await expect(row("Einkauf Samstag")).toHaveCount(0);
  await expect(row("Packliste Urlaub")).toHaveCount(0);
});

test("Listen: nach offenen Einträgen sortieren, Richtung umschalten, filtern (4.6)", async () => {
  await writeFile(
    join(folder, "Baumarkt.md"),
    fm(["id: 01K7LISTE0000000000000000B", "title: Baumarkt", "kind: list", "status: open", "inbox: false", "dateModified: 2026-10-10T08:00:00+02:00"], "- [ ] Schrauben\n- [x] Dübel\n"),
  );
  await writeFile(
    join(folder, "Geschenke.md"),
    fm(["id: 01K7LISTE0000000000000000G", "title: Geschenke", "kind: list", "status: open", "inbox: false", "dateModified: 2026-10-09T08:00:00+02:00"], "- [x] Buch\n- [x] Schal\n"),
  );
  await page.getByTestId("rescan").click();
  await page.getByTestId("nav-lists").click();
  const titles = () => page.locator('[data-testid="list-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-title")));
  await expect.poll(titles).toEqual(["Packliste Urlaub", "Baumarkt", "Geschenke"]);
  await page.getByTestId("filter-toggle").click();
  await page.getByTestId("list-sort").selectOption("open");
  await expect(page.getByTestId("list-sort-dir")).toHaveValue("desc");
  await expect.poll(titles).toEqual(["Packliste Urlaub", "Baumarkt", "Geschenke"]);
  await page.getByTestId("list-sort-dir").selectOption("asc");
  await expect.poll(titles).toEqual(["Geschenke", "Baumarkt", "Packliste Urlaub"]);
  await page.getByTestId("list-filter").selectOption("open");
  await expect.poll(titles).toEqual(["Baumarkt", "Packliste Urlaub"]);
  await expect(page.locator(".page-count").first()).toContainText("2 Listen");
  await expect(page.getByTestId("filter-toggle")).toContainText("Anzeige: 3");
  // Einstellung bleibt nach Öffnen und Schließen einer Liste
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="list-row"][data-title="Baumarkt"]').click();
  await expect(page.getByTestId("list-title")).toHaveText("Baumarkt");
  // Erstes Escape verlässt das fokussierte Eingabefeld, zweites führt zur Übersicht.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect.poll(titles).toEqual(["Baumarkt", "Packliste Urlaub"]);
  await page.getByTestId("filter-toggle").click();
  await page.getByTestId("list-filter").selectOption("none-open");
  await expect.poll(titles).toEqual(["Geschenke"]);
  await page.getByTestId("list-options-reset").click();
  await expect.poll(titles).toEqual(["Packliste Urlaub", "Baumarkt", "Geschenke"]);
});

test("Listen: Reihenfolge ziehen, Haken zurücksetzen, Text ändern, Suche öffnet Liste (4.6)", async () => {
  await page.getByTestId("search").fill("packliste");
  await page.locator('[data-testid="list-row"][data-title="Packliste Urlaub"]').click();
  await expect(page.getByTestId("list-title")).toHaveText("Packliste Urlaub");
  const item = (t: string) => page.locator(`[data-testid="item-row"][data-text="${t}"]`);
  await item("Ladekabel").dragTo(item("Zahnbürste"));
  await expect.poll(() => file("Packliste.md")).toMatch(/---\n- \[ \] Ladekabel\n- \[ \] Zahnbürste\n- \[x\] Pass\n$/);
  await page.getByTestId("list-menu").click();
  await page.getByTestId("reset-items").click();
  await expect.poll(() => file("Packliste.md")).toContain("- [ ] Pass\n");
  await item("Pass").locator(".title").click();
  await page.getByTestId("item-input").fill("Reisepass");
  await page.keyboard.press("Enter");
  await expect.poll(() => file("Packliste.md")).toContain("- [ ] Reisepass\n");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="list-row"][data-title="Packliste Urlaub"]')).toContainText("0/3");
});

test("Listen: X zum Löschen bleibt erreichbar, wenn die Maus aus der Zeile hinüberfährt (4.6)", async () => {
  await page.getByTestId("nav-lists").click();
  await page.locator('[data-testid="list-row"][data-title="Packliste Urlaub"]').click();
  const item = page.locator('[data-testid="item-row"][data-text="Zahnbürste"]');
  const box = (await item.boundingBox())!;
  const y = box.y + box.height / 2;
  // Wie eine echte Maus: aus der Zeile über den schmalen Spalt rechts daneben bis zum X.
  const x = (await item.getByTestId("item-remove").boundingBox())!;
  for (const px of [box.x + box.width - 2, box.x + box.width + 2, x.x + x.width / 2]) await page.mouse.move(px, y);
  await expect(item.locator(".row-actions")).toHaveCSS("opacity", "1");
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => file("Packliste.md")).not.toContain("Zahnbürste");
  // Von unten aus dem Rand angefahren erscheint das X ebenfalls.
  const next = page.locator('[data-testid="item-row"][data-text="Ladekabel"]');
  const nx = (await next.getByTestId("item-remove").boundingBox())!;
  await page.mouse.move(nx.x + nx.width / 2, nx.y + nx.height + 40);
  await page.mouse.move(nx.x + nx.width / 2, nx.y + nx.height / 2);
  await expect(next.locator(".row-actions")).toHaveCSS("opacity", "1");
});

test("Programmieren: Liste anlegen, Eintrag mit Notiz, erledigen, Erledigte entfernen, Liste löschen (4.8)", async () => {
  await page.keyboard.press("Control+8");
  await expect(page.getByTestId("dev-empty")).toBeVisible();
  await page.getByTestId("new-dev-list").click();
  await page.getByTestId("new-dev-list-title").fill("Markdoist");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("dev-title")).toHaveText("Markdoist");
  const add = page.getByTestId("dev-add-item");
  await expect(add).toBeFocused();
  await add.fill("Bug: Absturz unter Mesa");
  await add.press("Enter");
  await add.fill("Idee: Programmieren-Bereich");
  await add.press("Enter");
  const item = (t: string) => page.locator(`[data-testid="dev-item-row"][data-text="${t}"]`);
  await expect(item("Bug: Absturz unter Mesa")).toBeVisible();
  const listId = /\nid: (\S+)\n/.exec(await file("Markdoist.md"))![1];
  await expect.poll(() => file("Bug Absturz unter Mesa.md")).toContain(`kind: dev-item\ndev_list: ${listId}\n`);

  // Notiz wie bei Aufgaben; Termine, Eingang und Priorität gibt es nicht.
  await item("Bug: Absturz unter Mesa").getByTestId("dev-item-open").click();
  await expect(page.getByTestId("detail")).toBeVisible();
  await expect(page.locator(".detail-head .crumb")).toHaveText("Programmieren · Markdoist");
  await expect(page.getByTestId("field-inbox")).toHaveCount(0);
  await page.locator(".cm-content").click();
  await page.keyboard.type("Nur mit Mesa 26.");
  await expect(page.getByTestId("save-state")).toHaveText("Gespeichert", { timeout: 5000 });
  expect(await file("Bug Absturz unter Mesa.md")).toMatch(/---\nNur mit Mesa 26\.\n?$/);
  // Kopier-Icon: Titel und Notiz in einem Stück, z. B. für die KI.
  await page.getByTestId("copy-item").click();
  await expect(page.getByTestId("toast")).toHaveText("Kopiert");
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("Bug: Absturz unter Mesa\n\nNur mit Mesa 26.");
  await page.getByTestId("detail").getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(item("Bug: Absturz unter Mesa").getByTestId("dev-item-note")).toBeVisible();

  // Erster Klick: In Arbeit (halber Kreis), der Eintrag bleibt offen.
  const check = item("Bug: Absturz unter Mesa").getByTestId("dev-item-check");
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "mixed");
  await expect.poll(() => file("Bug Absturz unter Mesa.md")).toContain("status: in-progress");
  await expect(page.getByTestId("dev-done-toggle")).toHaveCount(0);
  // Im Detail ebenfalls halb; „Nicht mehr in Arbeit“ setzt ihn zurück auf offen.
  await item("Bug: Absturz unter Mesa").getByTestId("dev-item-open").click();
  await expect(page.locator(".detail .check.big")).toHaveAttribute("aria-checked", "mixed");
  await page.getByTestId("detail-more").click();
  await page.getByTestId("stop-work").click();
  await expect.poll(() => file("Bug Absturz unter Mesa.md")).toContain("status: open");
  await page.getByTestId("detail").getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(check).toHaveAttribute("aria-checked", "false");

  // Zwei Klicks erledigen: wandert nach „Erledigt“, erscheint nirgends zwischen den Aufgaben.
  await check.click();
  await expect(check).toHaveAttribute("aria-checked", "mixed");
  await check.click();
  await expect.poll(() => file("Bug Absturz unter Mesa.md")).toContain("status: done");
  await expect(page.getByTestId("dev-done-toggle")).toContainText("1");
  await page.getByTestId("dev-menu").click();
  await page.getByTestId("dev-remove-done").click();
  await expect.poll(() => readdir(folder)).not.toContain("Bug Absturz unter Mesa.md");
  for (const nav of ["nav-inbox", "nav-all", "nav-done", "nav-lists"]) {
    await page.getByTestId(nav).click();
    await expect(page.getByText("Idee: Programmieren-Bereich")).toHaveCount(0);
  }

  // Suche findet Einträge und Listen.
  await page.getByTestId("search").fill("markdoist");
  await page.locator('[data-testid="dev-list-row"][data-title="Markdoist"]').click();
  await expect(page.getByTestId("dev-title")).toHaveText("Markdoist");

  // Liste löschen: Liste und Einträge in den Papierkorb.
  await page.getByTestId("dev-menu").click();
  await page.getByTestId("dev-delete-list").click();
  await page.getByTestId("dev-confirm-delete").click();
  await expect.poll(() => readdir(folder)).not.toContain("Markdoist.md");
  expect(await readdir(folder)).not.toContain("Idee Programmieren-Bereich.md");
  await expect(page.getByTestId("dev-empty")).toBeVisible();
});

test("Programmieren: Übersicht sortieren und filtern, Einträge sortieren (4.8)", async () => {
  const list = (name: string, id: string, modified: string) =>
    writeFile(join(folder, `${name}.md`), fm([`id: ${id}`, "format_version: 1", `title: ${name}`, "kind: dev-list", "status: open", "inbox: false", `dateModified: ${modified}`]));
  const entry = (name: string, devList: string, status: string, created: string) =>
    writeFile(join(folder, `${name}.md`), fm(["format_version: 1", `title: ${name}`, "kind: dev-item", `dev_list: ${devList}`, `status: ${status}`, "inbox: false", `dateCreated: ${created}`]));
  await list("App", "01K7DEV0000000000000000APP", "2026-10-11T08:00:00+02:00");
  await list("Web", "01K7DEV0000000000000000WEB", "2026-10-10T08:00:00+02:00");
  await entry("Export", "01K7DEV0000000000000000APP", "open", "2026-10-01T08:00:00+02:00");
  await entry("Absturz", "01K7DEV0000000000000000APP", "open", "2026-10-05T08:00:00+02:00");
  await entry("Login", "01K7DEV0000000000000000WEB", "done", "2026-10-02T08:00:00+02:00");
  await entry("Verwaist", "01K7DEV00000000000000GONE0", "open", "2026-10-02T08:00:00+02:00");
  await page.getByTestId("rescan").click();
  await page.getByTestId("nav-dev").click();
  const titles = () => page.locator('[data-testid="dev-list-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-title")));
  await expect.poll(titles).toEqual(["App", "Web"]);
  await expect(page.getByTestId("dev-orphans")).toContainText("0/1");
  await page.getByTestId("filter-toggle").click();
  await page.getByTestId("list-filter").selectOption("none-open");
  await expect.poll(titles).toEqual(["Web"]);
  await page.getByTestId("list-options-reset").click();
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="dev-list-row"][data-title="App"]').click();
  const items = () => page.locator('[data-testid="dev-item-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-text")));
  await expect.poll(items).toEqual(["Absturz", "Export"]);
  await page.getByTestId("filter-toggle").click();
  await page.getByTestId("dev-item-sort").selectOption("title");
  await page.getByTestId("dev-item-sort-dir").selectOption("desc");
  await expect.poll(items).toEqual(["Export", "Absturz"]);
  // Die Listen-Übersicht behält ihre eigene Wahl.
  await page.keyboard.press("Escape");
  await page.getByTestId("nav-lists").click();
  await expect(page.getByTestId("filter-toggle")).toHaveText("Anzeige");
});

test("Müllabfuhr: ICS importieren, Abfuhrart öffnen, Termin überspringen, erneuter Import ändert nichts (4.7)", async () => {
  // Nachbildung der Vorlage ohne echte Adresse; der Dateidialog des Hauptprozesses liefert sie direkt.
  const ics = join(__dirname, "../../../packages/app/test/fixtures/abfuhr-2026.ics");
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never;
  }, ics);
  await page.keyboard.press("Control+7");
  await expect(page.getByText(/Noch keine Abfuhrtermine/)).toBeVisible();
  await page.getByTestId("waste-import").click();
  await expect(page.getByTestId("waste-import-dialog")).toBeVisible();
  await expect(page.getByTestId("waste-import-effect-0")).toHaveText("neu, 5 Termine");
  await expect(page.getByTestId("waste-import-name-0")).toHaveValue("Bioabfallbehaelter");
  await page.getByTestId("waste-import-name-0").fill("Biotonne");
  await page.getByTestId("waste-import-name-2").fill("Restmüll");
  await page.getByTestId("waste-import-apply").click();
  await expect(page.getByTestId("toast")).toHaveText("Kalender importiert: 4 Abfuhrarten, 10 Termine");
  await expect(page.getByTestId("waste-row")).toHaveCount(4);
  await expect(page.getByTestId("waste-row").first()).toHaveAttribute("data-title", "Biotonne");
  const rest = await file("Restmüll.md");
  expect(rest).toContain("format_version: 2\n");
  expect(rest).toContain("waste_type: Restabfallbehaelter 120 l\n");
  expect(rest).toContain("scheduled: 2026-11-06\n");
  expect(rest).not.toMatch(/MUSTERWEG|BEISPIELORT/);

  // Abfuhrart öffnen: aktuelles Vorkommen als Aufgabe, weitere Termine darunter.
  await page.locator('[data-testid="waste-row"][data-title="Restmüll"]').click();
  await expect(page.getByTestId("waste-desc")).toHaveText("Feste Termine aus dem Kalender: noch 2, bis Fr 11.12.2026");
  await expect(row("Restmüll")).toHaveCount(1);
  await page.getByTestId("waste-date-menu-2026-12-11").click();
  await page.getByTestId("waste-skip").click();
  await expect.poll(() => file("Restmüll.md")).toMatch(/skipped_instances:\n {2}- 2026-12-11\n/);
  await expect(page.getByTestId("waste-desc")).toHaveText("Feste Termine aus dem Kalender: noch 1, bis Fr 11.12.2026");
  // Vorlauf ändern
  await page.getByTestId("waste-lead").click();
  await page.getByTestId("datelist-lead").fill("3");
  await page.getByTestId("datelist-save").click();
  await expect.poll(() => file("Restmüll.md")).toContain("scheduled: 2026-11-10\n");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("waste-row")).toHaveCount(4);

  // In „Alle offenen“ steht je Abfuhrart nur der nächste Termin.
  await page.getByTestId("nav-all").click();
  await expect(row("Biotonne")).toHaveCount(1);

  // Derselbe Kalender erneut: keine Änderung, nichts zu übernehmen.
  await page.getByTestId("nav-waste").click();
  await page.getByTestId("waste-import").click();
  await expect(page.getByTestId("waste-import-effect-0")).toHaveText("keine Änderung");
  await expect(page.getByTestId("waste-import-apply")).toBeDisabled();
});

test("Programmieren: Diktieren mit Schlüssel, Erkennung, Bereinigung, Fehler und erneuter Versuch (4.9)", async () => {
  // Lokaler Ersatz für die OpenAI-API; das Mikrofon liefert Chromiums Testton.
  const seen: { path: string; auth: string; body: string }[] = [];
  let mode: "ok" | "401" = "ok";
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("latin1");
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", auth: req.headers.authorization ?? "", body });
      res.setHeader("Content-Type", "application/json");
      if (mode === "401") return void res.writeHead(401).end("{}");
      if (req.url === "/v1/audio/transcriptions") return void res.end(JSON.stringify({ text: "äh also der Knopf soll äh rot sein" }));
      if (req.url === "/v1/responses") return void res.end(JSON.stringify({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "Der Knopf soll rot sein." }] }] }));
      res.end(JSON.stringify({ data: [] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  try {
    await app.close();
    app = await electron.launch({
      args: [join(appDir, "out/main/index.js"), "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
      env: {
        ...process.env,
        ...hide,
        MARKDOIST_FOLDER: folder,
        MARKDOIST_DATA_DIR: join(base, "data"),
        MARKDOIST_TEST_NOW: "2026-10-12T10:00",
        MARKDOIST_TEST_TZ: "Europe/Berlin",
        MARKDOIST_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      },
    });
    page = await app.firstWindow();
    await page.getByTestId("list").waitFor();

    await page.keyboard.press("Control+8");
    await page.getByTestId("new-dev-list").click();
    await page.getByTestId("new-dev-list-title").fill("Markdoist");
    await page.keyboard.press("Enter");
    const add = page.getByTestId("dev-add-item");
    await add.fill("Farbe des Knopfs");
    await add.press("Enter");
    const item = page.locator('[data-testid="dev-item-row"][data-text="Farbe des Knopfs"]');
    await item.getByTestId("dev-item-open").click();

    // Ohne Schlüssel: Hinweis und Einstellungen öffnen sich.
    await page.getByTestId("dictate").click();
    await expect(page.getByTestId("toast")).toContainText("API-Schlüssel in den Einstellungen");
    await expect(page.getByTestId("dictation-settings")).toBeVisible();
    await page.getByTestId("dictation-key").fill("sk-test-e2e-geheim-1234");
    await page.getByTestId("dictation-key-save").click();
    await expect(page.getByTestId("dictation-key-masked")).toHaveText("sk-…1234");
    await page.getByTestId("dictation-key-check").click();
    await expect(page.getByTestId("dictation-status")).toHaveText("Schlüssel funktioniert");
    expect(await readFile(join(base, "data", "settings.json"), "utf8")).not.toContain("geheim");
    await page.getByTestId("dictation-settings-close").click();

    // Aufnahme → Fertig → bereinigter Text landet in der Notiz und in der Datei.
    await page.getByTestId("dictate").click();
    await expect(page.getByTestId("dictate-state")).toContainText("Aufnahme");
    await page.waitForTimeout(1500);
    await page.getByTestId("dictate-stop").click();
    await expect(page.locator(".cm-content")).toHaveText("Der Knopf soll rot sein.");
    await expect(page.getByTestId("save-state")).toHaveText("Gespeichert", { timeout: 5000 });
    expect(await file("Farbe des Knopfs.md")).toMatch(/---\nDer Knopf soll rot sein\.\n$/);
    const upload = seen.find((s) => s.path === "/v1/audio/transcriptions")!;
    expect(upload.auth).toBe("Bearer sk-test-e2e-geheim-1234");
    expect(upload.body).toContain('filename="diktat.webm"');
    expect(upload.body).toContain("gpt-transcribe");
    expect(upload.body).toContain("Projekt: Markdoist");
    expect(seen.find((s) => s.path === "/v1/responses")!.body).toContain('"model":"gpt-6.1-terra"');

    // Schlüssel abgelehnt: Aufnahme bleibt, „Erneut versuchen“ hängt den Text an.
    mode = "401";
    await page.getByTestId("dictate").click();
    await expect(page.getByTestId("dictate-state")).toContainText("Aufnahme");
    await page.waitForTimeout(800);
    await page.getByTestId("dictate-stop").click();
    await expect(page.getByTestId("dictate-state")).toHaveText("API-Schlüssel ungültig");
    mode = "ok";
    await page.getByTestId("dictate-retry").click();
    await expect(page.locator(".cm-content")).toHaveText(/Der Knopf soll rot sein\.\s*Der Knopf soll rot sein\./);
    await expect.poll(() => file("Farbe des Knopfs.md")).toMatch(/---\nDer Knopf soll rot sein\.\n\nDer Knopf soll rot sein\.\n$/);
    await expect(page.getByTestId("dictate")).toBeVisible();
  } finally {
    server.close();
  }
});

test("Ansicht mit Ctrl+Plus vergrößern, Größe bleibt nach Neustart (4.5)", async () => {
  // Tasten über den Main-Prozess: Playwright-Tastendrücke erreichen before-input-event nicht.
  const press = (keyCode: string) =>
    app.evaluate(({ BrowserWindow }, keyCode) => {
      const wc = BrowserWindow.getAllWindows()[0]!.webContents;
      wc.sendInputEvent({ type: "keyDown", keyCode, modifiers: ["control"] });
      wc.sendInputEvent({ type: "keyUp", keyCode, modifiers: ["control"] });
    }, keyCode);
  const zoom = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor());
  const saved = async () => JSON.parse(await readFile(join(base, "data", "settings.json"), "utf8").catch(() => "{}")).zoom;

  expect(await zoom()).toBe(1);
  await press("Plus");
  await press("numadd");
  await expect.poll(zoom).toBeCloseTo(1.2);
  await press("-");
  await expect.poll(zoom).toBeCloseTo(1.1);
  await expect.poll(saved).toBe(1.1);

  await app.close();
  app = await electron.launch({
    args: [join(appDir, "out/main/index.js")],
    env: { ...process.env, ...hide, MARKDOIST_FOLDER: folder, MARKDOIST_DATA_DIR: join(base, "data"), MARKDOIST_TEST_NOW: "2026-10-12T10:00" },
  });
  page = await app.firstWindow();
  await page.getByTestId("list").waitFor();
  await expect.poll(zoom).toBeCloseTo(1.1);

  await press("0");
  await expect.poll(zoom).toBe(1);
  await expect.poll(saved).toBe(1);
});
