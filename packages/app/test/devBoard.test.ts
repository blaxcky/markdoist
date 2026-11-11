import { describe, expect, it } from "vitest";
import { clockAtLocal, devBoardView, devListsView, hashText, readTaskFile } from "@markdoist/core";
import {
  cleanSuggestedTitle,
  createDevItem,
  createDevItemFromText,
  DictationError,
  fillPendingTitles,
  MemoryAdapter,
  MemoryKeyValueStore,
  parseDictationSettings,
  parseTitleSuggestion,
  provisionalTitle,
  Repository,
  suggestDevTitle,
  suggestTitle,
  T,
  titleRequest,
  type FetchLike,
  type TitleSuggester,
} from "../src";

const TZ = "Europe/Berlin";

async function withList(title = "Markdoist") {
  const adapter = new MemoryAdapter();
  const repo = new Repository({
    adapter,
    kv: new MemoryKeyValueStore(),
    folder: "test",
    clock: () => clockAtLocal("2026-11-10T10:00", TZ),
    random: (b) => crypto.getRandomValues(b),
  });
  await repo.open();
  expect((await repo.create({ title, kind: "dev-list" })).status).toBe("ok");
  const list = () => devListsView(repo.getState().index).find((v) => v.task.fields.title === title)!;
  return { repo, adapter, list };
}

const titles = (vs: { task: { fields: { title: string } } }[]) => vs.map((v) => v.task.fields.title);
const fileOf = (adapter: MemoryAdapter, part: string) => [...adapter.tasks.entries()].find(([n]) => n.includes(part))![1].text;

describe("Vorläufiger Titel (4.10)", () => {
  it("nimmt die ersten Wörter ohne Markdown-Zeichen", () => {
    expect(provisionalTitle("- Widget zeigt `alte` Anzahl\n")).toBe("Widget zeigt alte Anzahl");
    expect(provisionalTitle("# Kurz\n\nZweite Zeile")).toBe("Kurz Zweite Zeile");
    expect(provisionalTitle("   \n ")).toBe("");
  });

  it("kürzt an einer Wortgrenze auf höchstens 60 Zeichen", () => {
    const t = provisionalTitle(
      "In der Müllabfuhr steht nach der Zeitumstellung die Biotonne am Montag, sie kommt aber erst am Dienstag.",
    );
    expect(t).toBe("In der Müllabfuhr steht nach der Zeitumstellung die …");
    expect(t.length).toBeLessThanOrEqual(62);
  });
});

describe("Titelvorschlag (4.10)", () => {
  it("Anfrage mit Modell, Liste und JSON-Schema", () => {
    const r = titleRequest("Text", "Markdoist", "gpt-6-luna") as { model: string; instructions: string; input: string; text: { format: { type: string; schema: { properties: { type: { enum: string[] } } } } } };
    expect(r.model).toBe("gpt-6-luna");
    expect(r.input).toBe("Text");
    expect(r.instructions).toContain("App bzw. Liste: Markdoist");
    expect(r.text.format.type).toBe("json_schema");
    expect(r.text.format.schema.properties.type.enum).toEqual(["bug", "feature", "idea"]);
  });

  it("liest Titel und Art und bereinigt den Titel", () => {
    const json = (o: unknown) => ({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(o) }] }] });
    expect(parseTitleSuggestion(json({ title: "„Widget zeigt alte Anzahl.“", type: "bug" }))).toEqual({ title: "Widget zeigt alte Anzahl", devType: "bug" });
    expect(parseTitleSuggestion(json({ title: "X", type: "task" }))).toEqual({ title: "X", devType: null });
    expect(() => parseTitleSuggestion(json({ title: " ", type: "bug" }))).toThrow(DictationError);
    expect(cleanSuggestedTitle("a ".repeat(60)).length).toBeLessThanOrEqual(80);
  });

  it("schickt die Notiz an /responses", async () => {
    const calls: { url: string; body: string; auth: string }[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, body: String(init.body), auth: init.headers.Authorization! });
      return { ok: true, status: 200, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: '{"title":"Suche findet Checklistenpunkte","type":"feature"}' }] }] }) };
    };
    const s = await suggestTitle({ fetch, key: "sk-test", model: "gpt-6-luna", note: "Suche soll auch Checklisten finden", list: "Markdoist", baseUrl: "http://x" });
    expect(s).toEqual({ title: "Suche findet Checklistenpunkte", devType: "feature" });
    expect(calls[0]!.url).toBe("http://x/responses");
    expect(calls[0]!.auth).toBe("Bearer sk-test");
    expect(JSON.parse(calls[0]!.body).input).toBe("Suche soll auch Checklisten finden");
    await expect(suggestTitle({ fetch, key: "", model: "m", note: "x", list: "" })).rejects.toMatchObject({ kind: "nokey" });
  });

  it("Einstellungen: Modell und Schalter mit Standardwerten", () => {
    expect(parseDictationSettings({})).toMatchObject({ titleModel: "gpt-6-luna", autoTitle: true });
    expect(parseDictationSettings({ titleModel: " m2 ", autoTitle: false })).toMatchObject({ titleModel: "m2", autoTitle: false });
    // Der erste Standard hieß falsch „gpt-6.1-luna“; gespeicherte Einstellungen werden berichtigt.
    expect(parseDictationSettings({ titleModel: "gpt-6.1-luna" }).titleModel).toBe("gpt-6-luna");
  });
});

describe("Board im Repository (4.10, AK-53, AK-54)", () => {
  it("Text ohne Titel ergibt vorläufigen Titel, KI ersetzt ihn und setzt die Art", async () => {
    const { repo, adapter, list } = await withList();
    const r = await createDevItemFromText(repo, list(), "Widget zeigt nach dem Sync kurz die alte Anzahl\n\n");
    expect(r.status).toBe("ok");
    const ref = r.status === "ok" ? r.ref! : "";
    let text = fileOf(adapter, "Widget");
    expect(text).toContain("kind: dev-item\n");
    expect(text).toContain("title_pending: true\n");
    expect(text).not.toContain("dev_type");
    expect(text.endsWith("---\nWidget zeigt nach dem Sync kurz die alte Anzahl\n")).toBe(true);

    const seen: [string, string][] = [];
    const suggest: TitleSuggester = async (note, l) => {
      seen.push([note, l]);
      return { title: "Widget: alte Anzahl nach dem Sync", devType: "bug" };
    };
    expect((await suggestDevTitle(repo, ref, suggest)).status).toBe("ok");
    expect(seen).toEqual([["Widget zeigt nach dem Sync kurz die alte Anzahl\n", "Markdoist"]]);
    text = fileOf(adapter, "Widget");
    expect(text).toContain("title: \"Widget: alte Anzahl nach dem Sync\"\n");
    expect(text).toContain("dev_type: bug\n");
    expect(text).not.toContain("title_pending");
    // Ohne force kein zweiter Vorschlag
    expect((await suggestDevTitle(repo, ref, suggest)).status).toBe("noop");
    expect(seen.length).toBe(1);
  });

  it("ein von Hand geänderter Titel wird nie überschrieben", async () => {
    const { repo, adapter, list } = await withList();
    const r = await createDevItemFromText(repo, list(), "Suche soll auch Checklisten finden");
    const ref = r.status === "ok" ? r.ref! : "";
    expect((await repo.perform(ref, { type: "setTitle", title: "Suche in Checklisten" }, "Titel")).status).toBe("ok");
    expect(fileOf(adapter, "Suche")).not.toContain("title_pending");
    const suggest: TitleSuggester = async () => ({ title: "KI", devType: "feature" });
    expect((await suggestDevTitle(repo, ref, suggest)).status).toBe("noop");
    expect(fileOf(adapter, "Suche")).toContain("title: Suche in Checklisten\n");
    // „Neu vorschlagen“ ersetzt ausdrücklich, Art nur, wenn sie fehlt
    expect((await repo.perform(ref, { type: "setDevType", devType: "idea" }, "Art")).status).toBe("ok");
    expect((await suggestDevTitle(repo, ref, suggest, true)).status).toBe("ok");
    const text = fileOf(adapter, "Suche");
    expect(text).toContain("title: KI\n");
    expect(text).toContain("dev_type: idea\n");
    expect((await repo.undo()).status).toBe("ok");
    expect(fileOf(adapter, "Suche")).toContain("title: Suche in Checklisten\n");
  });

  it("ohne Vorschlag bleibt der vorläufige Titel; beim Öffnen wird nachgeholt", async () => {
    const { repo, adapter, list } = await withList();
    await createDevItemFromText(repo, list(), "Erster Fehler");
    await createDevItemFromText(repo, list(), "Zweiter Wunsch");
    const none: TitleSuggester = async () => null;
    const r = await suggestDevTitle(repo, repo.getState().index.tasks.find((v) => v.task.fields.title === "Erster Fehler")!.task.ref, none);
    expect(r.status).toBe("blocked");
    expect(await fillPendingTitles(repo, list(), none)).toBe(0);
    expect(fileOf(adapter, "Erster")).toContain("title_pending: true\n");

    const ok: TitleSuggester = async (note) => ({ title: `KI ${note.trim()}`, devType: note.includes("Fehler") ? "bug" : "feature" });
    expect(await fillPendingTitles(repo, list(), ok)).toBe(2);
    const b = devBoardView(repo.getState().index, list());
    expect(titles(b.open).sort()).toEqual(["KI Erster Fehler", "KI Zweiter Wunsch"]);
    expect(b.open.every((v) => !v.task.fields.titlePending)).toBe(true);
  });

  it("Spalten, Filter und Zähler", async () => {
    const { repo, list } = await withList();
    const mk = async (title: string, devType: "bug" | "feature" | "idea" | null) => {
      const r = await createDevItem(repo, list(), title, undefined, { devType });
      return r.status === "ok" ? r.ref! : "";
    };
    const a = await mk("A Bug", "bug");
    await mk("B Feature", "feature");
    const c = await mk("C ohne Art", null);
    const d = await mk("D Idee", "idea");
    expect((await repo.perform(a, { type: "setStatus", status: "in-progress" }, "In Arbeit")).status).toBe("ok");
    expect((await repo.perform(d, { type: "setStatus", status: "done" }, "Erledigt")).status).toBe("ok");

    let b = devBoardView(repo.getState().index, list());
    expect(titles(b.open).sort()).toEqual(["B Feature", "C ohne Art"]);
    expect(titles(b.work)).toEqual(["A Bug"]);
    expect(titles(b.done)).toEqual(["D Idee"]);
    expect(b.counts).toEqual({ all: 3, bug: 1, feature: 1, idea: 0 });

    b = devBoardView(repo.getState().index, list(), undefined, "bug");
    expect([...titles(b.open), ...titles(b.work), ...titles(b.done)]).toEqual(["A Bug"]);
    b = devBoardView(repo.getState().index, list(), undefined, "idea");
    expect(titles(b.done)).toEqual(["D Idee"]);

    // Art setzen und entfernen
    expect((await repo.perform(c, { type: "setDevType", devType: "feature" }, "Art")).status).toBe("ok");
    expect(devBoardView(repo.getState().index, list()).counts.feature).toBe(2);
    expect((await repo.perform(c, { type: "setDevType", devType: null }, "Art")).status).toBe("ok");
    expect(devBoardView(repo.getState().index, list()).counts.feature).toBe(1);

    // Ziehen nach „Erledigt“ und zurück nach „Neu“ (AK-53)
    expect((await repo.perform(c, { type: "setStatus", status: "done" }, "Erledigt")).status).toBe("ok");
    expect(repo.findTask(c)!.fields.completedDate).not.toBeNull();
    expect((await repo.perform(c, { type: "setStatus", status: "open" }, "Neu")).status).toBe("ok");
    const t = repo.findTask(c)!;
    expect(t.fields.status).toBe("open");
    expect(t.fields.completedDate).toBeNull();
  });

  it("unbekannte Art gilt als keine Art, Felder nur bei Einträgen", () => {
    const read = (fm: string) => {
      const text = `---\n${fm}---\n`;
      const f = readTaskFile({ ref: "/x/a.md", name: "a.md", text, hash: hashText(text), mtime: 0 });
      if (f.kind !== "task") throw new Error("keine Aufgabe");
      return f.fields;
    };
    expect(read("title: A\nkind: dev-item\ndev_type: chore\n")).toMatchObject({ devType: null, titlePending: false });
    expect(read("title: A\nkind: dev-item\ndev_type: bug\ntitle_pending: true\n")).toMatchObject({ devType: "bug", titlePending: true });
    expect(read("title: A\ndev_type: bug\ntitle_pending: true\n")).toMatchObject({ devType: null, titlePending: false });
  });
});

describe("Alter einer Karte (4.10)", () => {
  it("zählt Kalendertage ab dem Anlagetag", async () => {
    const { ageDays, T } = await import("../src");
    expect(ageDays("2026-11-10T23:30:00+01:00", "2026-11-10")).toBe(0);
    expect(ageDays("2026-11-09T08:00:00+01:00", "2026-11-10")).toBe(1);
    expect(ageDays("2026-10-25T08:00:00+02:00", "2026-11-10")).toBe(16);
    expect(ageDays(null, "2026-11-10")).toBeNull();
    expect([0, 1, 3, 16, 90].map(T.dev.age)).toEqual(["heute", "gestern", "3 Tage", "2 Wochen", "3 Monate"]);
  });
});

describe("Titelvorschlag: Fehler sichtbar, Ersatzanfrage (4.10)", () => {
  const ok = (text: string) => ({ ok: true, status: 200, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }) });
  const fail = (status: number, message: string) => ({ ok: false, status, json: async () => ({ error: { message } }) });

  it("lehnt das Modell die strukturierte Anfrage ab, folgt die einfache ohne reasoning", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetch: FetchLike = async (_url, init) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      bodies.push(body);
      return bodies.length === 1 ? fail(400, "Unsupported parameter: 'reasoning.effort'") : ok('```json\n{"title": "Widget zeigt alte Anzahl", "type": "bug"}\n```');
    };
    const s = await suggestTitle({ fetch, key: "sk", model: "gpt-6-luna", note: "Widget …", list: "" });
    expect(s).toEqual({ title: "Widget zeigt alte Anzahl", devType: "bug" });
    expect(bodies[0]).toHaveProperty("reasoning");
    expect(bodies[0]).toHaveProperty("text");
    expect(bodies[1]).not.toHaveProperty("reasoning");
    expect(bodies[1]).not.toHaveProperty("text");
  });

  it("„Neu vorschlagen“ zeigt die Ursache; ohne Schlüssel den Hinweis", async () => {
    const { repo, list } = await withList();
    const r = await createDevItemFromText(repo, list(), "Etwas");
    const ref = r.status === "ok" ? r.ref! : "";
    const fetch: FetchLike = async () => fail(404, "The model `gpt-6-luna` does not exist");
    const viaApi = (key: string): TitleSuggester => (note, l) => suggestTitle({ fetch, key, model: "gpt-6-luna", note, list: l });
    expect(await suggestDevTitle(repo, ref, viaApi("sk"), true)).toEqual({ status: "blocked", message: "Kein Vorschlag: HTTP 404: The model `gpt-6-luna` does not exist" });
    expect(await suggestDevTitle(repo, ref, viaApi(""), true)).toEqual({ status: "blocked", message: T.dictation.titleNoKey });
    const auth: FetchLike = async () => fail(401, "Incorrect API key");
    expect(await suggestDevTitle(repo, ref, (n, l) => suggestTitle({ fetch: auth, key: "sk", model: "m", note: n, list: l }), true)).toEqual({ status: "blocked", message: "Kein Vorschlag: API-Schlüssel ungültig" });
    expect(repo.findTask(ref)!.fields.titlePending).toBe(true);
  });
});
