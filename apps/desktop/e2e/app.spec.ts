// Desktop-E2E (M4): echte Electron-App gegen einen temporären Aufgabenordner, Testuhr 12.10.2026.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  await page.getByTestId("capture-title").fill("Steuer: Belege sammeln?");
  await page.getByTestId("capture-submit").click();
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

test("Frist setzen: Eingang und Heute, inbox bleibt (AK-02)", async () => {
  await page.getByTestId("capture-button").click();
  await page.getByTestId("capture-title").fill("Neue Frist");
  await page.getByTestId("capture-edit").click();
  await page.getByTestId("field-due").fill("2026-10-12");
  await expect(row("Neue Frist")).toBeVisible();
  const text = await file("Neue Frist.md");
  expect(text).toContain("due: 2026-10-12");
  expect(text).toContain("inbox: true");
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
