// Ergänzende Abnahmetests (Plan 9) für den Kern: AK-03, -07, -14, -18, -21, -29, -30, -32, -37, -38, -41.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildIndex,
  clockAtLocal,
  doneView,
  parseRule,
  planAction,
  readSeries,
  storedCalendarDay,
  type TaskAction,
} from "../src";
import { ctxAt, fm, run, task } from "./helpers";

const ID = "01K6B2N8R4T6V8X0Z2C4E6G8J0";
const series = (anchor: "calendar" | "completion", rule: string, k: string, extra: string[] = [], body = "") =>
  fm(
    [
      `id: ${ID}`,
      "format_version: 1",
      "title: Serie",
      "status: open",
      "priority: none",
      "inbox: false",
      `due: ${k}`,
      `recurrence: ${rule}`,
      "recurrence_revision: REV1",
      "recurrence_start: 2026-10-05",
      `recurrence_anchor: ${anchor}`,
      "recurrence_field: due",
      `recurrence_instance: ${k}`,
      ...extra,
    ],
    body,
  );

/** Erledigt die jeweils aktuelle Instanz n-mal am Tag des Vorkommens. */
function completeTimes(text: string, n: number): { text: string; keys: string[] } {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = task(text);
    const k = String(t.data.recurrence_instance);
    keys.push(k);
    const r = run(text, { type: "completeOccurrence", revision: String(t.data.recurrence_revision), instance: k }, ctxAt(`${k}T10:00`));
    expect(r.plan.kind).toBe("edit");
    text = r.text;
  }
  return { text, keys };
}

const ALL_ACTIONS = (rev: string, k: string): TaskAction[] => [
  { type: "complete" },
  { type: "reopen" },
  { type: "setStatus", status: "in-progress" },
  { type: "setPriority", priority: "high" },
  { type: "setInbox", inbox: true },
  { type: "setTitle", title: "Neu" },
  { type: "setDate", field: "due", value: "2026-10-20" },
  { type: "setDate", field: "scheduled", value: null },
  { type: "setBody", body: "anders\n" },
  { type: "toggleCheckbox", line: 0 },
  { type: "assignNewId" },
  { type: "completeOccurrence", revision: rev, instance: k },
  { type: "skipOccurrence", revision: rev, instance: k },
  { type: "endSeries", revision: rev, instance: k, completeCurrent: true },
  { type: "reopenSeries", revision: rev },
  { type: "setException", revision: rev, date: "2026-10-26", skipped: true },
  { type: "createSeries", spec: { rule: "FREQ=DAILY", anchor: "calendar", field: "due", start: "2026-10-12", offsetDays: null } },
  {
    type: "changeRule",
    revision: rev,
    spec: { rule: "FREQ=DAILY", anchor: "calendar", field: "due", start: "2026-10-12", offsetDays: null },
    restartCount: true,
    resetChecklists: false,
  },
  { type: "changeReference", revision: rev, field: "due", offsetDays: 1 },
  { type: "removeRecurrence", revision: rev },
];

describe("AK-37: Formatversion, Serienstruktur, Migration, Archiv", () => {
  it("höhere format_version: alle Aktionen gesperrt", () => {
    const text = series("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12", [], "- [ ] a\n").replace("format_version: 1", "format_version: 2");
    const t = task(text);
    expect(t.readOnly).toBe(true);
    for (const a of ALL_ACTIONS("REV1", "2026-10-12")) {
      expect(planAction(t, a, ctxAt("2026-10-12T10:00")).kind, a.type).toBe("blocked");
    }
  });
  it("unbekannte Serienstruktur: alle Aktionen gesperrt", () => {
    const text = series("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12", ["complete_instances: kaputt"], "- [ ] a\n");
    const t = task(text);
    expect(readSeries(t)!.structureError).toBe(true);
    for (const a of ALL_ACTIONS("REV1", "2026-10-12")) {
      expect(planAction(t, a, ctxAt("2026-10-12T10:00")).kind, a.type).toBe("blocked");
    }
  });
  it("versionslose Fremddatei: Lesen ergänzt nichts", () => {
    const text = fm(["title: Fremd", "due: 2026-10-12", "recurrence: FREQ=WEEKLY;BYDAY=MO"]);
    const t = task(text);
    expect(t.fields.formatVersion).toBeNull();
    expect(t.text).toBe(text);
    const s = readSeries(t)!;
    expect(s.revision).toBeNull();
    expect(s.phase).toBe("active");
    expect(t.diagnostics.some((d) => d.code === "unsupported-format-version")).toBe(false);
  });
  it("aktives und archiviertes Datum derselben Tageszahl bleiben nach Regelwechsel unterscheidbar", () => {
    // Alter Abschnitt hat den 12.10. bereits erledigt; die neue Regel beginnt am selben Tag.
    const base = series("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-19", ["complete_instances: [2026-10-05, 2026-10-12]"]);
    const r = run(
      base,
      {
        type: "changeRule",
        revision: "REV1",
        spec: { rule: "FREQ=DAILY", anchor: "calendar", field: "due", start: "2026-10-12", offsetDays: null },
        restartCount: true,
        resetChecklists: false,
      },
      ctxAt("2026-10-12T18:00"),
    );
    const t = task(r.text);
    const s = readSeries(t)!;
    expect(s.instance?.toString()).toBe("2026-10-12");
    expect(s.C.has("2026-10-12")).toBe(false);
    expect(s.phase).toBe("active");
    const archive = t.data.recurrence_archive as Record<string, unknown>[];
    expect(archive[0]!.recurrence_revision).toBe("REV1");
    expect(archive[0]!.complete_instances).toEqual(["2026-10-05", "2026-10-12"]);
    expect(s.revision).not.toBe("REV1");
    // Das neue Vorkommen 12.10. ist offen und erledigbar (kein No-op wegen des Archiveintrags).
    const done = run(r.text, { type: "completeOccurrence", revision: s.revision!, instance: "2026-10-12" }, ctxAt("2026-10-12T19:00"));
    expect(done.plan.kind).toBe("edit");
    const after = task(done.text);
    expect(after.data.complete_instances).toEqual(["2026-10-12"]);
    expect((after.data.recurrence_archive as Record<string, unknown>[])[0]!.complete_instances).toEqual(["2026-10-05", "2026-10-12"]);
    // Historienanzeige: beide 12.10. erscheinen getrennt, mit Revision und Archivkennzeichen.
    const occ = doneView(buildIndex([after], clockAtLocal("2026-10-12T20:00", "Europe/Berlin"))).occurrences.filter(
      (o) => o.date.toString() === "2026-10-12",
    );
    expect(occ.map((o) => [o.archived, o.revision])).toEqual(
      expect.arrayContaining([
        [true, "REV1"],
        [false, s.revision],
      ]),
    );
    expect(occ).toHaveLength(2);
  });
});

describe("AK-07: keine nebenbei materialisierten Felder", () => {
  it("Priorität an versionsloser Datei mit Serie ändert nur priority und dateModified", () => {
    const lines = [
      `id: ${ID}`,
      "title: Fremd # Kommentar",
      "priority: low",
      "x-unbekannt: 'bleibt'",
      "due: 2026-10-12",
      "recurrence: FREQ=WEEKLY;BYDAY=MO",
      "dateModified: 2026-10-01T10:00:00+02:00",
    ];
    const text = "﻿---\r\n" + lines.join("\r\n") + "\r\n---\r\nBody ohne Abschluss";
    const r = run(text, { type: "setPriority", priority: "high" }, ctxAt("2026-10-12T10:00"));
    expect(r.plan.kind).toBe("edit");
    const before = text.split("\r\n");
    const after = r.text.split("\r\n");
    expect(after.length).toBe(before.length);
    const changed = before.map((l, i) => (l === after[i] ? null : after[i])).filter((x) => x !== null);
    expect(changed).toEqual(["priority: high", "dateModified: 2026-10-12T10:00:00+02:00"]);
    const t = task(r.text);
    for (const f of ["format_version", "recurrence_revision", "recurrence_instance", "recurrence_start", "recurrence_anchor", "recurrence_field"]) {
      expect(f in t.data, f).toBe(false);
    }
  });
});

describe("AK-03: Termin setzen oder entfernen ändert inbox nicht", () => {
  for (const inbox of ["inbox: true", "inbox: false", null]) {
    it(`bei ${inbox ?? "fehlendem inbox"}`, () => {
      const base = fm([`id: ${ID}`, "title: A", "status: open", ...(inbox ? [inbox] : [])]);
      const set = run(base, { type: "setDate", field: "due", value: "2026-10-14" }, ctxAt("2026-10-12T10:00"));
      const t1 = task(set.text);
      expect(t1.data.due).toBe("2026-10-14");
      const removed = run(set.text, { type: "setDate", field: "due", value: null }, ctxAt("2026-10-12T11:00"));
      const sched = run(removed.text, { type: "setDate", field: "scheduled", value: "2026-10-13" }, ctxAt("2026-10-12T12:00"));
      for (const t of [t1, task(removed.text), task(sched.text)]) {
        if (inbox === null) expect("inbox" in t.data).toBe(false);
        else expect(t.data.inbox).toBe(inbox === "inbox: true");
      }
    });
  }
});

describe("AK-14: Permutationen und Duplikate von complete_instances und skipped_instances", () => {
  const keys = ["2026-09-28", "2026-10-05", "2026-10-19", "2026-10-26", "2026-11-02"];
  for (const anchor of ["calendar", "completion"] as const) {
    it(`gleiches nächstes Vorkommen (${anchor})`, () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom<"C" | "S" | "-">("C", "S", "-"), { minLength: keys.length, maxLength: keys.length }),
          fc.array(fc.nat(keys.length - 1), { maxLength: 6 }),
          fc.boolean(),
          (assign, dupIdx, skipAction) => {
            const C = keys.filter((_, i) => assign[i] === "C");
            const S = keys.filter((_, i) => assign[i] === "S");
            const dups = dupIdx.map((i) => keys[i]!);
            const messyC = [...C].reverse().concat(dups.filter((d) => C.includes(d)));
            const messyS = [...S].reverse().concat(dups.filter((d) => S.includes(d)));
            const list = (name: string, l: string[]) => (l.length ? `${name}: [${l.join(", ")}]` : `${name}: []`);
            const rule = anchor === "calendar" ? "FREQ=WEEKLY;BYDAY=MO" : "FREQ=WEEKLY";
            const make = (c: string[], s: string[]) =>
              series(anchor, rule, "2026-10-12", [list("complete_instances", c), list("skipped_instances", s)]);
            const action = {
              type: skipAction ? "skipOccurrence" : "completeOccurrence",
              revision: "REV1",
              instance: "2026-10-12",
            } as const;
            const a = run(make(messyC, messyS), action, ctxAt("2026-10-12T10:00"));
            const b = run(make(C, S), action, ctxAt("2026-10-12T10:00"));
            expect(a.plan.kind).toBe(b.plan.kind);
            expect(task(a.text).data.due).toBe(task(b.text).data.due);
            expect(task(a.text).data.status).toBe(task(b.text).data.status);
          },
        ),
        { numRuns: 80 },
      );
    });
  }
});

describe("AK-29: COUNT-Neustart", () => {
  it("bereits COUNT=5 gespeichert: „ab jetzt noch fünfmal“ zählt fünf neue, insgesamt sieben", () => {
    const base = series("calendar", "FREQ=WEEKLY;BYDAY=MO;COUNT=5", "2026-10-12", [
      "complete_instances: [2026-09-28, 2026-10-05]",
    ]).replace("recurrence_start: 2026-10-05", "recurrence_start: 2026-09-28");
    const r = run(
      base,
      {
        type: "changeRule",
        revision: "REV1",
        spec: { rule: "FREQ=WEEKLY;BYDAY=MO;COUNT=5", anchor: "calendar", field: "due", start: "2026-10-12", offsetDays: null },
        restartCount: true,
        resetChecklists: false,
      },
      ctxAt("2026-10-12T09:00"),
    );
    expect(r.plan.kind).toBe("edit");
    const four = completeTimes(r.text, 4);
    expect(task(four.text).data.status).toBe("open");
    const five = completeTimes(four.text, 1);
    expect([...four.keys, ...five.keys]).toEqual(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
    const t = task(five.text);
    expect(t.data.status).toBe("done");
    const archived = (t.data.recurrence_archive as Record<string, string[]>[])[0]!.complete_instances!;
    expect(archived.length + (t.data.complete_instances as string[]).length).toBe(7);
  });
  it("Completion: fünf neue Erledigungen, Überspringen zählt nicht", () => {
    const base = series("completion", "FREQ=WEEKLY;COUNT=5", "2026-10-12", ["complete_instances: [2026-09-28, 2026-10-05]"]);
    const r = run(
      base,
      {
        type: "changeRule",
        revision: "REV1",
        spec: { rule: "FREQ=WEEKLY;COUNT=5", anchor: "completion", field: "due", start: "2026-10-12", offsetDays: null },
        restartCount: true,
        resetChecklists: false,
      },
      ctxAt("2026-10-12T09:00"),
    );
    let text = r.text;
    const step = (type: "completeOccurrence" | "skipOccurrence") => {
      const t = task(text);
      const k = String(t.data.recurrence_instance);
      const res = run(text, { type, revision: String(t.data.recurrence_revision), instance: k }, ctxAt(`${k}T10:00`));
      expect(res.plan.kind).toBe("edit");
      text = res.text;
    };
    for (const s of ["c", "s", "c", "s", "s", "c", "c"] as const) step(s === "c" ? "completeOccurrence" : "skipOccurrence");
    expect(task(text).data.status).toBe("open");
    step("completeOccurrence");
    const t = task(text);
    expect(t.data.status).toBe("done");
    expect((t.data.complete_instances as string[]).length).toBe(5);
    expect((t.data.skipped_instances as string[]).length).toBe(3);
  });
});

describe("AK-30: Ausschluss aufgelöster Schlüssel, Archiv blockiert nicht", () => {
  it("Completion: bereits übersprungener Folgetermin wird übergangen", () => {
    const base = series("completion", "FREQ=WEEKLY", "2026-10-19", ["skipped_instances: [2026-10-26]"]);
    const r = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-19" }, ctxAt("2026-10-12T12:00"));
    expect(task(r.text).data.due).toBe("2026-11-02");
  });
  it("Kalender: erledigte und übersprungene Schlüssel werden ausgeschlossen", () => {
    const base = series("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12", [
      "complete_instances: [2026-10-19]",
      "skipped_instances: [2026-10-26]",
    ]);
    const r = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-12T12:00"));
    expect(task(r.text).data.due).toBe("2026-11-02");
  });
  it("Einträge alter Revisionen im Archiv blockieren den neuen Abschnitt nicht", () => {
    const archive = [
      "recurrence_archive:",
      "  - recurrence_revision: ALT",
      "    recurrence: FREQ=WEEKLY;BYDAY=MO",
      "    complete_instances: [2026-10-19, 2026-10-26]",
      "    skipped_instances: [2026-11-02]",
      "    closed_reason: rule-change",
    ];
    for (const anchor of ["calendar", "completion"] as const) {
      const base = series(anchor, anchor === "calendar" ? "FREQ=WEEKLY;BYDAY=MO" : "FREQ=WEEKLY", "2026-10-19", archive);
      const s = readSeries(task(base))!;
      expect(s.phase, anchor).toBe("active");
      expect(s.C.size).toBe(0);
      const r = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-19" }, ctxAt("2026-10-19T12:00"));
      expect(r.plan.kind).toBe("edit");
      expect(task(r.text).data.due, anchor).toBe("2026-10-26");
    }
  });
});

describe("AK-32: Serienende, Fortsetzen, Berechnungsabbruch", () => {
  it("UNTIL-Grenze beendet die Kalenderserie", () => {
    const base = series("calendar", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019", "2026-10-12");
    const a = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-12T10:00"));
    expect(task(a.text).data.due).toBe("2026-10-19");
    const b = run(a.text, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-19" }, ctxAt("2026-10-19T10:00"));
    expect(b.plan.kind === "edit" && b.plan.note).toMatch(/Serie beendet/);
    expect(task(b.text).data.status).toBe("done");
    expect(task(b.text).data.recurrence_instance).toBe("2026-10-19");
    // ausgeschöpfte Serie wiederöffnen: kein automatischer Neustart
    expect(run(b.text, { type: "reopenSeries", revision: "REV1" }, ctxAt("2026-10-20T10:00")).plan.kind).toBe("blocked");
  });
  it("UNTIL-Grenze bei Completion", () => {
    const base = series("completion", "FREQ=WEEKLY;UNTIL=20261020", "2026-10-12");
    const r = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-15T10:00"));
    expect(task(r.text).data.status).toBe("done");
  });
  it("„Mit neuer Regel fortsetzen“ an einer beendeten Serie erzeugt eine neue Revision und eine offene Serie", () => {
    const base = series("calendar", "FREQ=WEEKLY;BYDAY=MO;COUNT=1", "2026-10-05");
    const ended = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-05" }, ctxAt("2026-10-05T10:00"));
    expect(task(ended.text).data.status).toBe("done");
    const r = run(
      ended.text,
      {
        type: "changeRule",
        revision: "REV1",
        spec: { rule: "FREQ=WEEKLY;BYDAY=MO;COUNT=1", anchor: "calendar", field: "due", start: "2026-10-12", offsetDays: null },
        restartCount: true,
        resetChecklists: false,
      },
      ctxAt("2026-10-12T09:00"),
    );
    expect(r.plan.kind).toBe("edit");
    const t = task(r.text);
    expect(t.data.status).toBe("open");
    expect("completedDate" in t.data).toBe(false);
    expect(t.data.recurrence_revision).not.toBe("REV1");
    expect(t.data.recurrence_instance).toBe("2026-10-12");
    const archive = t.data.recurrence_archive as Record<string, unknown>[];
    expect(archive[0]).toMatchObject({ recurrence_revision: "REV1", status: "done", complete_instances: ["2026-10-05"] });
    expect(readSeries(t)!.phase).toBe("active");
  });
  it("Berechnungsabbruch beendet die Serie nie", () => {
    // Gültige Regeln ohne Termin im Suchhorizont: Die Suche bricht ab, das ist kein Serienende.
    for (const [anchor, rule] of [
      ["calendar", "FREQ=YEARLY;BYMONTH=1;BYYEARDAY=200"],
      ["calendar", "FREQ=YEARLY;BYMONTH=1;BYYEARDAY=200;COUNT=3"],
      ["completion", "FREQ=YEARLY;BYMONTH=1;BYYEARDAY=200"],
    ] as const) {
      const base = series(anchor, rule, "2026-10-12");
      expect(readSeries(task(base))!.phase, rule).toBe("active");
      for (const type of ["completeOccurrence", "skipOccurrence"] as const) {
        const p = planAction(task(base), { type, revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-12T10:00"));
        expect(p.kind, `${rule} ${type}`).toBe("blocked");
        if (p.kind === "blocked") expect(p.message).toMatch(/aufwendig/);
      }
    }
  });
  it("seltene gültige Tagesregel liegt im Suchhorizont (Review 23.10.2026, R5)", () => {
    // Schalttag am Montag: größte Lücke einer gültigen Tagesregel, 28 Jahre (2016 → 2044).
    const base = series("calendar", "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO", "2016-02-29");
    const p = planAction(task(base), { type: "completeOccurrence", revision: "REV1", instance: "2016-02-29" }, ctxAt("2016-02-29T10:00"));
    expect(p).toMatchObject({ kind: "edit", set: { recurrence_instance: "2044-02-29" } });
  });
});

describe("AK-38: unmögliche und ungültige Regeln", () => {
  it("unmögliche und aufwendige Regeln beim Anlegen und Ändern: Diagnose statt Serie", () => {
    const plain = fm([`id: ${ID}`, "title: A", "status: open"]);
    for (const [rule, msg] of [
      ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", /keine Termine/],
      ["FREQ=YEARLY;BYMONTH=1;BYYEARDAY=200", /aufwendig/],
    ] as const) {
      const spec = { rule, anchor: "calendar" as const, field: "due" as const, start: "2026-10-12", offsetDays: null };
      const p = planAction(task(plain), { type: "createSeries", spec }, ctxAt("2026-10-12T10:00"));
      expect(p.kind, rule).toBe("blocked");
      if (p.kind === "blocked") expect(p.message, rule).toMatch(msg);
      const c = planAction(
        task(series("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12")),
        { type: "changeRule", revision: "REV1", spec, restartCount: true, resetChecklists: false },
        ctxAt("2026-10-12T10:00"),
      );
      expect(c.kind, rule).toBe("blocked");
    }
    // Schalttag am Montag ist gültig und liegt seit dem 30-Jahres-Horizont im Suchbereich (R5).
    const leap = { rule: "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO", anchor: "calendar" as const, field: "due" as const, start: "2026-10-12", offsetDays: null };
    expect(planAction(task(plain), { type: "createSeries", spec: leap }, ctxAt("2026-10-12T10:00"))).toMatchObject({
      kind: "edit",
      set: { recurrence_instance: "2044-02-29" },
    });
  });
  it("gespeicherte unmögliche bzw. aufwendige Regel: Diagnose, kein Serienende", () => {
    for (const rule of ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", "FREQ=YEARLY;BYMONTH=1;BYYEARDAY=200"]) {
      const t = task(fm([`id: ${ID}`, "title: A", "status: open", `recurrence: ${rule}`]));
      const s = readSeries(t)!;
      expect(s.phase, rule).not.toBe("ended");
      expect(["blocked", "no-instance"]).toContain(s.phase);
      expect(s.diagnostics.length, rule).toBeGreaterThan(0);
      expect(t.fields.status).toBe("open");
    }
  });
  it("COUNT zusammen mit UNTIL wird zurückgewiesen", () => {
    expect(parseRule("FREQ=DAILY;COUNT=3;UNTIL=20261231").status).toBe("invalid");
    const plain = fm([`id: ${ID}`, "title: A", "status: open"]);
    const p = planAction(
      task(plain),
      { type: "createSeries", spec: { rule: "FREQ=DAILY;COUNT=3;UNTIL=20261231", anchor: "calendar", field: "due", start: "2026-10-12", offsetDays: null } },
      ctxAt("2026-10-12T10:00"),
    );
    expect(p.kind).toBe("blocked");
    const stored = series("calendar", "FREQ=DAILY;COUNT=3;UNTIL=20261231", "2026-10-12");
    expect(readSeries(task(stored))!.phase).toBe("blocked");
    expect(run(stored, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-12T10:00")).plan.kind).toBe("blocked");
  });
});

describe("AK-18: Wanduhrzeit und Completion-Basis", () => {
  it("09:00-Serie behält ihre Wanduhrzeit über den Wechsel am 25.10.2026", () => {
    const base = fm([
      `id: ${ID}`,
      "format_version: 1",
      "title: Täglich",
      "status: open",
      "due: 2026-10-24T09:00",
      "recurrence: FREQ=DAILY",
      "recurrence_revision: REV1",
      "recurrence_start: 2026-10-20T09:00",
      "recurrence_anchor: calendar",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-24",
    ]);
    const a = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-24" }, ctxAt("2026-10-24T09:30"));
    expect(task(a.text).data.due).toBe("2026-10-25T09:00");
    const b = run(a.text, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-25" }, ctxAt("2026-10-25T09:30"));
    expect(task(b.text).data.due).toBe("2026-10-26T09:00");
    // 09:00 Wanduhrzeit vor und nach der Umstellung: 07:00 UTC bzw. 08:00 UTC
    const at = (local: string) => buildIndex([task(a.text)], clockAtLocal(local, "Europe/Berlin")).tasks[0]!.overdue;
    expect(at("2026-10-25T08:59")).toBe(false);
    expect(at("2026-10-25T09:01")).toBe(true);
  });
  it("Completion-Basis ist der gespeicherte Aktionstag, Lesen in anderer Zone verschiebt nichts", () => {
    const base = series("completion", "FREQ=WEEKLY", "2026-10-12");
    // 00:30 in Berlin ist noch der 12.10. in Los Angeles; maßgeblich ist der Tag der Aktion in ihrer Zone.
    const r = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-13T00:30"));
    const t = task(r.text);
    expect(t.data.last_completed_at).toBe("2026-10-13T00:30:00+02:00");
    const B = storedCalendarDay(t.data.last_completed_at)!;
    expect(B.toString()).toBe("2026-10-13");
    expect(t.data.due).toBe(B.add({ days: 7 }).toString());
    for (const zone of ["Europe/Berlin", "America/Los_Angeles", "Pacific/Kiritimati", "UTC"]) {
      const v = buildIndex([t], clockAtLocal("2026-10-13T12:00", zone)).tasks[0]!;
      expect(v.dueDate?.toString(), zone).toBe("2026-10-20");
      expect(v.series?.instance?.toString(), zone).toBe("2026-10-20");
      expect(v.series?.lastCompletedAt).toBe("2026-10-13T00:30:00+02:00");
    }
  });
});

describe("AK-18/5.3: Offset-Import im anderen Datumsfeld", () => {
  // KERNFEHLER (actions.ts, datesForInstance/withTimeOf): Ein Offset-Wert im anderen Feld wird beim
  // Fortschreiben in UTC-Wanduhrzeit ohne Offset umgeschrieben („09:00+02:00“ → „07:00“), und der
  // abgeleitete Abstand nimmt den UTC-Datumsanteil (00:30+02:00 zählt als Vortag). Nach 3.3/5.3 bleibt
  // die Uhrzeit des anderen Felds erhalten. Kern nicht geändert (Dateigrenze), daher übersprungen.
  const withScheduled = (scheduled: string) =>
    fm([
      `id: ${ID}`,
      "format_version: 1",
      "title: S",
      "status: open",
      "due: 2026-10-16",
      `scheduled: ${scheduled}`,
      "recurrence: FREQ=WEEKLY;BYDAY=FR",
      "recurrence_revision: R",
      "recurrence_start: 2026-10-02",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-16",
    ]);
  it("behält die Wanduhrzeit und den Kalendertag des Offset-Werts", () => {
    const a = run(withScheduled("2026-10-15T09:00:00+02:00"), { type: "completeOccurrence", revision: "R", instance: "2026-10-16" }, ctxAt("2026-10-16T10:00"));
    expect(task(a.text).data.due).toBe("2026-10-23");
    expect(task(a.text).data.scheduled).toBe("2026-10-22T09:00");
    const b = run(withScheduled("2026-10-16T00:30:00+02:00"), { type: "completeOccurrence", revision: "R", instance: "2026-10-16" }, ctxAt("2026-10-16T10:00"));
    expect(task(b.text).data.scheduled).toBe("2026-10-23T00:30");
  });
});

describe("AK-21: kein Checklisten-Reset bei Serienende", () => {
  const body = "- [x] erledigt\n- [ ] offen\n";
  it("COUNT ausgeschöpft (Kalender und Completion) und Serie beenden lassen den Body unverändert", () => {
    for (const anchor of ["calendar", "completion"] as const) {
      const base = series(anchor, anchor === "calendar" ? "FREQ=WEEKLY;BYDAY=MO;COUNT=1" : "FREQ=WEEKLY;COUNT=1", "2026-10-05", [], body);
      const r = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-05" }, ctxAt("2026-10-05T10:00"));
      expect(task(r.text).data.status, anchor).toBe("done");
      expect(task(r.text).body, anchor).toBe(body);
      expect(r.plan.kind === "edit" && r.plan.body).toBeFalsy();
    }
    const base = series("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-05", [], body);
    for (const completeCurrent of [true, false]) {
      const e = run(base, { type: "endSeries", revision: "REV1", instance: "2026-10-05", completeCurrent }, ctxAt("2026-10-05T10:00"));
      expect(task(e.text).body).toBe(body);
    }
    const until = series("calendar", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261005", "2026-10-05", [], body);
    expect(task(run(until, { type: "skipOccurrence", revision: "REV1", instance: "2026-10-05" }, ctxAt("2026-10-05T10:00")).text).body).toBe(body);
  });
});

describe("AK-41: Wiederholung entfernen erhält alle Historiendaten", () => {
  it("skipped_instances, last_completed_at und vorhandene Archivabschnitte bleiben im Archiv", () => {
    const base = series("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-19", [
      "complete_instances: [2026-10-05, 2026-10-12]",
      "skipped_instances: [2026-09-28]",
      "last_completed_at: 2026-10-12T18:00:00+02:00",
      "recurrence_offset_days: -1",
      "recurrence_archive:",
      "  - recurrence_revision: ALT",
      "    recurrence: FREQ=DAILY",
      "    complete_instances: [2026-09-01]",
      "    closed_reason: rule-change",
    ]);
    const r = run(base, { type: "removeRecurrence", revision: "REV1" }, ctxAt("2026-10-13T09:00"));
    const t = task(r.text);
    for (const f of ["recurrence", "recurrence_revision", "complete_instances", "skipped_instances", "last_completed_at", "recurrence_instance", "recurrence_offset_days"]) {
      expect(f in t.data, f).toBe(false);
    }
    const archive = t.data.recurrence_archive as Record<string, unknown>[];
    expect(archive).toHaveLength(2);
    expect(archive[0]).toEqual({
      recurrence_revision: "ALT",
      recurrence: "FREQ=DAILY",
      complete_instances: ["2026-09-01"],
      closed_reason: "rule-change",
    });
    expect(archive[1]).toMatchObject({
      recurrence_revision: "REV1",
      recurrence: "FREQ=WEEKLY;BYDAY=MO",
      recurrence_start: "2026-10-05",
      recurrence_instance: "2026-10-19",
      recurrence_offset_days: -1,
      complete_instances: ["2026-10-05", "2026-10-12"],
      skipped_instances: ["2026-09-28"],
      last_completed_at: "2026-10-12T18:00:00+02:00",
      closed_reason: "removed",
    });
    expect(t.data.due).toBe("2026-10-19");
    expect(readSeries(t)).toBeNull();
  });
});
