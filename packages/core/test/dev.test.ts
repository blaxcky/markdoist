import { describe, expect, it } from "vitest";
import {
  allOpenView,
  buildIndex,
  clockAtLocal,
  DEFAULT_LIST_OPTIONS,
  devItemsView,
  devListProgress,
  devListsView,
  doneView,
  hashText,
  inboxView,
  plannedView,
  listsView,
  newTaskText,
  readTaskFile,
  search,
  todayView,
  type DevItemOptions,
  type IndexedFile,
  type ListOptions,
} from "../src";
import { ctxAt, fm, TZ } from "./helpers";

const clock = clockAtLocal("2026-10-12T10:00", TZ);
function file(name: string, text: string): IndexedFile {
  return readTaskFile({ ref: `/x/${name}`, name, text, hash: hashText(text), mtime: 0 });
}
const ID_APP = "01APP000000000000000000000";
const ID_WEB = "01WEB000000000000000000000";

describe("Programmieren: Dateiformat (4.8)", () => {
  it("neue Programmier-Liste: kind dev-list, inbox false, keine Termine oder Priorität", () => {
    const { text } = newTaskText({ title: "Markdoist", kind: "dev-list" }, ctxAt("2026-10-12T10:00"));
    expect(text).toMatch(/\ntitle: Markdoist\nkind: dev-list\nstatus: open\ninbox: false\ndateCreated: /);
    expect(text).not.toMatch(/priority:|due:|scheduled:|dev_list:/);
  });

  it("neuer Eintrag: kind dev-item mit dev_list, Notiz als Body", () => {
    const { text } = newTaskText(
      { title: "Bug: Absturz beim Start", kind: "dev-item", devList: ID_APP, note: "Nur unter Mesa." },
      ctxAt("2026-10-12T10:00"),
    );
    expect(text).toMatch(/\ntitle: "?Bug: Absturz beim Start"?\nkind: dev-item\ndev_list: 01APP0+\nstatus: open\ninbox: false\n/);
    expect(text.endsWith("---\nNur unter Mesa.\n")).toBe(true);
    const f = file("Bug.md", text);
    expect(f.kind === "task" && f.fields).toMatchObject({ isDevItem: true, isDevList: false, isList: false, devList: ID_APP });
  });

  it("Eintrag ohne Liste wird nicht angelegt", () => {
    expect(() => newTaskText({ title: "X", kind: "dev-item" }, ctxAt("2026-10-12T10:00"))).toThrow();
  });
});

describe("Programmieren: Ansichten (4.8)", () => {
  const list = (title: string, id: string, extra: string[] = []) =>
    file(`${title}.md`, fm([`id: ${id}`, `title: ${title}`, "kind: dev-list", "status: open", "inbox: false", ...extra]));
  const item = (title: string, devList: string | null, extra: string[], body = "") =>
    file(
      `${title}.md`,
      fm([`title: ${title}`, "kind: dev-item", ...(devList ? [`dev_list: ${devList}`] : []), "inbox: false", ...extra], body),
    );
  const idx = buildIndex(
    [
      list("App", ID_APP, ["dateCreated: 2026-10-01T10:00:00+02:00", "dateModified: 2026-10-05T10:00:00+02:00"]),
      list("Web", ID_WEB, ["dateCreated: 2026-10-02T10:00:00+02:00", "dateModified: 2026-10-04T10:00:00+02:00"]),
      list("Leer", "01LEER00000000000000000000", ["dateCreated: 2026-10-03T10:00:00+02:00", "dateModified: 2026-10-03T10:00:00+02:00"]),
      item("Dunkles Design", ID_APP, ["status: open", "dateCreated: 2026-10-06T10:00:00+02:00", "dateModified: 2026-10-08T10:00:00+02:00"], "Farben aus dem System übernehmen\n"),
      item("Absturz beheben", ID_APP, ["status: open", "dateCreated: 2026-10-07T10:00:00+02:00", "dateModified: 2026-10-07T10:00:00+02:00"]),
      item("Export", ID_APP, ["status: done", "dateCreated: 2026-10-01T10:00:00+02:00", "completedDate: 2026-10-09T10:00:00+02:00"]),
      item("Alt erledigt", ID_APP, ["status: done", "dateCreated: 2026-10-01T10:00:00+02:00", "completedDate: 2026-10-02T10:00:00+02:00"]),
      item("Login", ID_WEB, ["status: done", "dateCreated: 2026-10-01T10:00:00+02:00"]),
      item("Verwaist", "01WEG00000000000000000000", ["status: open", "due: 2026-10-12"]),
      item("Ohne Verweis", null, ["status: open"]),
      file("Aufgabe.md", fm(["id: 01AUFGABE00000000000000000", "title: Absturz melden", "status: open", "due: 2026-10-12"])),
    ],
    clock,
  );
  const byTitle = (t: string) => idx.tasks.find((v) => v.task.fields.title === t)!;
  const names = (vs: { task: { fields: { title: string } } }[]) => vs.map((v) => v.task.fields.title);

  it("erscheinen in keiner Aufgaben- oder Listenansicht, aber in der Suche", () => {
    // Die Vergleichsaufgabe hat einen Termin und steht darum in Geplant statt im Eingang (4.1).
    expect(inboxView(idx, TZ)).toEqual([]);
    expect(names(plannedView(idx, TZ).flatMap((g) => g.items))).toEqual(["Absturz melden"]);
    expect(names(allOpenView(idx, TZ))).toEqual(["Absturz melden"]);
    expect(names(todayView(idx, TZ).due)).toEqual(["Absturz melden"]);
    expect(doneView(idx).tasks).toEqual([]);
    expect(listsView(idx)).toEqual([]);
    expect(names(search(idx, "absturz"))).toEqual(["Absturz beheben", "Absturz melden"]);
    // erledigte Einträge auch ohne „inkl. erledigt“
    expect(names(search(idx, "login"))).toEqual(["Login"]);
    // die Notiz zählt zur Suche
    expect(names(search(idx, "farben"))).toEqual(["Dunkles Design"]);
  });

  it("Einträge je Liste: offen nach Erstellung, erledigt zuletzt erledigt zuerst", () => {
    const v = devItemsView(idx, byTitle("App"));
    expect(names(v.open)).toEqual(["Absturz beheben", "Dunkles Design"]);
    expect(names(v.done)).toEqual(["Export", "Alt erledigt"]);
    expect(devListProgress(idx, byTitle("App"))).toEqual({ done: 2, total: 4, open: 2 });
  });

  it("Einträge sortieren", () => {
    const open = (o: Partial<DevItemOptions>) =>
      names(devItemsView(idx, byTitle("App"), { sort: "created", desc: true, ...o }).open);
    expect(open({ desc: false })).toEqual(["Dunkles Design", "Absturz beheben"]);
    expect(open({ sort: "modified", desc: true })).toEqual(["Dunkles Design", "Absturz beheben"]);
    expect(open({ sort: "title", desc: false })).toEqual(["Absturz beheben", "Dunkles Design"]);
    expect(open({ sort: "title", desc: true })).toEqual(["Dunkles Design", "Absturz beheben"]);
  });

  it("Einträge ohne oder mit unbekannter Liste stehen unter „Ohne Liste“", () => {
    expect(names(devItemsView(idx, null).open).sort()).toEqual(["Ohne Verweis", "Verwaist"]);
    expect(devListProgress(idx, null)).toEqual({ done: 0, total: 2, open: 2 });
  });

  it("Übersicht sortieren und filtern wie Listen", () => {
    const titles = (o: Partial<ListOptions>) => names(devListsView(idx, { ...DEFAULT_LIST_OPTIONS, ...o }));
    expect(titles({})).toEqual(["App", "Web", "Leer"]);
    expect(titles({ sort: "open" })).toEqual(["App", "Leer", "Web"]);
    expect(titles({ sort: "title", desc: false })).toEqual(["App", "Leer", "Web"]);
    expect(titles({ sort: "created" })).toEqual(["Leer", "Web", "App"]);
    expect(titles({ filter: "open" })).toEqual(["App"]);
    expect(titles({ filter: "none-open" })).toEqual(["Web", "Leer"]);
  });
});
