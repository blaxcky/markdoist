// Serien mit fester Terminliste (5.7) und Importabgleich im Kern (4.7): AK-45, Kernteil von AK-46.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allOpenView,
  buildIndex,
  clockAtLocal,
  describeSeries,
  hashText,
  newDateSeriesText,
  newTaskText,
  planAction,
  readSeries,
  readTaskFile,
  todayView,
  wasteView,
  type IndexedFile,
  type TaskAction,
} from "../src";
import { ctxAt, fm, run, task, TZ } from "./helpers";

const REV = "01KAB3M6Q4Y6D8F0H2J4K6M8NP";

function restmuell(dates: string[], extra: string[] = [], instance = "2026-11-13", due = instance, scheduled?: string) {
  return fm([
    "id: 01KAB3M6Q4X0V2N8R5T7W9Y1ZC",
    "format_version: 2",
    "title: Restmüll",
    "status: open",
    "priority: none",
    "inbox: false",
    `due: ${due}`,
    `scheduled: ${scheduled ?? minus7(due)}`,
    "recurrence_dates:",
    ...dates.map((d) => `  - ${d}`),
    `recurrence_revision: ${REV}`,
    `recurrence_start: ${[...dates].sort()[0]}`,
    "recurrence_anchor: calendar",
    "recurrence_field: due",
    "recurrence_offset_days: -7",
    `recurrence_instance: ${instance}`,
    "waste_type: Restabfallbehaelter 120 l",
    ...extra,
    "dateCreated: 2026-10-28T19:10:00+01:00",
    "dateModified: 2026-10-28T19:10:00+01:00",
  ]);
}

function minus7(d: string): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const x = new Date(Date.UTC(y, m - 1, day - 7));
  return x.toISOString().slice(0, 10);
}

function file(name: string, text: string): IndexedFile {
  return readTaskFile({ ref: `/x/${name}`, name, text, hash: hashText(text), mtime: 0 });
}

function section(text: string, at: string): "due" | "today" | "earlier" | null {
  const tv = todayView(buildIndex([file("Restmüll.md", text)], clockAtLocal(at, TZ)), TZ);
  if (tv.due.length) return "due";
  if (tv.plannedToday.length) return "today";
  if (tv.plannedEarlier.length) return "earlier";
  return null;
}

const complete = (instance: string): TaskAction => ({ type: "completeOccurrence", revision: REV, instance });
const merge = (dates: string[], wasteType?: string, range?: { from: string; to: string }): TaskAction => ({
  type: "mergeDates",
  revision: REV,
  dates,
  ...(wasteType !== undefined ? { wasteType } : {}),
  ...(range ? { range } : {}),
});

describe("AK-45: Serie mit fester Terminliste", () => {
  const base = restmuell(["2026-11-13", "2026-12-11"]);

  it("liest die Terminliste als aktive Kalenderserie", () => {
    const s = readSeries(task(base))!;
    expect(s.phase).toBe("active");
    expect(s.dates?.map(String)).toEqual(["2026-11-13", "2026-12-11"]);
    expect(s.anchor).toBe("calendar");
    expect(s.diagnostics).toEqual([]);
    expect(describeSeries(s)).toBe("Feste Termine aus dem Kalender: noch 2, bis Fr 11.12.2026");
  });

  it("Heute: geplant ab dem Vorlauf, fällig am Abholtag", () => {
    expect(section(base, "2026-11-05T10:00")).toBeNull();
    expect(section(base, "2026-11-06T10:00")).toBe("today");
    expect(section(base, "2026-11-10T10:00")).toBe("earlier");
    expect(section(base, "2026-11-13T10:00")).toBe("due");
  });

  it("verspätet erledigt am 15.11. → 11.12., geplant 04.12.; am 20.12. erledigt → Serienende", () => {
    const a = run(base, complete("2026-11-13"), ctxAt("2026-11-15T09:00"));
    let t = task(a.text);
    expect(t.data.due).toBe("2026-12-11");
    expect(t.data.scheduled).toBe("2026-12-04");
    expect(t.data.recurrence_instance).toBe("2026-12-11");
    expect(t.data.complete_instances).toEqual(["2026-11-13"]);
    const b = run(a.text, complete("2026-12-11"), ctxAt("2026-12-20T09:00"));
    t = task(b.text);
    expect(t.data.status).toBe("done");
    expect(t.data.recurrence_instance).toBe("2026-12-11");
    expect(b.plan.kind === "edit" && b.plan.note).toBe("Serie beendet – kein weiteres Vorkommen");
  });

  it("verspätetes Erledigen überspringt einen verstrichenen Termin ohne Eintrag in C oder S", () => {
    const text = restmuell(["2026-11-13", "2026-11-27", "2026-12-11"]);
    const t = task(run(text, complete("2026-11-13"), ctxAt("2026-11-30T09:00")).text);
    expect(t.data.recurrence_instance).toBe("2026-12-11");
    expect(t.data.complete_instances).toEqual(["2026-11-13"]);
    expect(t.data.skipped_instances).toBeUndefined();
  });

  it("Permutationen und Duplikate in recurrence_dates ergeben dasselbe nächste Vorkommen", () => {
    const dates = ["2026-11-13", "2026-11-27", "2026-12-11", "2027-01-08"];
    const expected = task(run(restmuell(dates), complete("2026-11-13"), ctxAt("2026-11-14T09:00")).text).data
      .recurrence_instance;
    expect(expected).toBe("2026-11-27");
    fc.assert(
      fc.property(fc.shuffledSubarray([...dates, ...dates], { minLength: 8, maxLength: 8 }), (perm) => {
        const r = run(restmuell(perm), complete("2026-11-13"), ctxAt("2026-11-14T09:00"));
        return task(r.text).data.recurrence_instance === expected;
      }),
    );
  });

  it("Ausnahme nur auf einem Termin der Liste", () => {
    const text = restmuell(["2026-11-13", "2026-11-27", "2026-12-11"]);
    const ok = run(text, { type: "setException", revision: REV, date: "2026-11-27", skipped: true }, ctxAt("2026-11-01T09:00"));
    expect(task(ok.text).data.skipped_instances).toEqual(["2026-11-27"]);
    const no = planAction(task(text), { type: "setException", revision: REV, date: "2026-11-20", skipped: true }, ctxAt("2026-11-01T09:00"));
    expect(no.kind).toBe("blocked");
    // Überspringen des aktuellen führt am Ausnahmetermin vorbei.
    const t = task(run(ok.text, { type: "skipOccurrence", revision: REV, instance: "2026-11-13" }, ctxAt("2026-11-01T09:00")).text);
    expect(t.data.recurrence_instance).toBe("2026-12-11");
  });

  it("Regel bearbeiten ist gesperrt, Abstand ändern geht", () => {
    const blocked = planAction(
      task(base),
      {
        type: "changeRule",
        revision: REV,
        spec: { rule: "FREQ=WEEKLY", anchor: "calendar", field: "due", start: "2026-11-13", offsetDays: -7 },
        restartCount: false,
        resetChecklists: false,
      },
      ctxAt("2026-11-01T09:00"),
    );
    expect(blocked.kind).toBe("blocked");
    const t = task(run(base, { type: "changeReference", revision: REV, field: "due", offsetDays: -3 }, ctxAt("2026-11-01T09:00")).text);
    expect(t.data.scheduled).toBe("2026-11-10");
    expect(t.data.recurrence_offset_days).toBe(-3);
  });

  it("Wiederholung entfernen archiviert die Terminliste", () => {
    const t = task(run(base, { type: "removeRecurrence", revision: REV }, ctxAt("2026-11-01T09:00")).text);
    expect(t.data.recurrence_dates).toBeUndefined();
    const snap = (t.data.recurrence_archive as Record<string, unknown>[])[0]!;
    expect(snap.recurrence_dates).toEqual(["2026-11-13", "2026-12-11"]);
    expect(snap.recurrence).toBeUndefined();
    expect(snap.closed_reason).toBe("removed");
    expect(readSeries(t)).toBeNull();
  });

  it("Formatversion: Serienaktion hebt eine Terminliste auf 2, neue Aufgaben bleiben bei 1", () => {
    const v1 = base.replace("format_version: 2", "format_version: 1");
    expect(task(run(v1, complete("2026-11-13"), ctxAt("2026-11-13T09:00")).text).data.format_version).toBe(2);
    expect(task(run(base, complete("2026-11-13"), ctxAt("2026-11-13T09:00")).text).data.format_version).toBe(2);
    expect(newTaskText({ title: "Neu" }, ctxAt("2026-11-01T09:00")).text).toMatch(/format_version: 1\n/);
    const v3 = task(base.replace("format_version: 2", "format_version: 3"));
    expect(v3.readOnly).toBe(true);
    expect(planAction(v3, complete("2026-11-13"), ctxAt("2026-11-13T09:00")).kind).toBe("blocked");
  });

  it("Diagnosen: Regel und Liste zugleich, ab Erledigung, ungültiger Eintrag, K außerhalb der Liste", () => {
    const both = readSeries(task(restmuell(["2026-11-13"], ["recurrence: FREQ=WEEKLY"])))!;
    expect(both.phase).toBe("blocked");
    expect(both.diagnostics.map((d) => d.code)).toContain("invalid-recurrence");
    const completion = readSeries(task(restmuell(["2026-11-13"]).replace("recurrence_anchor: calendar", "recurrence_anchor: completion")))!;
    expect(completion.phase).toBe("blocked");
    const bad = readSeries(task(restmuell(["2026-11-13", "2026-11-31"])))!;
    expect(bad.structureError).toBe(true);
    const timed = readSeries(task(restmuell(["2026-11-13", "2026-11-27T07:00"])))!;
    expect(timed.structureError).toBe(true);
    const outside = readSeries(task(restmuell(["2026-11-13", "2026-12-11"], [], "2026-11-20")))!;
    expect(outside.diagnostics.map((d) => d.code)).toContain("series-instance-not-in-list");
  });
});

describe("Neuanlage einer festen Terminliste (4.7)", () => {
  it("K ist der erste Termin ab dem Aktionstag, frühere Termine bleiben in der Liste", () => {
    const r = newDateSeriesText(
      {
        title: "Restmüll",
        note: "Bereitstellen am Abfuhrtag um 7.00 Uhr.",
        dates: ["2026-12-11", "2026-10-16", "2026-11-13", "2026-11-13"],
        offsetDays: -7,
        wasteType: "Restabfallbehaelter 120 l",
      },
      ctxAt("2026-10-28T19:10"),
    )!;
    const t = task(r.text);
    expect(r.instance).toBe("2026-11-13");
    expect(t.data).toMatchObject({
      format_version: 2,
      status: "open",
      priority: "none",
      inbox: false,
      due: "2026-11-13",
      scheduled: "2026-11-06",
      recurrence_dates: ["2026-10-16", "2026-11-13", "2026-12-11"],
      recurrence_start: "2026-10-16",
      recurrence_anchor: "calendar",
      recurrence_field: "due",
      recurrence_offset_days: -7,
      recurrence_instance: "2026-11-13",
      waste_type: "Restabfallbehaelter 120 l",
    });
    expect(t.body).toBe("Bereitstellen am Abfuhrtag um 7.00 Uhr.\n");
    expect(readSeries(t)!.phase).toBe("active");
    expect(t.diagnostics).toEqual([]);
  });
  it("nur vergangene Termine: nichts anlegen", () => {
    expect(newDateSeriesText({ title: "Alt", dates: ["2026-10-01"], offsetDays: -7 }, ctxAt("2026-10-28T19:10"))).toBeNull();
  });
});

describe("Importabgleich mergeDates (4.7, AK-46 im Kern)", () => {
  const base = restmuell(["2026-11-13", "2026-12-11"]);

  it("ergänzt neue Termine; derselbe Import erneut schreibt nichts", () => {
    const a = run(base, merge(["2026-11-13", "2026-12-11", "2027-01-08"]), ctxAt("2026-10-29T09:00"));
    expect(task(a.text).data.recurrence_dates).toEqual(["2026-11-13", "2026-12-11", "2027-01-08"]);
    expect(task(a.text).data.recurrence_instance).toBe("2026-11-13");
    expect(planAction(task(a.text), merge(["2026-11-13", "2026-12-11", "2027-01-08"]), ctxAt("2026-10-29T10:00")).kind).toBe("noop");
  });

  it("verlegter Zukunftstermin wird ersetzt; vergangene, erledigte und übersprungene bleiben", () => {
    const text = restmuell(
      ["2026-10-16", "2026-11-13", "2026-11-27", "2026-12-11", "2027-01-08"],
      ["complete_instances:", "  - 2026-10-16", "skipped_instances:", "  - 2026-12-11"],
    );
    // Neue Datei ab 12.11.: 27.11. → 28.11. verlegt, 11.12. (übersprungen) und 08.01. fehlen, 08.01. liegt aber außerhalb.
    const t = task(run(text, merge(["2026-11-13", "2026-11-28"]), ctxAt("2026-11-12T09:00")).text);
    expect(t.data.recurrence_dates).toEqual(["2026-10-16", "2026-11-13", "2026-11-28", "2026-12-11", "2027-01-08"]);
    expect(t.data.recurrence_instance).toBe("2026-11-13");
  });

  it("fällt das aktuelle K weg, wird der nächste ungelöste Termin K (Zeitraum der ganzen Datei)", () => {
    // Ohne Dateizeitraum liegt der alte 13.11. vor dem ersten Restmüll-Termin der Datei und bleibt.
    const narrow = task(run(base, merge(["2026-11-14", "2026-12-11"]), ctxAt("2026-11-01T09:00")).text);
    expect(narrow.data.recurrence_dates).toEqual(["2026-11-13", "2026-11-14", "2026-12-11"]);
    // Die Datei beginnt mit einem Biotermin am 05.11.: Der 13.11. fehlt darin, ist also verlegt.
    const range = { from: "2026-11-05", to: "2026-12-19" };
    const t = task(run(base, merge(["2026-11-14", "2026-12-11"], undefined, range), ctxAt("2026-11-01T09:00")).text);
    expect(t.data.recurrence_dates).toEqual(["2026-11-14", "2026-12-11"]);
    expect(t.data.recurrence_instance).toBe("2026-11-14");
    expect(t.data.due).toBe("2026-11-14");
    expect(t.data.scheduled).toBe("2026-11-07");
  });

  it("ausgeschöpfte Serie wird in derselben Revision fortgesetzt", () => {
    const ended = run(run(base, complete("2026-11-13"), ctxAt("2026-11-13T09:00")).text, complete("2026-12-11"), ctxAt("2026-12-11T09:00")).text;
    expect(task(ended).data.status).toBe("done");
    const r = run(ended, merge(["2027-01-08", "2027-02-05"]), ctxAt("2027-01-02T09:00"));
    const t = task(r.text);
    expect(t.data).toMatchObject({ status: "open", recurrence_instance: "2027-01-08", due: "2027-01-08", scheduled: "2027-01-01", recurrence_revision: REV });
    expect(t.data.completedDate).toBeUndefined();
    expect(t.data.complete_instances).toEqual(["2026-11-13", "2026-12-11"]);
  });

  it("von Hand beendete Serie: fortgesetzt nur bei neuen künftigen Terminen", () => {
    const ended = run(base, { type: "endSeries", revision: REV, instance: "2026-11-13", completeCurrent: false }, ctxAt("2026-11-01T09:00")).text;
    const past = task(run(ended, merge(["2026-10-30"]), ctxAt("2026-11-20T09:00")).text);
    expect(past.data.status).toBe("done");
    expect(past.data.recurrence_dates).toEqual(["2026-10-30", "2026-11-13", "2026-12-11"]);
    // Derselbe Import wie beim Anlegen öffnet die beendete Serie nicht wieder.
    expect(planAction(task(ended), merge(["2026-11-13", "2026-12-11"]), ctxAt("2026-11-01T10:00")).kind).toBe("noop");
    const t = task(run(ended, merge(["2026-11-27"]), ctxAt("2026-11-20T09:00")).text);
    expect(t.data.status).toBe("open");
    expect(t.data.recurrence_instance).toBe("2026-11-27");
  });

  it("Zeitraum muss die Termine umfassen", () => {
    expect(planAction(task(base), merge(["2026-11-13"], undefined, { from: "2026-11-20", to: "2026-12-31" }), ctxAt("2026-11-01T09:00")).kind).toBe("blocked");
  });

  it("Zuordnung setzt die Abfuhrart neu", () => {
    const t = task(run(base, merge(["2026-11-13"], "Restabfallbehaelter 240 l"), ctxAt("2026-11-01T09:00")).text);
    expect(t.data.waste_type).toBe("Restabfallbehaelter 240 l");
  });

  it("gesperrte Serie und RRULE-Serie: kein Abgleich", () => {
    const blockedText = restmuell(["2026-11-13"], ["recurrence: FREQ=WEEKLY"]);
    expect(planAction(task(blockedText), merge(["2026-11-20"]), ctxAt("2026-11-01T09:00")).kind).toBe("blocked");
    const rrule = fm([
      "id: 01KAB3M6Q4X0V2N8R5T7W9Y1ZD",
      "title: Wochenrückblick",
      "status: open",
      "due: 2026-11-02",
      "recurrence: FREQ=WEEKLY;BYDAY=MO",
      `recurrence_revision: ${REV}`,
      "recurrence_instance: 2026-11-02",
    ]);
    expect(planAction(task(rrule), merge(["2026-11-20"]), ctxAt("2026-11-01T09:00")).kind).toBe("blocked");
  });
});

describe("Müllabfuhr-Übersicht (4.7)", () => {
  it("eine Zeile je Abfuhrart, nach nächstem Termin, beendete zuletzt; Listen und andere Aufgaben nicht", () => {
    const clock = clockAtLocal("2026-11-01T10:00", TZ);
    const bio = restmuell(["2026-11-05", "2026-11-19"], [], "2026-11-05")
      .replace("title: Restmüll", "title: Biotonne")
      .replace("01KAB3M6Q4X0V2N8R5T7W9Y1ZC", "01KAB3M6Q4X0V2N8R5T7W9Y1ZE")
      .replace("waste_type: Restabfallbehaelter 120 l", "waste_type: Bioabfallbehaelter 80 l");
    const papier = restmuell(["2026-10-01"], [], "2026-10-01")
      .replace("title: Restmüll", "title: Papier")
      .replace("status: open", "status: done")
      .replace("01KAB3M6Q4X0V2N8R5T7W9Y1ZC", "01KAB3M6Q4X0V2N8R5T7W9Y1ZF")
      .replace("waste_type: Restabfallbehaelter 120 l", "waste_type: Papierbehaelter 240 l");
    const other = fm(["id: 01KAB3M6Q4X0V2N8R5T7W9Y1ZG", "title: Anderes", "status: open", "due: 2026-11-02"]);
    const idx = buildIndex(
      [file("Restmüll.md", restmuell(["2026-11-13", "2026-12-11"])), file("Biotonne.md", bio), file("Papier.md", papier), file("Anderes.md", other)],
      clock,
    );
    const w = wasteView(idx);
    expect(w.map((e) => [e.view.task.fields.title, e.next?.toString() ?? null, e.remaining])).toEqual([
      ["Biotonne", "2026-11-05", 2],
      ["Restmüll", "2026-11-13", 2],
      ["Papier", null, 0],
    ]);
    // In „Alle offenen“ steht je Abfuhrart nur das aktuelle Vorkommen.
    expect(allOpenView(idx, TZ).map((v) => v.task.fields.title)).toEqual(["Anderes", "Biotonne", "Restmüll"]);
  });
});

describe("Eigenschaften fester Terminlisten (5.7)", () => {
  // Zufällige Liste im Herbst 2026, zufällige Folge aus Erledigen/Überspringen an zufälligen Tagen.
  const day = (n: number) => {
    const x = new Date(Date.UTC(2026, 9, 1 + n));
    return x.toISOString().slice(0, 10);
  };
  it("K bleibt ein ungelöster Listentermin, Datumsfelder folgen K, Ende nur ohne weiteren Termin", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 90 }), { minLength: 1, maxLength: 12 }),
        fc.array(fc.record({ skip: fc.boolean(), delay: fc.integer({ min: -3, max: 20 }) }), { maxLength: 15 }),
        (offsets, steps) => {
          const dates = offsets.map(day);
          const first = [...dates].sort()[0]!;
          let text = restmuell(dates, [], first);
          for (const step of steps) {
            const t = task(text);
            if (t.data.status === "done") break;
            const k = String(t.data.recurrence_instance);
            const kd = new Date(`${k}T00:00:00Z`);
            const at = new Date(kd.getTime() + step.delay * 86_400_000).toISOString().slice(0, 10);
            const action: TaskAction = { type: step.skip ? "skipOccurrence" : "completeOccurrence", revision: REV, instance: k };
            const r = run(text, action, ctxAt(`${at}T09:00`));
            if (r.plan.kind !== "edit") return false;
            text = r.text;
            const n = task(text);
            const C = new Set((n.data.complete_instances as string[] | undefined) ?? []);
            const S = new Set((n.data.skipped_instances as string[] | undefined) ?? []);
            for (const x of [...C, ...S]) if (!dates.includes(x)) return false;
            const after = k > at ? k : at;
            const open = dates.filter((d) => d > after && !C.has(d) && !S.has(d)).sort();
            if (n.data.status === "done") {
              if (open.length) return false;
            } else {
              const nk = String(n.data.recurrence_instance);
              if (nk !== open[0] || n.data.due !== nk || n.data.scheduled !== minus7(nk)) return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 300 },
    );
  });
});
