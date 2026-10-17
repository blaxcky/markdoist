import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readSeries } from "../src";
import { ctxAt, fm, run, task } from "./helpers";

const wochenrueckblick = fm(
  [
    "id: 01K69X4D2M7Q0B5T8V3W6Y1Z4C",
    "format_version: 1",
    "title: Wochenrückblick",
    "status: open",
    "priority: normal",
    "inbox: false",
    "due: 2026-10-16",
    "scheduled: 2026-10-15",
    "recurrence: FREQ=WEEKLY;BYDAY=FR",
    "recurrence_revision: 01K69X4D2M7Q0B5T8V3W6Y1Z4D",
    "recurrence_start: 2026-09-04",
    "recurrence_anchor: calendar",
    "recurrence_field: due",
    "recurrence_offset_days: -1",
    "recurrence_instance: 2026-10-16",
    "complete_instances:",
    "  - 2026-09-04",
    "  - 2026-09-11",
    "  - 2026-09-25",
    "  - 2026-10-02",
    "skipped_instances:",
    "  - 2026-09-18",
    "last_completed_at: 2026-10-10T10:32:00+02:00",
    "tags: [routine]   # unbekanntes Feld, bleibt erhalten",
    "dateCreated: 2026-09-01T19:02:11+02:00",
    "dateModified: 2026-10-10T10:32:00+02:00",
  ],
  "## Ablauf\n- [x] Erledigtes der Woche durchsehen\n- [ ] Eingang leeren\n\nNotizen bleiben.\n",
);

const REV = "01K69X4D2M7Q0B5T8V3W6Y1Z4D";

describe("Beispiel 3.4 b – Kalenderwiederholung", () => {
  it("Erledigung am Mo 19.10. → Fr 23.10., Do 22.10., Checklisten zurück", () => {
    const { text, plan } = run(
      wochenrueckblick,
      { type: "completeOccurrence", revision: REV, instance: "2026-10-16" },
      ctxAt("2026-10-19T09:00"),
    );
    expect(plan.kind).toBe("edit");
    const t = task(text);
    expect(t.data.due).toBe("2026-10-23");
    expect(t.data.scheduled).toBe("2026-10-22");
    expect(t.data.recurrence_instance).toBe("2026-10-23");
    expect(t.data.complete_instances).toContain("2026-10-16");
    expect(t.data.inbox).toBe(false);
    expect(t.body).toContain("- [ ] Erledigtes");
    expect(text).toContain("tags: [routine]   # unbekanntes Feld, bleibt erhalten");
    expect(text).toContain("recurrence: FREQ=WEEKLY;BYDAY=FR\n");
  });

  it("AK-15: wiederholtes Erledigen ist ein No-op", () => {
    const action = { type: "completeOccurrence", revision: REV, instance: "2026-10-16" } as const;
    const once = run(wochenrueckblick, action, ctxAt("2026-10-19T09:00")).text;
    const twice = run(once, action, ctxAt("2026-10-19T09:05"));
    expect(twice.plan.kind).toBe("noop");
    expect(twice.text).toBe(once);
  });

  it("AK-15: Erledigen gegen übersprungenes K schreibt nicht", () => {
    const skipped = run(
      wochenrueckblick,
      { type: "skipOccurrence", revision: REV, instance: "2026-10-16" },
      ctxAt("2026-10-16T09:00"),
    ).text;
    const r = run(skipped, { type: "completeOccurrence", revision: REV, instance: "2026-10-16" }, ctxAt("2026-10-16T10:00"));
    expect(r.plan.kind).toBe("blocked");
    const again = run(skipped, { type: "skipOccurrence", revision: REV, instance: "2026-10-16" }, ctxAt("2026-10-16T10:00"));
    expect(again.plan.kind).toBe("noop");
  });

  it("AK-15: veraltete Revision schreibt nichts", () => {
    const r = run(
      wochenrueckblick,
      { type: "completeOccurrence", revision: "01ALT", instance: "2026-10-16" },
      ctxAt("2026-10-19T09:00"),
    );
    expect(r.plan.kind).toBe("blocked");
  });
});

const weekly = (anchor: "calendar" | "completion", rule: string, k: string, extra: string[] = []) =>
  fm([
    "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
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
  ]);

describe("AK-13", () => {
  it("Kalender: Mo 05.10. erledigt am Do 08.10. → 12.10.", () => {
    const t = run(
      weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-05"),
      { type: "completeOccurrence", revision: "REV1", instance: "2026-10-05" },
      ctxAt("2026-10-08T12:00"),
    ).text;
    expect(task(t).data.due).toBe("2026-10-12");
  });
  it("Completion: erledigt am Do 08.10. → 15.10.", () => {
    const t = run(
      weekly("completion", "FREQ=WEEKLY", "2026-10-05"),
      { type: "completeOccurrence", revision: "REV1", instance: "2026-10-05" },
      ctxAt("2026-10-08T12:00"),
    ).text;
    expect(task(t).data.due).toBe("2026-10-15");
  });
  it("Kalender: Vorkommen 19.10. am 15.10. erledigt → 26.10.", () => {
    const t = run(
      weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-19"),
      { type: "completeOccurrence", revision: "REV1", instance: "2026-10-19" },
      ctxAt("2026-10-15T12:00"),
    ).text;
    expect(task(t).data.due).toBe("2026-10-26");
  });
});

describe("AK-30 Completion-Kollision", () => {
  it("K=19.10., erledigt am 12.10. → 26.10.", () => {
    const t = run(
      weekly("completion", "FREQ=WEEKLY", "2026-10-19"),
      { type: "completeOccurrence", revision: "REV1", instance: "2026-10-19" },
      ctxAt("2026-10-12T12:00"),
    ).text;
    expect(task(t).data.due).toBe("2026-10-26");
  });
});

describe("AK-12: zehnmal erledigen", () => {
  it("inbox bleibt false, eine Datei", () => {
    let text = weekly("calendar", "FREQ=DAILY", "2026-10-05");
    for (let i = 0; i < 10; i++) {
      const t = task(text);
      const k = String(t.data.recurrence_instance);
      text = run(text, { type: "completeOccurrence", revision: "REV1", instance: k }, ctxAt(`${k}T20:00`)).text;
    }
    const t = task(text);
    expect(t.data.inbox).toBe(false);
    expect((t.data.complete_instances as string[]).length).toBe(10);
    expect(t.data.due).toBe("2026-10-15");
  });
});

describe("AK-14: Reihenfolge und Duplikate der Historie egal", () => {
  it("Eigenschaftstest", () => {
    const keys = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
    fc.assert(
      fc.property(
        fc.shuffledSubarray(keys, { minLength: 0 }),
        fc.array(fc.constantFrom(...keys), { maxLength: 4 }),
        (perm, dups) => {
          const c = [...perm, ...dups].filter((k) => k !== "2026-10-12");
          const base = (list: string[]) =>
            weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12", [
              list.length ? `complete_instances: [${list.join(", ")}]` : "complete_instances: []",
            ]);
          const sorted = [...new Set(c)].sort();
          const a = run(base(c), { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-12T10:00"));
          const b = run(base(sorted), { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-12T10:00"));
          expect(task(a.text).data.due).toBe(task(b.text).data.due);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("AK-16: stabiles Einlesen", () => {
  const inconsistent = weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-05", ["complete_instances: [2026-10-05]"]);
  it("Kalender: Vorschlag 12.10. unabhängig vom Lesetag, Aktionen gesperrt", () => {
    const s = readSeries(task(inconsistent))!;
    expect(s.phase).toBe("clarify");
    expect(s.proposal?.toString()).toBe("2026-10-12");
    for (const day of ["2026-10-08T10:00", "2026-10-20T10:00"]) {
      const r = run(inconsistent, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-05" }, ctxAt(day));
      expect(r.plan.kind).toBe("noop"); // K bereits in C: immer No-op
      const r2 = run(inconsistent, { type: "skipOccurrence", revision: "REV1", instance: "2026-10-05" }, ctxAt(day));
      expect(r2.plan.kind).toBe("blocked");
    }
  });
  it("Completion mit unklarer Basis: clarify ohne Vorschlag", () => {
    const s = readSeries(task(weekly("completion", "FREQ=WEEKLY", "2026-10-05", ["skipped_instances: [2026-10-05]"])))!;
    expect(s.phase).toBe("clarify");
    expect(s.proposal).toBeNull();
  });
});

describe("COUNT und Serienende (AK-32)", () => {
  it("Kalender COUNT=1 endet nach Auflösung, erneutes Erledigen No-op", () => {
    const base = weekly("calendar", "FREQ=WEEKLY;BYDAY=MO;COUNT=1", "2026-10-05");
    const a = { type: "completeOccurrence", revision: "REV1", instance: "2026-10-05" } as const;
    const once = run(base, a, ctxAt("2026-10-05T10:00"));
    const t = task(once.text);
    expect(t.data.status).toBe("done");
    expect(t.data.recurrence_instance).toBe("2026-10-05");
    const twice = run(once.text, a, ctxAt("2026-10-05T11:00"));
    expect(twice.plan.kind).toBe("noop");
    // ausgeschöpfte Serie wiederöffnen: kein automatischer Neustart
    const reopen = run(once.text, { type: "reopenSeries", revision: "REV1" }, ctxAt("2026-10-06T10:00"));
    expect(reopen.plan.kind).toBe("blocked");
  });
  it("Completion COUNT=1: Skip lässt eine Erledigung übrig", () => {
    const base = weekly("completion", "FREQ=WEEKLY;COUNT=1", "2026-10-05");
    const s = run(base, { type: "skipOccurrence", revision: "REV1", instance: "2026-10-05" }, ctxAt("2026-10-05T10:00"));
    const t = task(s.text);
    expect(t.data.status).toBe("open");
    expect(t.data.due).toBe("2026-10-12");
    const c = run(s.text, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-12T10:00"));
    expect(task(c.text).data.status).toBe("done");
  });
  it("Serie beenden ist idempotent", () => {
    const base = weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-05");
    const e = run(base, { type: "endSeries", revision: "REV1", instance: "2026-10-05", completeCurrent: false }, ctxAt("2026-10-05T10:00"));
    const e2 = run(e.text, { type: "endSeries", revision: "REV1", instance: "2026-10-05", completeCurrent: false }, ctxAt("2026-10-05T11:00"));
    expect(e2.plan.kind).toBe("noop");
    const r = run(e.text, { type: "reopenSeries", revision: "REV1" }, ctxAt("2026-10-06T10:00"));
    expect(task(r.text).data.status).toBe("open");
    expect(task(r.text).data.due).toBe("2026-10-05");
  });
});

describe("AK-29: COUNT-Neustart mit Archiv (Beispiel 3.4 d)", () => {
  it("neuer Abschnitt, fünf Termine, alte Historie im Archiv", () => {
    const base = weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12", [
      "complete_instances: [2026-09-28, 2026-10-05]",
      "last_completed_at: 2026-10-05T18:00:00+02:00",
    ]).replace("recurrence_start: 2026-10-05", "recurrence_start: 2026-09-28");
    const ctx = ctxAt("2026-10-12T09:00");
    const r = run(
      base,
      {
        type: "changeRule",
        revision: "REV1",
        spec: { rule: "FREQ=WEEKLY;BYDAY=MO;COUNT=5", anchor: "calendar", field: "due", start: "2026-10-12", offsetDays: null },
        restartCount: true,
        resetChecklists: false,
      },
      ctx,
    );
    let t = task(r.text);
    expect(t.data.recurrence_start).toBe("2026-10-12");
    expect(t.data.recurrence_instance).toBe("2026-10-12");
    expect(t.data.complete_instances).toBeUndefined();
    expect(t.data.last_completed_at).toBeUndefined();
    const archive = t.data.recurrence_archive as Record<string, unknown>[];
    expect(archive).toHaveLength(1);
    expect(archive[0]!.complete_instances).toEqual(["2026-09-28", "2026-10-05"]);
    expect(archive[0]!.closed_reason).toBe("rule-change");
    const rev = String(t.data.recurrence_revision);
    let text = r.text;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      t = task(text);
      const k = String(t.data.recurrence_instance);
      seen.push(k);
      text = run(text, { type: "completeOccurrence", revision: rev, instance: k }, ctxAt(`${k}T10:00`)).text;
    }
    expect(seen).toEqual(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(task(text).data.status).toBe("done");
  });

  it("dieselbe Regel ohne Neustart startet keinen Abschnitt", () => {
    const base = weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12");
    const r = run(
      base,
      {
        type: "changeRule",
        revision: "REV1",
        spec: { rule: "FREQ=WEEKLY;BYDAY=MO", anchor: "calendar", field: "due", start: "2026-10-05", offsetDays: null },
        restartCount: false,
        resetChecklists: false,
      },
      ctxAt("2026-10-12T09:00"),
    );
    expect(r.plan.kind).toBe("noop");
  });
});

describe("Wiederholung entfernen (AK-41)", () => {
  it("behält Historie im Archiv", () => {
    const base = weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12", ["complete_instances: [2026-10-05]"]);
    const r = run(base, { type: "removeRecurrence", revision: "REV1" }, ctxAt("2026-10-12T09:00"));
    const t = task(r.text);
    expect(t.data.recurrence).toBeUndefined();
    expect(t.data.due).toBe("2026-10-12");
    expect((t.data.recurrence_archive as Record<string, unknown>[])[0]!.complete_instances).toEqual(["2026-10-05"]);
    expect(readSeries(t)).toBeNull();
  });
});

describe("AK-19: nicht unterstützte Regel", () => {
  it("Aktionen gesperrt, andere Felder ändern lässt recurrence byte-identisch", () => {
    const base = weekly("calendar", "FREQ=DAILY;BYHOUR=8,20", "2026-10-12");
    const s = readSeries(task(base))!;
    expect(s.phase).toBe("blocked");
    const c = run(base, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-12T09:00"));
    expect(c.plan.kind).toBe("blocked");
    const p = run(base, { type: "setPriority", priority: "high" }, ctxAt("2026-10-12T09:00"));
    expect(p.text).toContain("recurrence: FREQ=DAILY;BYHOUR=8,20\n");
    expect(task(p.text).data.priority).toBe("high");
  });
});

describe("AK-42: erstes Einzelverschieben hält Abstand fest", () => {
  it("speichert abgeleiteten Abstand", () => {
    const base = weekly("calendar", "FREQ=WEEKLY;BYDAY=MO", "2026-10-12", ["scheduled: 2026-10-10"]);
    const r = run(base, { type: "setDate", field: "due", value: "2026-10-14" }, ctxAt("2026-10-12T09:00"));
    const t = task(r.text);
    expect(t.data.recurrence_offset_days).toBe(-2);
    expect(t.data.recurrence_instance).toBe("2026-10-12");
    const next = run(r.text, { type: "completeOccurrence", revision: "REV1", instance: "2026-10-12" }, ctxAt("2026-10-14T09:00"));
    expect(task(next.text).data.due).toBe("2026-10-19");
    expect(task(next.text).data.scheduled).toBe("2026-10-17");
  });
});

describe("Serie anlegen", () => {
  it("erster passender Termin, Completion ohne Verschiebung", () => {
    const base = fm(["id: 01K6B2N8R4T6V8X0Z2C4E6G8J0", "title: A", "status: open", "inbox: true"]);
    const r = run(
      base,
      { type: "createSeries", spec: { rule: "FREQ=WEEKLY;BYDAY=FR", anchor: "completion", field: "scheduled", start: "2026-10-12T09:00", offsetDays: null } },
      ctxAt("2026-10-12T08:00"),
    );
    const t = task(r.text);
    expect(t.data.scheduled).toBe("2026-10-16T09:00");
    expect(t.data.recurrence_start).toBe("2026-10-16T09:00");
    expect(t.data.inbox).toBe(true);
    expect(t.data.format_version).toBe(1);
  });
});
