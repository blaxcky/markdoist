import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allOpenView,
  buildIndex,
  clockAtLocal,
  hashText,
  inboxView,
  isOverdue,
  matchesFilter,
  newTaskText,
  parseDateValue,
  problemsView,
  readTaskFile,
  search,
  todayView,
  type IndexedFile,
} from "../src";
import { ctxAt, fm, TZ } from "./helpers";

const clock = clockAtLocal("2026-10-12T10:00", TZ);
function file(name: string, text: string): IndexedFile {
  return readTaskFile({ ref: `/x/${name}`, name, text, hash: hashText(text), mtime: 0 });
}
function t(name: string, extra: string[], body = "") {
  return file(`${name}.md`, fm([`id: 01ID${name.padEnd(22, "0").slice(0, 22)}`, `title: ${name}`, "status: open", ...extra], body));
}

describe("Eingang und Erfassung (AK-01–03)", () => {
  it("AK-01: Erfassung hat inbox true und keinen Termin", () => {
    const { text } = newTaskText({ title: "Neu" }, ctxAt("2026-10-12T10:00"));
    expect(text).toMatch(/inbox: true/);
    expect(text).not.toMatch(/due:|scheduled:/);
    const idx = buildIndex([file("Neu.md", text)], clock);
    expect(inboxView(idx, TZ)).toHaveLength(1);
    const tv = todayView(idx, TZ);
    expect(tv.due.length + tv.plannedToday.length + tv.plannedEarlier.length).toBe(0);
  });
  it("AK-02: heutiges due → Eingang und Fällig", () => {
    const { text } = newTaskText({ title: "Neu", due: "2026-10-12" }, ctxAt("2026-10-12T10:00"));
    const idx = buildIndex([file("Neu.md", text)], clock);
    expect(inboxView(idx, TZ)).toHaveLength(1);
    expect(todayView(idx, TZ).due).toHaveLength(1);
  });
  it("AK-03: einsortiert ohne Termin nur in Alle offenen und per Filter/Suche", () => {
    const idx = buildIndex([t("Einsortiert", ["inbox: false"])], clock);
    expect(inboxView(idx, TZ)).toHaveLength(0);
    expect(allOpenView(idx, TZ)).toHaveLength(1);
    expect(matchesFilter(idx.tasks[0]!, { inbox: "no" }, idx.today)).toBe(true);
    expect(search(idx, "einsortiert")).toHaveLength(1);
  });
});

describe("Heute (AK-04, AK-05)", () => {
  const vals = { gestern: "2026-10-11", heute: "2026-10-12", morgen: "2026-10-13", leer: null } as const;
  type K = keyof typeof vals;
  const expected = (due: K, sch: K) => {
    if (due === "gestern" || due === "heute") return "due";
    if (sch === "heute") return "plannedToday";
    if (sch === "gestern") return "plannedEarlier";
    return "none";
  };
  for (const due of Object.keys(vals) as K[]) {
    for (const sch of Object.keys(vals) as K[]) {
      it(`due=${due} scheduled=${sch}`, () => {
        const extra = [];
        if (vals[due]) extra.push(`due: ${vals[due]}`);
        if (vals[sch]) extra.push(`scheduled: ${vals[sch]}`);
        const idx = buildIndex([t("A", extra)], clock);
        const tv = todayView(idx, TZ);
        const where = tv.due.length ? "due" : tv.plannedToday.length ? "plannedToday" : tv.plannedEarlier.length ? "plannedEarlier" : "none";
        expect(where).toBe(expected(due, sch));
      });
    }
  }
  it("AK-05: keine Aufgabe doppelt", () => {
    const d = fc.constantFrom("2026-10-01", "2026-10-11", "2026-10-12", "2026-10-13", null);
    fc.assert(
      fc.property(fc.array(fc.tuple(d, d), { maxLength: 12 }), (pairs) => {
        const files = pairs.map(([due, sch], i) =>
          t(`T${i}`, [...(due ? [`due: ${due}`] : []), ...(sch ? [`scheduled: ${sch}`] : [])]),
        );
        const tv = todayView(buildIndex(files, clock), TZ);
        const all = [...tv.due, ...tv.plannedToday, ...tv.plannedEarlier].map((v) => v.task.name);
        expect(new Set(all).size).toBe(all.length);
      }),
    );
  });
});

describe("Überfällig (AK-06, AK-18)", () => {
  it("Datum: überfällig ab Folgetag", () => {
    const due = parseDateValue("2026-10-12")!;
    expect(isOverdue(due, clockAtLocal("2026-10-12T23:59", TZ))).toBe(false);
    expect(isOverdue(due, clockAtLocal("2026-10-13T00:00", TZ))).toBe(true);
  });
  it("Uhrzeit: 17:01 überfällig", () => {
    const due = parseDateValue("2026-10-12T17:00")!;
    expect(isOverdue(due, clockAtLocal("2026-10-12T17:00", TZ))).toBe(false);
    expect(isOverdue(due, clockAtLocal("2026-10-12T17:01", TZ))).toBe(true);
  });
  it("Zeitlücke: 02:30 am 28.03.2027 gilt ab 03:00 als verstrichen", () => {
    const due = parseDateValue("2027-03-28T02:30")!;
    expect(isOverdue(due, clockAtLocal("2027-03-28T01:59", TZ))).toBe(false);
    const at3 = { now: () => clockAtLocal("2027-03-28T03:00", TZ).now().add({ seconds: 1 }), timeZone: TZ };
    expect(isOverdue(due, at3)).toBe(true);
  });
  it("Doppelte Stunde: 02:30 am 31.10.2027 bleibt im zweiten Durchlauf überfällig", () => {
    const due = parseDateValue("2027-10-31T02:30")!;
    // erster Durchlauf 02:31 (+02:00)
    const first = clockAtLocal("2027-10-31T02:31", TZ);
    expect(isOverdue(due, first)).toBe(true);
    // zweiter Durchlauf 02:15 (+01:00) = 01:15 UTC
    const second = { now: () => first.now().add({ minutes: 44 }), timeZone: TZ };
    expect(second.now().toString()).toBe("2027-10-31T01:15:00Z");
    expect(isOverdue(due, second)).toBe(true);
  });
  it("scheduled von gestern ist nie überfällig", () => {
    const idx = buildIndex([t("A", ["scheduled: 2026-10-11"])], clock);
    expect(idx.tasks[0]!.overdue).toBe(false);
  });
});

describe("Suche und Filter (AK-25)", () => {
  const files = [
    t("Bettwäsche wechseln", ["priority: high", "due: 2026-10-01", "inbox: false"]),
    t("Straße fegen", ["priority: low"], "Mit Besen"),
    t("Notiz", ["priority: high", "inbox: true", "due: 2026-10-01"], "Bettwasche kaufen"),
  ];
  const idx = buildIndex(files, clock);
  it("ignoriert Umlaute und Groß-/Kleinschreibung, Titeltreffer zuerst", () => {
    const r = search(idx, "bettwasche");
    expect(r.map((v) => v.task.fields.title)).toEqual(["Bettwäsche wechseln", "Notiz"]);
    expect(search(idx, "STRASSE")).toHaveLength(1);
    expect(search(idx, "straße besen")).toHaveLength(1);
    expect(search(idx, "straße kaufen")).toHaveLength(0);
  });
  it("kombinierte Filter", () => {
    const r = idx.tasks.filter((v) => matchesFilter(v, { priority: ["high"], due: "overdue", inbox: "no" }, idx.today));
    expect(r.map((v) => v.task.fields.title)).toEqual(["Bettwäsche wechseln"]);
  });
});

describe("Probleme und Varianten (AK-09, AK-11, AK-42)", () => {
  it("ungültige Datei und Datei ohne Frontmatter erscheinen unter Probleme", () => {
    const idx = buildIndex([file("kaputt.md", "---\na: [\n---\n"), file("frei.md", "# Text\n")], clock);
    expect(problemsView(idx)).toHaveLength(2);
  });
  it("Syncthing-Konfliktkopie mit gleicher ID ist Variante, keine eigene Aufgabe", () => {
    const a = t("Aufgabe", ["priority: high"]);
    const text = (a as { text: string }).text.replace("priority: high", "priority: low");
    const b = file("Aufgabe.sync-conflict-20261012-101010-ABCDEFG.md", text);
    const idx = buildIndex([a, b], clock);
    expect(idx.tasks).toHaveLength(1);
    expect(idx.tasks[0]!.task.name).toBe("Aufgabe.md");
    expect(idx.tasks[0]!.variants).toHaveLength(1);
    expect(problemsView(idx).some((p) => p.kind === "conflict")).toBe(true);
  });
  it("ungültiges due plus heutiges scheduled bleibt in Geplant und Probleme", () => {
    const idx = buildIndex([t("A", ["due: morgen", "scheduled: 2026-10-12"])], clock);
    expect(todayView(idx, TZ).plannedToday).toHaveLength(1);
    expect(problemsView(idx)).toHaveLength(1);
  });
});

describe("Wählbare Sortierung (4.3)", () => {
  it("Priorität absteigend, Titel deutsch, leere Termine zuletzt", async () => {
    const { sortViews } = await import("../src");
    const idx = buildIndex(
      [t("Äpfel", ["priority: low", "due: 2026-10-20"]), t("Birnen", ["priority: high"]), t("Zitronen", ["priority: normal", "due: 2026-10-13"])],
      clock,
    );
    expect(sortViews(idx.tasks, "priority", TZ).map((v) => v.task.fields.title)).toEqual(["Birnen", "Zitronen", "Äpfel"]);
    expect(sortViews(idx.tasks, "title", TZ).map((v) => v.task.fields.title)).toEqual(["Äpfel", "Birnen", "Zitronen"]);
    expect(sortViews(idx.tasks, "due", TZ).map((v) => v.task.fields.title)).toEqual(["Zitronen", "Äpfel", "Birnen"]);
  });
});

describe("AK-18: Offset-Importe behalten ihren Instant", () => {
  it("due mit Z wird für Überfälligkeit als Instant ausgewertet und nicht umgeschrieben", () => {
    const due = parseDateValue("2026-10-12T15:00:00Z")!; // 17:00 in Berlin
    expect(isOverdue(due, clockAtLocal("2026-10-12T17:00", TZ))).toBe(false);
    expect(isOverdue(due, clockAtLocal("2026-10-12T17:01", TZ))).toBe(true);
    const idx = buildIndex([t("Z", ["due: 2026-10-12T15:00:00Z"])], clock);
    expect(idx.tasks[0]!.dueDate?.toString()).toBe("2026-10-12");
    expect((idx.tasks[0]!.task as { text: string }).text).toContain("due: 2026-10-12T15:00:00Z");
  });
});
