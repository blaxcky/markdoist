// Desktop-E2E (M4): echte Electron-App gegen einen temporären Aufgabenordner, Testuhr 12.10.2026.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appDir = join(__dirname, "..");
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
  await expect(page.getByTestId("toast")).toContainText("Eingang");
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
  await page.getByRole("button", { name: "Bearbeiten" }).click();
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
