// Invarianten-Orakel für das Fortschreiben einer Serie (PLAN1 5.2–5.4, 5.6).
// Jede Aktion „Vorkommen erledigen/überspringen“ auf einer aktiven Serie muss dieselben
// Nachbedingungen erfüllen, unabhängig von Regel, Art, Uhrzeit, Abstand und Historie.
import { expect } from "vitest";
import { Temporal } from "temporal-polyfill";
import {
  applyPlan,
  buildIndex,
  datePart,
  formatTimestamp,
  completionOccurrences,
  isOccurrence,
  parseDateValue,
  planAction,
  previewSeriesAction,
  queryOccurrences,
  readSeries,
  resetCheckboxes,
  type ActionContext,
  type Series,
  type Task,
  type TaskAction,
} from "../src";
import { task } from "./helpers";

export type AdvanceKind = "complete" | "skip";

export interface AdvanceResult {
  text: string;
  ended: boolean;
  /** neuer Schlüssel K′ (null bei Serienende) */
  next: string | null;
  /** Schlüssel K, der aufgelöst wurde */
  key: string;
}

const dayOf = (ctx: ActionContext) => ctx.at.toZonedDateTimeISO(ctx.timeZone).toPlainDate();
const max = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
  Temporal.PlainDate.compare(a, b) >= 0 ? a : b;
const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));

/** Erwarteter Wert des anderen Datumsfelds nach 5.3, unabhängig von actions.ts formuliert. */
function expectedOther(
  before: Task,
  s: Series,
  next: Temporal.PlainDate,
  tz: string,
): string | undefined {
  const other = s.field === "due" ? "scheduled" : "due";
  const raw = before.data[other];
  if (raw === undefined || raw === null || raw === "") return undefined;
  const v = parseDateValue(raw);
  if (!v) throw new Error(`Fixture: ungültiges ${other}`);
  let off = s.offsetDays;
  if (off === null) {
    const ref = before.fields[s.field];
    if (!ref) throw new Error("Fixture: Bezugsfeld fehlt");
    off = datePart(ref, tz).until(datePart(v, tz), { largestUnit: "days" }).days;
  }
  const d = next.add({ days: off });
  if (v.kind === "date") return d.toString();
  const t =
    v.kind === "local" ? v.dateTime.toPlainTime() : v.instant.toZonedDateTimeISO(tz).toPlainTime();
  return `${d}T${t.toString({ smallestUnit: "minute" })}`;
}

/** Unabhängige Zweitberechnung des Folgetermins (Brute-Force über die Terminfolge). */
function expectedNext(
  s: Series,
  kind: AdvanceKind,
  K: Temporal.PlainDate,
  day: Temporal.PlainDate,
  resolved: Set<string>,
): Temporal.PlainDate | "ended" {
  const rule = s.rule!;
  if (s.anchor === "calendar") {
    const base = max(K, day);
    // Zweiter Weg über `from` statt `after`, ohne `exclude`: Treffer selbst herausfiltern.
    const all = queryOccurrences({
      rule,
      start: s.start!.date,
      time: s.start!.time,
      from: base.add({ days: 1 }),
      limit: 60,
    });
    const hit = all.dates.find(
      (d) => Temporal.PlainDate.compare(d, base) > 0 && !resolved.has(d.toString()),
    );
    if (hit) return hit;
    if (all.exhausted) return "ended";
    throw new Error(`Orakel: Terminfolge für ${s.raw} weder erschöpft noch Treffer (Horizont)`);
  }
  const B = kind === "complete" ? day : max(K, day);
  if (kind === "complete" && rule.count !== null && resolved.size >= 0) {
    const completions = [...s.C, K.toString()].filter((x, i, a) => a.indexOf(x) === i).length;
    if (completions >= rule.count) return "ended";
  }
  const r = completionOccurrences({ rule, base: B, time: s.start!.time, limit: 200 });
  const hit = r.dates.find((d) => !resolved.has(d.toString()));
  if (hit) {
    // Einfache Regeln ohne BY-Teile: fester Abstand ab B, Monate/Jahre mit Klemmen ans Monatsende (Entscheidung 23.10.2026).
    if (
      !rule.byday.length &&
      !rule.bymonthday.length &&
      !rule.bymonth.length &&
      !rule.bysetpos.length &&
      !rule.byyearday.length &&
      !rule.byweekno.length
    ) {
      const plain =
        rule.freq === "DAILY"
          ? B.add({ days: rule.interval })
          : rule.freq === "WEEKLY"
            ? B.add({ weeks: rule.interval })
            : rule.freq === "MONTHLY"
              ? B.add({ months: rule.interval })
              : B.add({ years: rule.interval });
      if (
        !resolved.has(plain.toString()) &&
        (rule.until === null || Temporal.PlainDate.compare(plain, rule.until.date) <= 0)
      ) {
        expect(hit.toString(), `Completion-Abstand ab ${B} (${s.raw})`).toBe(plain.toString());
      }
    }
    return hit;
  }
  if (r.exhausted) return "ended";
  throw new Error(`Orakel: Completion-Folge für ${s.raw} ab ${B} ohne Treffer (Horizont)`);
}

/** Führt die Aktion aus und prüft alle Nachbedingungen. */
export function checkAdvance(
  before: string,
  kind: AdvanceKind,
  ctx: ActionContext,
  label = "",
): AdvanceResult {
  const tz = ctx.timeZone;
  const t = task(before);
  const s = readSeries(t);
  const tag = `${label} [${kind} ${dayOf(ctx)}]`;
  if (!s) throw new Error(`${tag}: keine Serie`);
  expect(s.phase, `${tag}: Phase vor der Aktion`).toBe("active");
  expect(s.structureError, tag).toBe(false);
  const K = s.instance!;
  const k = K.toString();
  const action: TaskAction =
    kind === "complete"
      ? { type: "completeOccurrence", revision: s.revisionKey, instance: k }
      : { type: "skipOccurrence", revision: s.revisionKey, instance: k };
  const preview = previewSeriesAction(t, action, ctx);
  const plan = planAction(t, action, ctx);
  if (plan.kind !== "edit")
    throw new Error(
      `${tag}: Plan ${plan.kind}${plan.kind === "blocked" ? ` – ${plan.message}` : ""}`,
    );
  const applied = applyPlan(before, plan);
  if (!applied.ok) throw new Error(`${tag}: ${applied.message}`);
  const text = applied.text;
  const after = task(text);
  const sa = readSeries(after);
  if (!sa) throw new Error(`${tag}: Serie nach der Aktion verschwunden`);
  expect(sa.structureError, `${tag}: Struktur nach der Aktion`).toBe(false);
  expect(sa.revisionKey, `${tag}: Revision bleibt`).toBe(s.revision ?? sa.revisionKey);
  expect(after.data.dateModified, tag).toBe(formatTimestamp(ctx.at, tz));
  expect(after.data.recurrence, `${tag}: Regeltext byte-identisch`).toBe(t.data.recurrence);

  // Historie: genau K kommt hinzu
  const resolved = new Set([...s.C, ...s.S, k]);
  const Cafter = new Set(sa.C);
  const Safter = new Set(sa.S);
  const expectC = new Set(s.C);
  const expectS = new Set(s.S);
  (kind === "complete" ? expectC : expectS).add(k);
  expect([...Cafter].sort(), `${tag}: complete_instances`).toEqual([...expectC].sort());
  expect([...Safter].sort(), `${tag}: skipped_instances`).toEqual([...expectS].sort());
  if (kind === "complete")
    expect(after.data.last_completed_at, tag).toBe(formatTimestamp(ctx.at, tz));
  else
    expect(after.data.last_completed_at, `${tag}: last_completed_at bei Skip unverändert`).toBe(
      t.data.last_completed_at,
    );

  // Ansicht: Aufgabe bleibt sichtbar und beschreibbar
  const view = buildIndex([after], { now: () => ctx.at, timeZone: tz }).tasks[0]!;
  expect(view.readOnly, tag).toBe(false);

  const day = dayOf(ctx);
  const expected = expectedNext(s, kind, K, day, resolved);

  if (after.fields.status === "done") {
    expect(expected, `${tag}: Serie endete, Orakel erwartet aber ${String(expected)}`).toBe(
      "ended",
    );
    expect(sa.phase, tag).toBe("ended");
    expect(after.data.completedDate, tag).toBe(formatTimestamp(ctx.at, tz));
    expect(str(after.data.recurrence_instance), `${tag}: K bleibt als letzter Schlüssel`).toBe(
      str(t.data.recurrence_instance),
    );
    expect(after.data[s.field], `${tag}: Bezugsfeld am Ende unverändert`).toBe(t.data[s.field]);
    expect(after.body, `${tag}: kein Checklisten-Reset am Serienende`).toBe(t.body);
    expect(preview.ended, tag).toBe(true);
    expect(plan.note, tag).toMatch(/Serie beendet/);
    const again = planAction(after, action, ctx);
    expect(again.kind, `${tag}: Wiederholung am Ende`).toBe("noop");
    return { text, ended: true, next: null, key: k };
  }

  expect(expected, `${tag}: Orakel erwartet Serienende, Aktion schrieb aber weiter`).not.toBe(
    "ended",
  );
  const next = sa.instance!;
  const n = next.toString();
  expect(n, `${tag}: Folgetermin`).toBe((expected as Temporal.PlainDate).toString());
  expect(after.fields.status, tag).toBe("open");
  expect(sa.phase, `${tag}: Phase nach der Aktion`).toBe("active");
  expect(resolved.has(n), `${tag}: K′ ${n} bereits aufgelöst`).toBe(false);
  const base = s.anchor === "calendar" || kind === "skip" ? max(K, day) : day;
  expect(
    Temporal.PlainDate.compare(next, base) > 0,
    `${tag}: K′ ${n} liegt nicht nach ${base}`,
  ).toBe(true);
  if (s.anchor === "calendar")
    expect(isOccurrence(s.rule!, s.start!.date, next), `${tag}: K′ ${n} ist kein Regeltermin`).toBe(
      true,
    );
  expect(str(after.data.recurrence_instance), tag).toBe(n);
  const time = s.start?.time ? `T${s.start.time.toString({ smallestUnit: "minute" })}` : "";
  expect(after.data[s.field], `${tag}: Bezugsfeld`).toBe(`${n}${time}`);
  const other = s.field === "due" ? "scheduled" : "due";
  expect(str(after.data[other]), `${tag}: anderes Feld`).toBe(expectedOther(t, s, next, tz));
  expect(after.body, `${tag}: Checklisten`).toBe(resetCheckboxes(t.body));
  expect(preview.result, tag).toBe("change");
  expect(preview.instance?.toString(), `${tag}: Vorschau`).toBe(n);
  expect(plan.note, tag).toBe(`Nächstes Vorkommen: ${n}`);
  // „in Arbeit“ wird zu „offen“, sonst bleibt der Status
  if (t.fields.status === "in-progress") expect(after.data.status).toBe("open");

  // Idempotenz: dieselbe Aktion erneut → noop, Text byte-identisch
  const again = planAction(after, action, ctx);
  expect(again.kind, `${tag}: Wiederholung`).toBe("noop");
  return { text, ended: false, next: n, key: k };
}

/** Erledigt/überspringt der Reihe nach, bis die Serie endet oder `steps` erreicht sind. */
export function runUntilEnd(
  text: string,
  steps: number,
  ctxFor: (k: Temporal.PlainDate, i: number) => ActionContext,
  kindFor: (i: number) => AdvanceKind = () => "complete",
  label = "",
): { text: string; keys: string[]; ended: boolean } {
  const keys: string[] = [];
  let ended = false;
  for (let i = 0; i < steps && !ended; i++) {
    const s = readSeries(task(text))!;
    const K = s.instance!;
    const r = checkAdvance(text, kindFor(i), ctxFor(K, i), `${label} #${i}`);
    keys.push(r.key);
    text = r.text;
    ended = r.ended;
  }
  expect(new Set(keys).size, `${label}: Schlüssel wiederholen sich`).toBe(keys.length);
  for (let i = 1; i < keys.length; i++)
    expect(keys[i]! > keys[i - 1]!, `${label}: Schlüssel nicht streng steigend`).toBe(true);
  return { text, keys, ended };
}
