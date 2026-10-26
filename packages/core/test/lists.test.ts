import { describe, expect, it } from "vitest";
import {
  allOpenView,
  appendItem,
  buildIndex,
  clockAtLocal,
  doneView,
  findCheckboxes,
  hashText,
  inboxView,
  listsView,
  moveItem,
  newTaskText,
  readTaskFile,
  removeCheckedItems,
  removeItem,
  search,
  setItemText,
  todayView,
  type IndexedFile,
} from "../src";
import { ctxAt, fm, run, TZ } from "./helpers";

const clock = clockAtLocal("2026-10-12T10:00", TZ);
function file(name: string, text: string): IndexedFile {
  return readTaskFile({ ref: `/x/${name}`, name, text, hash: hashText(text), mtime: 0 });
}

describe("Listen: Dateiformat und Ansichten (4.6)", () => {
  const list = newTaskText({ title: "Einkauf", kind: "list" }, ctxAt("2026-10-12T10:00")).text;

  it("neue Liste: kind list, inbox false, keine Termine oder Priorität", () => {
    expect(list).toMatch(/\ntitle: Einkauf\nkind: list\nstatus: open\ninbox: false\n/);
    expect(list).not.toMatch(/priority:|due:|scheduled:/);
  });

  it("Listen erscheinen in keiner Aufgabenansicht, aber in Listen und Suche", () => {
    const task = fm(["id: 01AUFGABE00000000000000000", "title: Einkaufen gehen", "status: open", "due: 2026-10-12"]);
    const done = list.replace("status: open", "status: done").replace(/id: \S+/, "id: 01LISTE2000000000000000000");
    const idx = buildIndex([file("Einkauf.md", list), file("Alt.md", done), file("Aufgabe.md", task)], clock);
    expect(inboxView(idx, TZ).map((v) => v.task.name)).toEqual(["Aufgabe.md"]);
    expect(allOpenView(idx, TZ).map((v) => v.task.name)).toEqual(["Aufgabe.md"]);
    expect(todayView(idx, TZ).due.map((v) => v.task.name)).toEqual(["Aufgabe.md"]);
    expect(doneView(idx).tasks).toEqual([]);
    expect(listsView(idx).map((v) => v.task.name).sort()).toEqual(["Alt.md", "Einkauf.md"]);
    // Listen zählen unabhängig vom Status zur Suche
    expect(search(idx, "einkauf").map((v) => v.task.name).sort()).toEqual(["Alt.md", "Aufgabe.md", "Einkauf.md"]);
  });

  it("Listen: zuletzt geändert zuerst", () => {
    const a = fm(["id: 01A0000000000000000000000A", "title: A", "kind: list", "dateModified: 2026-10-10T10:00:00+02:00"]);
    const b = fm(["id: 01B0000000000000000000000B", "title: B", "kind: list", "dateModified: 2026-10-11T10:00:00+02:00"]);
    const c = fm(["id: 01C0000000000000000000000C", "title: C", "kind: list"]);
    const idx = buildIndex([file("A.md", a), file("B.md", b), file("C.md", c)], clock);
    expect(listsView(idx).map((v) => v.task.fields.title)).toEqual(["B", "A", "C"]);
  });
});

describe("Listen: Einträge bearbeiten (4.6)", () => {
  it("findet Text, Ende und Tiefe", () => {
    const body = "- [ ] Milch\n- [x] Brot\n  - [ ] Vollkorn\n\nNotiz\n";
    expect(findCheckboxes(body).map(({ line, text, end, depth, checked }) => ({ line, text, end, depth, checked }))).toEqual([
      { line: 0, text: "Milch", end: 1, depth: 0, checked: false },
      { line: 1, text: "Brot", end: 3, depth: 0, checked: true },
      { line: 2, text: "Vollkorn", end: 3, depth: 1, checked: false },
    ]);
  });

  it("Anfügen hinter dem letzten Eintrag, Notiz bleibt", () => {
    expect(appendItem("", "Milch")).toBe("- [ ] Milch\n");
    expect(appendItem("- [ ] Milch\n\nNotiz\n", " Eier \n")).toBe("- [ ] Milch\n- [ ] Eier\n\nNotiz\n");
    expect(appendItem("* [x] Milch", "Eier")).toBe("* [x] Milch\n* [ ] Eier");
    expect(appendItem("- [ ] a\r\n  - [ ] b\r\n", "c")).toBe("- [ ] a\r\n  - [ ] b\r\n- [ ] c\r\n");
    expect(appendItem("Text", "a")).toBe("Text\n\n- [ ] a\n");
    expect(appendItem("- [ ] a\n", "  ")).toBeNull();
  });

  it("Text ändern, entfernen, Abgehakte entfernen", () => {
    const body = "- [ ] Milch\r\n- [x] Brot\r\n  - [ ] Vollkorn\r\n- [X] Eier\r\n```\r\n- [x] code\r\n```\r\n";
    expect(setItemText(body, 0, "Hafermilch")).toBe(body.replace("Milch", "Hafermilch"));
    expect(setItemText(body, 0, "")).toBeNull();
    expect(setItemText(body, 5, "x")).toBeNull();
    expect(removeItem(body, 0)).toBe(body.replace("- [ ] Milch\r\n", ""));
    expect(removeCheckedItems(body)).toBe("- [ ] Milch\r\n```\r\n- [x] code\r\n```\r\n");
  });

  it("Verschieben mit Unterpunkten, ohne Abschlusszeilenumbruch", () => {
    const body = "- [ ] a\n- [ ] b\n  - [ ] b1\n- [ ] c";
    expect(moveItem(body, 3, 0)).toBe("- [ ] c\n- [ ] a\n- [ ] b\n  - [ ] b1");
    expect(moveItem(body, 0, null)).toBe("- [ ] b\n  - [ ] b1\n- [ ] c\n- [ ] a");
    expect(moveItem(body, 1, 3)).toBe(body);
    expect(moveItem(body, 2, 0)).toBeNull();
  });

  it("Aktionen laufen über planAction und setzen dateModified", () => {
    const text = fm(["id: 01LISTE0000000000000000000", "title: E", "kind: list", "status: open", "inbox: false"], "- [x] Milch\n");
    const ctx = ctxAt("2026-10-12T10:00");
    const added = run(text, { type: "addItem", text: "Eier" }, ctx);
    expect(added.text).toContain("- [x] Milch\n- [ ] Eier\n");
    expect(added.text).toMatch(/dateModified: /);
    expect(run(text, { type: "resetItems" }, ctx).text).toContain("- [ ] Milch\n");
    expect(run(text, { type: "removeCheckedItems" }, ctx).text.endsWith("---\n")).toBe(true);
    expect(run(text, { type: "addItem", text: " " }, ctx).plan.kind).toBe("blocked");
    expect(run(text.replace("[x]", "[ ]"), { type: "resetItems" }, ctx).plan.kind).toBe("noop");
  });
});

describe("Listen: Schutz vor verschobenen Zeilen (4.6)", () => {
  it("abweichender Eintragstext → blockiert, nichts geschrieben", () => {
    const text = fm(["id: 01LISTE0000000000000000000", "title: E", "kind: list"], "- [ ] Brot\n- [ ] Milch\n");
    const ctx = ctxAt("2026-10-12T10:00");
    expect(run(text, { type: "toggleCheckbox", line: 0, expect: "Milch" }, ctx).plan.kind).toBe("blocked");
    expect(run(text, { type: "removeItem", line: 1, expect: "Milch" }, ctx).text).not.toContain("Milch");
    expect(run(text, { type: "moveItem", line: 1, before: 0, expect: "Milch", expectBefore: "Eier" }, ctx).plan.kind).toBe("blocked");
    expect(run(text, { type: "moveItem", line: 1, before: 0, expect: "Milch", expectBefore: "Brot" }, ctx).text).toContain("- [ ] Milch\n- [ ] Brot\n");
  });
});
