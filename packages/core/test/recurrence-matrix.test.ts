// Variantenmatrix für das Fortschreiben von Serien (PLAN1 Abschnitt 5 und 6).
// Jede Kombination aus Regel, Art, Ende, Uhrzeit, Bezugsfeld, Abstand, Aktionstag, Historie und
// Herkunft läuft durch dasselbe Orakel (seriesOracle.ts). Nichts darf stillschweigend liegen bleiben.
import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import {
  buildIndex,
  clockAtLocal,
  parseRule,
  planAction,
  queryOccurrences,
  readSeries,
  todayView,
  type Anchor,
  type RefField,
} from "../src";
import { ctxAt, fm, task, TZ } from "./helpers";
import { checkAdvance, runUntilEnd, type AdvanceKind } from "./seriesOracle";

const D = (s: string) => Temporal.PlainDate.from(s);

interface RuleCase {
  rule: string;
  start: string;
  anchor: Anchor;
}

const CALENDAR: [string, string][] = [
  ["FREQ=DAILY", "2026-10-12"],
  ["FREQ=DAILY;INTERVAL=3", "2026-10-12"],
  ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-10-12"],
  ["FREQ=WEEKLY;BYDAY=MO", "2026-10-12"],
  ["FREQ=WEEKLY;BYDAY=TU,TH", "2026-10-13"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU", "2026-10-17"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;WKST=SU", "2026-10-11"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR", "2026-10-12"],
  ["FREQ=WEEKLY", "2026-10-14"],
  ["FREQ=MONTHLY;BYMONTHDAY=1", "2026-11-01"],
  ["FREQ=MONTHLY;BYMONTHDAY=15", "2026-10-15"],
  ["FREQ=MONTHLY;BYMONTHDAY=28", "2026-10-28"],
  ["FREQ=MONTHLY;BYMONTHDAY=29", "2026-10-29"],
  ["FREQ=MONTHLY;BYMONTHDAY=30", "2026-10-30"],
  ["FREQ=MONTHLY;BYMONTHDAY=31", "2026-10-31"],
  ["FREQ=MONTHLY;BYMONTHDAY=-1", "2026-10-31"],
  ["FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1", "2026-10-29"],
  ["FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1", "2026-10-30"],
  ["FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=-1", "2026-10-31"],
  ["FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15", "2026-10-15"],
  ["FREQ=MONTHLY;BYDAY=1MO", "2026-10-05"],
  ["FREQ=MONTHLY;BYDAY=2TU", "2026-10-13"],
  ["FREQ=MONTHLY;BYDAY=4SU", "2026-10-25"],
  ["FREQ=MONTHLY;BYDAY=-1FR", "2026-10-30"],
  ["FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", "2026-10-30"],
  ["FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=12", "2026-10-12"],
  ["FREQ=YEARLY", "2026-10-12"],
  ["FREQ=YEARLY;INTERVAL=2", "2026-10-12"],
  ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", "2028-02-29"],
  ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "2027-02-28"],
  ["FREQ=YEARLY;INTERVAL=2;BYMONTH=1;BYMONTHDAY=31", "2027-01-31"],
  ["FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=30", "2026-04-30"],
  ["FREQ=YEARLY;BYYEARDAY=100", "2026-04-10"],
  ["FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO", "2026-12-28"],
  ["FREQ=YEARLY;BYDAY=1MO;BYMONTH=9", "2026-09-07"],
  ["RRULE:FREQ=WEEKLY;BYDAY=FR", "2026-10-16"],
];

const COMPLETION: [string, string][] = [
  ["FREQ=DAILY", "2026-10-12"],
  ["FREQ=DAILY;INTERVAL=3", "2026-10-12"],
  ["FREQ=WEEKLY", "2026-10-12"],
  ["FREQ=WEEKLY;INTERVAL=2", "2026-10-12"],
  ["FREQ=MONTHLY", "2026-10-12"],
  ["FREQ=MONTHLY;INTERVAL=2", "2026-10-12"],
  ["FREQ=YEARLY", "2026-10-12"],
  ["FREQ=YEARLY;INTERVAL=2", "2026-10-12"],
  // Fremdregeln mit BY-Teilen (nicht vom Formular erzeugbar, aber lesbar)
  ["FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-10-12"],
  ["FREQ=MONTHLY;BYMONTHDAY=-1", "2026-10-31"],
  ["FREQ=MONTHLY;BYDAY=1MO", "2026-10-05"],
];

type End = "never" | "count1" | "count3" | "until";
const ENDS: End[] = ["never", "count1", "count3", "until"];

type Provenance = "full" | "minimal" | "noversion";
type Other = "none" | "derived" | "explicit3" | "explicit0instant";
type When = "atK" | "early" | "late" | "verylate";
type History = "empty" | "earlier" | "exception";

interface Scenario {
  name: string;
  provenance: Provenance;
  time: string | null;
  field: RefField;
  other: Other;
  when: When;
  history: History;
  kind: AdvanceKind;
  status?: "in-progress";
}

const SCENARIOS: Scenario[] = [
  {
    name: "S1 Standard",
    provenance: "full",
    time: null,
    field: "due",
    other: "none",
    when: "atK",
    history: "empty",
    kind: "complete",
  },
  {
    name: "S2 Uhrzeit, Abstand abgeleitet, verspätet, Historie",
    provenance: "full",
    time: "09:30",
    field: "due",
    other: "derived",
    when: "late",
    history: "earlier",
    kind: "complete",
  },
  {
    name: "S3 Geplant als Bezug, Abstand +3, vorzeitig, Ausnahme, Skip",
    provenance: "full",
    time: null,
    field: "scheduled",
    other: "explicit3",
    when: "early",
    history: "exception",
    kind: "skip",
  },
  {
    name: "S4 Fremddatei minimal, sehr spät",
    provenance: "minimal",
    time: null,
    field: "due",
    other: "derived",
    when: "verylate",
    history: "empty",
    kind: "complete",
  },
  {
    name: "S5 ohne format_version, Uhrzeit, Offset-Wert, in Arbeit",
    provenance: "noversion",
    time: "09:30",
    field: "scheduled",
    other: "explicit0instant",
    when: "atK",
    history: "exception",
    kind: "complete",
    status: "in-progress",
  },
];

const BODY = "## Ablauf\n- [x] erledigt\n- [ ] offen\n\n```\n- [x] bleibt im Code-Block\n```\n";
const TAGS = "tags: [routine]   # unbekanntes Feld, bleibt erhalten";

function ruleText(
  base: string,
  end: End,
  start: Temporal.PlainDate,
  anchor: Anchor,
  time: string | null,
): string {
  switch (end) {
    case "never":
      return base;
    case "count1":
      return `${base};COUNT=1`;
    case "count3":
      return `${base};COUNT=3`;
    case "until": {
      let limit: Temporal.PlainDate;
      if (anchor === "calendar") {
        const p = parseRule(base);
        if (p.status !== "ok") throw new Error(p.message);
        const r = queryOccurrences({ rule: p.rule, start, limit: 3 });
        limit = r.dates[r.dates.length - 1]!;
      } else limit = start.add({ days: 100 });
      const d = limit.toString().replace(/-/g, "");
      return `${base};UNTIL=${d}${time ? "T235959" : ""}`;
    }
  }
}

interface Built {
  text: string;
  K: Temporal.PlainDate;
  rule: string;
}

function build(rc: RuleCase, end: End, sc: Scenario): Built | null {
  const start = D(rc.start);
  const rule = ruleText(rc.rule, end, start, rc.anchor, sc.time);
  const p = parseRule(rule);
  if (p.status !== "ok") throw new Error(`${rule}: ${p.message}`);
  let K: Temporal.PlainDate;
  let C: string[] = [];
  let S: string[] = [];
  if (rc.anchor === "calendar") {
    const occ = queryOccurrences({ rule: p.rule, start, limit: 6 }).dates;
    if (!occ.length) return null;
    if (sc.history === "earlier" && occ.length >= 3) {
      K = occ[2]!;
      C = [occ[0]!.toString(), occ[1]!.toString()];
    } else K = occ[0]!;
    if (sc.history === "exception") {
      const i = occ.findIndex((d) => d.equals(K));
      if (occ[i + 1]) S = [occ[i + 1]!.toString()];
    }
  } else {
    K = start;
    if (sc.history === "earlier")
      C = [start.subtract({ days: 30 }).toString(), start.subtract({ days: 15 }).toString()];
    if (sc.history === "exception")
      S = [start.add({ days: 1 }).toString(), start.add({ days: 7 }).toString()];
  }
  const t = sc.time ? `T${sc.time}` : "";
  const other: RefField = sc.field === "due" ? "scheduled" : "due";
  const lines: string[] = [];
  const full = sc.provenance !== "minimal";
  if (full) lines.push("id: 01K6B2N8R4T6V8X0Z2C4E6G8J0");
  if (sc.provenance === "full") lines.push("format_version: 1");
  lines.push("title: Serie", `status: ${sc.status ?? "open"}`, "priority: normal", "inbox: false");
  lines.push(`${sc.field}: ${K}${t}`);
  let offsetLine: string | null = null;
  switch (sc.other) {
    case "none":
      break;
    case "derived":
      lines.push(`${other}: ${K.subtract({ days: 1 })}${sc.time ? "T08:00" : ""}`);
      break;
    case "explicit3":
      lines.push(`${other}: ${K.add({ days: 3 })}`);
      offsetLine = "recurrence_offset_days: 3";
      break;
    case "explicit0instant":
      lines.push(`${other}: ${K}T07:00:00+02:00`);
      offsetLine = "recurrence_offset_days: 0";
      break;
  }
  lines.push(`recurrence: ${rule}`);
  if (full) lines.push("recurrence_revision: REV1");
  if (full) lines.push(`recurrence_start: ${rc.anchor === "calendar" ? start : K}${t}`);
  else if (sc.time) lines.push(`recurrence_start: ${K}${t}`);
  if (full || rc.anchor === "completion") lines.push(`recurrence_anchor: ${rc.anchor}`);
  if (full || sc.field === "scheduled") lines.push(`recurrence_field: ${sc.field}`);
  if (offsetLine) lines.push(offsetLine);
  if (full) lines.push(`recurrence_instance: ${K}`);
  if (C.length) lines.push(`complete_instances: [${C.join(", ")}]`);
  if (S.length) lines.push("skipped_instances:", ...S.map((d) => `  - ${d}`));
  if (C.length) lines.push("last_completed_at: 2026-09-30T18:00:00+02:00");
  lines.push(
    TAGS,
    "dateCreated: 2026-09-01T19:02:11+02:00",
    "dateModified: 2026-10-01T10:32:00+02:00",
  );
  return { text: fm(lines, BODY), K, rule };
}

function ctxFor(K: Temporal.PlainDate, when: When) {
  const day =
    when === "atK"
      ? K
      : when === "early"
        ? K.subtract({ days: 2 })
        : when === "late"
          ? K.add({ days: 1 })
          : K.add({ days: 40 });
  return ctxAt(`${day}T10:00`);
}

const ALL: RuleCase[] = [
  ...CALENDAR.map(([rule, start]) => ({ rule, start, anchor: "calendar" as const })),
  ...COMPLETION.map(([rule, start]) => ({ rule, start, anchor: "completion" as const })),
];

describe("Variantenmatrix: ein Schritt", () => {
  const cases: { name: string; rc: RuleCase; end: End; sc: Scenario }[] = [];
  for (const rc of ALL)
    for (const end of ENDS)
      for (const sc of SCENARIOS)
        cases.push({ name: `${rc.anchor} ${rc.rule} [${end}] ${sc.name}`, rc, end, sc });

  it.each(cases)("$name", ({ rc, end, sc, name }) => {
    const b = build(rc, end, sc);
    if (!b) return;
    const r = checkAdvance(b.text, sc.kind, ctxFor(b.K, sc.when), name);
    expect(r.text).toContain(TAGS);
    expect(r.text).toContain("- [x] bleibt im Code-Block");
    if (!r.ended) {
      expect(r.text).toContain("- [ ] erledigt");
      expect(r.text).toContain("- [ ] offen");
    }
  });
});

describe("Variantenmatrix: Serie bis zum Ende bzw. acht Schritte durchlaufen", () => {
  const cases = ALL.flatMap((rc) =>
    ENDS.map((end) => ({ name: `${rc.anchor} ${rc.rule} [${end}]`, rc, end })),
  );
  it.each(cases)("$name", ({ rc, end, name }) => {
    for (const sc of [SCENARIOS[0]!, SCENARIOS[1]!]) {
      const b = build(rc, end, sc);
      if (!b) continue;
      const r = runUntilEnd(
        b.text,
        8,
        (K) => ctxAt(`${K}T20:00`),
        (i) => (i % 3 === 2 ? "skip" : "complete"),
        `${name} ${sc.name}`,
      );
      const t = task(r.text);
      const s = readSeries(t)!;
      const p = parseRule(b.rule);
      const count = p.status === "ok" ? p.rule.count : null;
      if (count !== null) {
        if (rc.anchor === "completion") {
          // COUNT zählt Erledigungen; Überspringen zählt nicht (5.2). Eine Fremdhistorie mit mehr
          // Erledigungen als COUNT endet mit der ersten neuen Erledigung.
          const prior = readSeries(task(b.text))!.C.size;
          expect(r.ended, name).toBe(true);
          expect(s.C.size, `${name}: Completion-Erledigungen`).toBe(
            prior >= count ? prior + 1 : count,
          );
        } else {
          // Kalender: genau COUNT Regeltermine ab Start des Abschnitts (einschließlich Historie)
          expect(r.ended, name).toBe(true);
          expect(s.C.size + s.S.size, `${name}: Kalender-Schlüssel`).toBe(count);
        }
      }
      if (end === "never") expect(r.ended, name).toBe(false);
      if (r.ended) expect(t.fields.status).toBe("done");
      else expect(s.phase).toBe("active");
    }
  });
});

describe("Gesperrte Zustände schreiben nichts und bleiben sichtbar", () => {
  const base = (extra: string[], due = "due: 2026-10-12") =>
    fm([
      "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
      "format_version: 1",
      "title: Serie",
      "status: open",
      due,
      "recurrence: FREQ=WEEKLY;BYDAY=MO",
      "recurrence_revision: REV1",
      "recurrence_start: 2026-10-05",
      "recurrence_anchor: calendar",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-12",
      ...extra,
    ]);
  const cases: {
    name: string;
    text: string;
    phase: string;
    complete: "noop" | "blocked";
    skip: "noop" | "blocked";
  }[] = [
    {
      name: "K in C (clarify)",
      text: base(["complete_instances: [2026-10-12]"]),
      phase: "clarify",
      complete: "noop",
      skip: "blocked",
    },
    {
      name: "K in S",
      text: base(["skipped_instances: [2026-10-12]"]),
      phase: "clarify",
      complete: "blocked",
      skip: "noop",
    },
    {
      name: "K in C und S",
      text: base(["complete_instances: [2026-10-12]", "skipped_instances: [2026-10-12]"]),
      phase: "conflicting",
      complete: "noop",
      skip: "noop",
    },
    {
      name: "Regel erschöpft, Ende nicht übernommen",
      text: base(["complete_instances: [2026-10-12]"]).replace("BYDAY=MO", "BYDAY=MO;COUNT=2"),
      phase: "end-pending",
      complete: "noop",
      skip: "blocked",
    },
    {
      name: "nicht unterstützte Regel",
      text: base([]).replace("FREQ=WEEKLY;BYDAY=MO", "FREQ=DAILY;BYHOUR=8,20"),
      phase: "blocked",
      complete: "blocked",
      skip: "blocked",
    },
    {
      name: "ungültige Regel",
      text: base([]).replace("FREQ=WEEKLY;BYDAY=MO", "FREQ=WEEKLY;COUNT=2;UNTIL=20261231"),
      phase: "blocked",
      complete: "blocked",
      skip: "blocked",
    },
    {
      name: "Strukturfehler",
      text: base(["recurrence_offset_days: zwei"]),
      phase: "blocked",
      complete: "blocked",
      skip: "blocked",
    },
    {
      name: "kein Vorkommen bestimmbar",
      text: base([], "").replace("recurrence_instance: 2026-10-12", "recurrence_instance: nie"),
      phase: "blocked",
      complete: "blocked",
      skip: "blocked",
    },
  ];
  it.each(cases)("$name", ({ text, phase, complete, skip }) => {
    const t = task(text);
    const s = readSeries(t)!;
    expect(s.phase).toBe(phase);
    expect(s.diagnostics.length).toBeGreaterThan(0);
    for (const [type, want] of [
      ["completeOccurrence", complete],
      ["skipOccurrence", skip],
    ] as const) {
      for (const day of ["2026-10-08T10:00", "2026-10-12T10:00", "2026-11-20T10:00"]) {
        const p = planAction(
          t,
          { type, revision: s.revisionKey, instance: "2026-10-12" },
          ctxAt(day),
        );
        expect(p.kind, `${type} am ${day}`).toBe(want);
        // auch der generische Befehl aus der Liste schreibt nichts
        const g = planAction(t, { type: "complete" }, ctxAt(day));
        expect(g.kind, `complete am ${day}`).not.toBe("edit");
      }
    }
    const idx = buildIndex([t], clockAtLocal("2026-10-20T10:00", TZ));
    expect(idx.tasks).toHaveLength(1);
    const v = idx.tasks[0]!;
    if (phase === "clarify" && s.proposal)
      expect(v.dueDate?.toString()).toBe(s.proposal.toString());
    expect(v.diagnostics.some((d) => d.severity !== "info")).toBe(true);
  });
});

describe("Heute-Ansicht nach dem Fortschreiben", () => {
  it("tägliche Aufgabe verschwindet heute aus Fällig und steht morgen wieder dort", () => {
    const text = fm([
      "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
      "format_version: 1",
      "title: Täglich",
      "status: open",
      "due: 2026-10-12",
      "recurrence: FREQ=DAILY",
      "recurrence_revision: REV1",
      "recurrence_start: 2026-10-12",
      "recurrence_anchor: calendar",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-12",
    ]);
    const r = checkAdvance(text, "complete", ctxAt("2026-10-12T10:00"), "Heute");
    const t = task(r.text);
    const today = todayView(buildIndex([t], clockAtLocal("2026-10-12T10:05", TZ)), TZ);
    expect(today.due).toHaveLength(0);
    const tomorrow = todayView(buildIndex([t], clockAtLocal("2026-10-13T00:01", TZ)), TZ);
    expect(tomorrow.due.map((v) => v.task.fields.title)).toEqual(["Täglich"]);
    expect(tomorrow.due[0]!.overdue).toBe(false);
    const later = todayView(buildIndex([t], clockAtLocal("2026-10-14T00:01", TZ)), TZ);
    expect(later.due[0]!.overdue).toBe(true);
  });
});

describe("Zeitumstellung und Zeitzonen", () => {
  const daily = (time: string, k: string) =>
    fm([
      "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
      "format_version: 1",
      "title: Täglich",
      "status: open",
      `due: ${k}T${time}`,
      `scheduled: ${k}T07:00`,
      "recurrence: FREQ=DAILY",
      "recurrence_revision: REV1",
      `recurrence_start: 2026-01-01T${time}`,
      "recurrence_anchor: calendar",
      "recurrence_field: due",
      `recurrence_instance: ${k}`,
    ]);
  for (const tz of ["Europe/Berlin", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    it(`${tz}: Serie 02:30 über die Umstellungen 29.03. und 25.10.2026`, () => {
      for (const [k, actions] of [
        [
          "2026-03-28",
          ["2026-03-28T23:59", "2026-03-29T02:30", "2026-03-29T03:00", "2026-03-30T00:00"],
        ],
        [
          "2026-10-24",
          ["2026-10-24T23:59", "2026-10-25T02:30", "2026-10-25T03:00", "2026-10-26T00:00"],
        ],
      ] as const) {
        let text = daily("02:30", k);
        for (const at of actions) {
          const s = readSeries(task(text))!;
          const r = checkAdvance(text, "complete", ctxAt(at, tz), `${tz} ${at}`);
          expect(r.next, `${tz} ${at}`).toBe(s.instance!.add({ days: 1 }).toString());
          expect(task(r.text).data.scheduled).toBe(`${r.next}T07:00`);
          text = r.text;
        }
      }
    });
  }
  it("Completion-Basis ist der Aktionstag in der Gerätezone (Kiritimati vs. Los Angeles)", () => {
    const text = fm([
      "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
      "format_version: 1",
      "title: W",
      "status: open",
      "due: 2026-10-12",
      "recurrence: FREQ=WEEKLY",
      "recurrence_revision: REV1",
      "recurrence_start: 2026-10-12",
      "recurrence_anchor: completion",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-12",
    ]);
    const a = checkAdvance(
      text,
      "complete",
      ctxAt("2026-10-13T00:30", "Pacific/Kiritimati"),
      "Kiritimati",
    );
    expect(a.next).toBe("2026-10-20");
    const b = checkAdvance(
      text,
      "complete",
      ctxAt("2026-10-13T00:30", "America/Los_Angeles"),
      "LA",
    );
    expect(b.next).toBe("2026-10-20");
    expect(task(a.text).data.last_completed_at).toBe("2026-10-13T00:30:00+14:00");
    expect(task(b.text).data.last_completed_at).toBe("2026-10-13T00:30:00-07:00");
  });
});

describe("Befunde dieser Testrunde (behoben)", () => {
  it("Fremddatei ohne recurrence_start: COUNT und Raster bleiben am ersten Schreiben verankert", () => {
    for (const rule of [
      "FREQ=WEEKLY;BYDAY=MO;COUNT=3",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;COUNT=3",
    ]) {
      const text = fm(["title: X", "status: open", "due: 2026-10-12", `recurrence: ${rule}`]);
      const first = readSeries(task(text))!;
      const r = runUntilEnd(
        text,
        6,
        (K) => ctxAt(`${K}T10:00`),
        () => "complete",
        rule,
      );
      expect(r.ended, rule).toBe(true);
      expect(r.keys, rule).toHaveLength(3);
      const t = task(r.text);
      expect(t.data.recurrence_start, rule).toBe("2026-10-12");
      expect(t.data.recurrence_revision, rule).toBeDefined();
      // Die alte, noch nicht materialisierte Kennung erkennt die Datei weiterhin: ein zweiter Tipp ist ein No-op.
      const again = planAction(
        task(r.text),
        { type: "completeOccurrence", revision: first.revisionKey, instance: "2026-10-12" },
        ctxAt("2026-10-12T10:00"),
      );
      expect(again.kind, rule).toBe("noop");
    }
  });
  it("Fremddatei mit Termin neben dem Raster: abgeleiteter Start wird festgehalten, Hinweis bleibt, COUNT stimmt", () => {
    const text = fm([
      "title: X",
      "status: open",
      "due: 2026-10-16",
      "recurrence: FREQ=WEEKLY;BYDAY=MO;COUNT=2",
    ]);
    expect(readSeries(task(text))!.diagnostics.map((d) => d.code)).toContain(
      "series-start-mismatch",
    );
    const r = checkAdvance(text, "complete", ctxAt("2026-10-16T10:00"), "neben dem Raster");
    expect(r.next).toBe("2026-10-19");
    const t = task(r.text);
    expect(t.data.recurrence_start).toBe("2026-10-16");
    expect(readSeries(t)!.diagnostics.map((d) => d.severity)).toEqual(["info"]);
    // COUNT=2 zählt die Regeltermine 19.10. und 26.10.; der Fremdtermin 16.10. zählt nicht mit.
    const r2 = checkAdvance(r.text, "complete", ctxAt("2026-10-19T10:00"), "neben dem Raster 2");
    expect(r2.next).toBe("2026-10-26");
    expect(
      checkAdvance(r2.text, "complete", ctxAt("2026-10-26T10:00"), "neben dem Raster 3").ended,
    ).toBe(true);
  });
  it("Fremddatei mit Revision, aber ohne Start: Start wird beim ersten Schreiben ergänzt", () => {
    const text = fm([
      "title: X",
      "status: open",
      "due: 2026-10-12",
      "recurrence: FREQ=DAILY;COUNT=2",
      "recurrence_revision: R9",
    ]);
    const r = runUntilEnd(
      text,
      4,
      (K) => ctxAt(`${K}T10:00`),
      () => "complete",
      "mit Revision",
    );
    expect(r.ended).toBe(true);
    expect(r.keys).toEqual(["2026-10-12", "2026-10-13"]);
    expect(task(r.text).data.recurrence_start).toBe("2026-10-12");
  });
});

describe("Befunde dieser Testrunde (behoben, Anzeige)", () => {
  it("clarify-Vorschlag: Abstand des anderen Felds in der Gerätezone, wie beim Fortschreiben", () => {
    const text = fm([
      "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
      "format_version: 1",
      "title: S",
      "status: open",
      "due: 2026-10-16T00:30:00+02:00",
      "scheduled: 2026-10-15",
      "recurrence: FREQ=WEEKLY;BYDAY=FR",
      "recurrence_revision: R",
      "recurrence_start: 2026-10-02",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-16",
    ]);
    // Was das Fortschreiben schreiben würde:
    const r = checkAdvance(text, "complete", ctxAt("2026-10-16T10:00"), "Vergleich");
    expect(task(r.text).data.scheduled).toBe("2026-10-22");
    // Dieselbe Datei mit bereits aufgelöstem K zeigt den Vorschlag mit demselben Abstand:
    const v = buildIndex(
      [
        task(
          text.replace(
            "recurrence_instance: 2026-10-16",
            "recurrence_instance: 2026-10-16\ncomplete_instances: [2026-10-16]",
          ),
        ),
      ],
      clockAtLocal("2026-10-17T12:00", TZ),
    ).tasks[0]!;
    expect(v.series?.phase).toBe("clarify");
    expect(v.dueDate?.toString()).toBe("2026-10-23");
    expect(v.scheduledDate?.toString()).toBe("2026-10-22");
  });
});

describe("Entscheidungen vom 23.10.2026 (Fragen-Tool)", () => {
  // Ab Erledigung ohne BY-Teile: fester Abstand ab dem Erledigungstag mit Klemmen ans Monatsende,
  // jeweils vom Erledigungstag aus gerechnet. Regeln mit BY-Teilen bleiben bei rrule ab B.
  const comp = (rule: string, k: string, extra: string[] = []) =>
    fm([
      "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
      "format_version: 1",
      "title: M",
      "status: open",
      `due: ${k}`,
      `recurrence: ${rule}`,
      "recurrence_revision: REV1",
      `recurrence_start: ${k}`,
      "recurrence_anchor: completion",
      "recurrence_field: due",
      `recurrence_instance: ${k}`,
      ...extra,
    ]);
  it.each([
    ["FREQ=MONTHLY", "2026-10-31", "2026-10-31T10:00", "2026-11-30"],
    ["FREQ=MONTHLY", "2026-10-30", "2027-01-30T10:00", "2027-02-28"],
    ["FREQ=MONTHLY;INTERVAL=2", "2026-10-31", "2026-12-31T10:00", "2027-02-28"],
    ["FREQ=MONTHLY;INTERVAL=3", "2026-10-31", "2026-11-30T10:00", "2027-02-28"],
    ["FREQ=YEARLY", "2028-02-29", "2028-02-29T10:00", "2029-02-28"],
    ["FREQ=YEARLY;INTERVAL=4", "2028-02-29", "2028-02-29T10:00", "2032-02-29"],
    ["FREQ=DAILY;INTERVAL=10", "2026-10-31", "2026-12-25T10:00", "2027-01-04"],
    // mit BY-Teilen weiterhin rrule ab B
    ["FREQ=MONTHLY;BYMONTHDAY=-1", "2026-10-31", "2026-11-15T10:00", "2026-11-30"],
    ["FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-10-12", "2026-10-13T10:00", "2026-10-14"],
  ])("%s, erledigt am %s → %s", (rule, k, at, next) => {
    const r = checkAdvance(comp(rule, k), "complete", ctxAt(at), rule);
    expect(r.next).toBe(next);
  });
  it("Kollision: belegter Monatstermin wird vom Erledigungstag aus übersprungen, nicht verkettet", () => {
    // Erledigt am 31.10.; 30.11. ist schon aufgelöst → 31.12. (31.10. + 2 Monate), nicht 30.12.
    const r = checkAdvance(
      comp("FREQ=MONTHLY", "2026-10-31", ["skipped_instances: [2026-11-30]"]),
      "complete",
      ctxAt("2026-10-31T10:00"),
      "Kollision",
    );
    expect(r.next).toBe("2026-12-31");
  });
  it("UNTIL beendet die Completion-Serie auch beim festen Abstand", () => {
    const r = checkAdvance(
      comp("FREQ=MONTHLY;UNTIL=20261130", "2026-10-31"),
      "complete",
      ctxAt("2026-10-31T10:00"),
      "UNTIL",
    );
    expect(r.next).toBe("2026-11-30");
    expect(checkAdvance(r.text, "complete", ctxAt("2026-11-30T10:00"), "UNTIL Ende").ended).toBe(
      true,
    );
  });
  it("Vorschau beim Erledigen zeigt denselben Folgetermin und nennt übergangene Termine", async () => {
    const { previewSeriesAction } = await import("../src");
    const t = task(comp("FREQ=MONTHLY", "2026-10-31", ["skipped_instances: [2026-11-30]"]));
    const p = previewSeriesAction(
      t,
      { type: "completeOccurrence", revision: "REV1", instance: "2026-10-31" },
      ctxAt("2026-10-31T10:00"),
    );
    expect(p.instance?.toString()).toBe("2026-12-31");
    expect(p.passedOver.map((x) => [x.date.toString(), x.reason])).toEqual([
      ["2026-11-30", "skipped"],
    ]);
  });
  it("Kalender mit COUNT: versäumte Termine verkürzen die Serie (5.2, versäumte Slots verlängern nicht)", () => {
    const text = fm([
      "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
      "format_version: 1",
      "title: C",
      "status: open",
      "due: 2026-10-12",
      "recurrence: FREQ=WEEKLY;BYDAY=MO;COUNT=3",
      "recurrence_revision: REV1",
      "recurrence_start: 2026-10-12",
      "recurrence_anchor: calendar",
      "recurrence_field: due",
      "recurrence_instance: 2026-10-12",
    ]);
    const r = checkAdvance(text, "complete", ctxAt("2026-10-30T10:00"), "spät");
    expect(r.ended).toBe(true);
    expect(readSeries(task(r.text))!.C.size).toBe(1);
  });
});
