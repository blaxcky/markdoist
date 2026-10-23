// Langlauf-Simulation (fast-check): zufällige Folgen aus Erledigen, Überspringen, Einzelverschieben,
// Tagen und Abstandsänderungen auf zufälligen Serien. Jeder Schritt läuft durch das Orakel.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import {
  applyPlan,
  parseRule,
  planAction,
  queryOccurrences,
  readSeries,
  type Anchor,
  type RefField,
} from "../src";
import { ctxAt, fm, task } from "./helpers";
import { checkAdvance } from "./seriesOracle";

const RULES: [string, string, Anchor][] = [
  ["FREQ=DAILY", "2026-10-12", "calendar"],
  ["FREQ=DAILY;INTERVAL=4", "2026-10-12", "calendar"],
  ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-10-12", "calendar"],
  ["FREQ=WEEKLY;BYDAY=MO,TH", "2026-10-12", "calendar"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU;WKST=SU", "2026-10-17", "calendar"],
  ["FREQ=WEEKLY;INTERVAL=3;BYDAY=FR", "2026-10-16", "calendar"],
  ["FREQ=MONTHLY;BYMONTHDAY=31", "2026-10-31", "calendar"],
  ["FREQ=MONTHLY;BYMONTHDAY=-1", "2026-10-31", "calendar"],
  ["FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1", "2026-10-30", "calendar"],
  ["FREQ=MONTHLY;BYDAY=2TU", "2026-10-13", "calendar"],
  ["FREQ=MONTHLY;BYDAY=-1FR", "2026-10-30", "calendar"],
  ["FREQ=MONTHLY;INTERVAL=2;BYDAY=1MO", "2026-11-02", "calendar"],
  ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1", "2027-02-28", "calendar"],
  ["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", "2028-02-29", "calendar"],
  ["FREQ=YEARLY;BYDAY=-1TH;BYMONTH=11", "2026-11-26", "calendar"],
  ["FREQ=WEEKLY;BYDAY=MO;COUNT=6", "2026-10-12", "calendar"],
  ["FREQ=DAILY;INTERVAL=2;UNTIL=20261130", "2026-10-12", "calendar"],
  ["FREQ=DAILY", "2026-10-12", "completion"],
  ["FREQ=DAILY;INTERVAL=5", "2026-10-12", "completion"],
  ["FREQ=WEEKLY", "2026-10-12", "completion"],
  ["FREQ=WEEKLY;INTERVAL=2", "2026-10-12", "completion"],
  ["FREQ=MONTHLY", "2026-10-12", "completion"],
  ["FREQ=WEEKLY;COUNT=4", "2026-10-12", "completion"],
  ["FREQ=DAILY;INTERVAL=3;UNTIL=20261231", "2026-10-12", "completion"],
];

type Step =
  | { t: "complete" }
  | { t: "skip" }
  | { t: "days"; n: number }
  | { t: "shift"; by: number }
  | { t: "ref"; offset: number | null };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 5, arbitrary: fc.constant({ t: "complete" } as Step) },
  { weight: 2, arbitrary: fc.constant({ t: "skip" } as Step) },
  { weight: 4, arbitrary: fc.integer({ min: 1, max: 20 }).map((n) => ({ t: "days", n }) as Step) },
  {
    weight: 2,
    arbitrary: fc.integer({ min: -3, max: 6 }).map((by) => ({ t: "shift", by }) as Step),
  },
  {
    weight: 1,
    arbitrary: fc
      .option(fc.integer({ min: -3, max: 3 }), { nil: null })
      .map((offset) => ({ t: "ref", offset }) as Step),
  },
);

const setupArb = fc.record({
  rule: fc.constantFrom(...RULES),
  time: fc.constantFrom(null, "09:30", "23:45"),
  field: fc.constantFrom<RefField>("due", "scheduled"),
  other: fc.constantFrom<"none" | "derived" | "explicit">("none", "derived", "explicit"),
  steps: fc.array(stepArb, { minLength: 10, maxLength: 40 }),
});

function build(
  rule: string,
  startStr: string,
  anchor: Anchor,
  time: string | null,
  field: RefField,
  other: "none" | "derived" | "explicit",
): string {
  const start = Temporal.PlainDate.from(startStr);
  const p = parseRule(rule);
  if (p.status !== "ok") throw new Error(p.message);
  const K =
    anchor === "calendar" ? queryOccurrences({ rule: p.rule, start, limit: 1 }).dates[0]! : start;
  const t = time ? `T${time}` : "";
  const o: RefField = field === "due" ? "scheduled" : "due";
  const lines = [
    "id: 01K6B2N8R4T6V8X0Z2C4E6G8J0",
    "format_version: 1",
    "title: Sim",
    "status: open",
    `${field}: ${K}${t}`,
    ...(other === "none" ? [] : [`${o}: ${K.subtract({ days: 2 })}${time ? "T06:00" : ""}`]),
    `recurrence: ${rule}`,
    "recurrence_revision: REV1",
    `recurrence_start: ${anchor === "calendar" ? start : K}${t}`,
    `recurrence_anchor: ${anchor}`,
    `recurrence_field: ${field}`,
    ...(other === "explicit" ? ["recurrence_offset_days: -2"] : []),
    `recurrence_instance: ${K}`,
    "tags: [sim]   # bleibt",
  ];
  return fm(lines, "- [x] a\n- [ ] b\n");
}

describe("Langlauf-Simulation", () => {
  it("zufällige Schrittfolgen verletzen keine Invariante", () => {
    fc.assert(
      fc.property(setupArb, ({ rule: [rule, start, anchor], time, field, other, steps }) => {
        let text = build(rule, start, anchor, time, field, other);
        let day = Temporal.PlainDate.from(readSeries(task(text))!.instance!.toString()).subtract({
          days: 1,
        });
        const keys: string[] = [];
        let ended = false;
        for (const step of steps) {
          if (ended) break;
          const s = readSeries(task(text))!;
          expect(s.phase, `${rule}: Phase`).toBe("active");
          const K = s.instance!;
          const label = `${anchor} ${rule} ${time ?? ""} ${field}/${other}`;
          switch (step.t) {
            case "days":
              day = day.add({ days: step.n });
              break;
            case "complete":
            case "skip": {
              // Ab Erledigung: Zeit läuft nie rückwärts hinter das aktuelle Vorkommen (sonst zulässig früherer K′)
              const at =
                anchor === "completion" && Temporal.PlainDate.compare(day, K) < 0 ? K : day;
              const r = checkAdvance(text, step.t, ctxAt(`${at}T12:00`), label);
              keys.push(r.key);
              text = r.text;
              ended = r.ended;
              break;
            }
            case "shift": {
              const cur = task(text);
              const val = time
                ? `${K.add({ days: step.by })}T${time}`
                : K.add({ days: step.by }).toString();
              const plan = planAction(
                cur,
                { type: "setDate", field, value: val },
                ctxAt(`${day}T12:00`),
              );
              if (plan.kind === "edit") {
                const a = applyPlan(text, plan);
                if (!a.ok) throw new Error(a.message);
                text = a.text;
              } else expect(plan.kind, `${label}: Verschieben`).toBe("noop");
              const after = readSeries(task(text))!;
              expect(after.instance?.toString(), `${label}: K nach Verschieben`).toBe(K.toString());
              expect(after.phase).toBe("active");
              break;
            }
            case "ref": {
              const cur = task(text);
              const plan = planAction(
                cur,
                {
                  type: "changeReference",
                  revision: s.revisionKey,
                  field,
                  offsetDays: step.offset,
                },
                ctxAt(`${day}T12:00`),
              );
              if (plan.kind === "edit") {
                const a = applyPlan(text, plan);
                if (!a.ok) throw new Error(a.message);
                text = a.text;
              } else expect(plan.kind, `${label}: Abstand`).toBe("noop");
              const after = readSeries(task(text))!;
              expect(after.instance?.toString(), `${label}: K nach Abstand`).toBe(K.toString());
              expect(after.phase).toBe("active");
              break;
            }
          }
        }
        for (let i = 1; i < keys.length; i++)
          expect(keys[i]! > keys[i - 1]!, `${rule}: Schlüssel ${keys.join(",")}`).toBe(true);
        expect(text).toContain("tags: [sim]   # bleibt");
        // Abschluss: Regel ändern mit Neustart → neuer Abschnitt, alte Historie im Archiv, Serie offen.
        const cur = task(text);
        const s = readSeries(cur)!;
        const plan = planAction(
          cur,
          {
            type: "changeRule",
            revision: s.revisionKey,
            spec: {
              rule: "FREQ=WEEKLY;BYDAY=WE;COUNT=2",
              anchor: "calendar",
              field,
              start: day.toString(),
              offsetDays: null,
            },
            restartCount: true,
            resetChecklists: true,
          },
          ctxAt(`${day}T12:00`),
        );
        expect(plan.kind, `${rule}: Regel ändern`).toBe("edit");
        const a = applyPlan(text, plan);
        if (!a.ok) throw new Error(a.message);
        const t2 = task(a.text);
        const s2 = readSeries(t2)!;
        expect(s2.phase).toBe("active");
        expect(s2.revision).not.toBe("REV1");
        expect(s2.C.size + s2.S.size).toBe(0);
        const archive = t2.data.recurrence_archive as Record<string, unknown>[];
        expect(archive).toHaveLength(1);
        expect(archive[0]!.recurrence_revision).toBe("REV1");
        expect(
          (archive[0]!.complete_instances as string[]).length +
            (archive[0]!.skipped_instances as string[]).length,
        ).toBe(keys.length);
        expect(t2.data.status).toBe("open");
        expect(t2.body).toBe("- [ ] a\n- [ ] b\n");
      }),
      { numRuns: 150 },
    );
  }, 120_000);
});
