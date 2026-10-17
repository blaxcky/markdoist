// M0-Spike: prüft den Kern unter Hermes (Plan 2.2, 11).
import {
  findCheckboxes,
  hashText,
  parseDateValue,
  parseFrontmatter,
  parseRule,
  queryOccurrences,
  resolveLocal,
  Temporal,
} from "@markdoist/core";

export interface SpikeResult {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

function check(name: string, fn: () => [boolean, string]): SpikeResult {
  const t0 = Date.now();
  try {
    const [ok, detail] = fn();
    return { name, ok, detail, ms: Date.now() - t0 };
  } catch (e) {
    return { name, ok: false, detail: String(e), ms: Date.now() - t0 };
  }
}

export function runSpike(): SpikeResult[] {
  return [
    check("YAML 1.2: Datum bleibt String", () => {
      const p = parseFrontmatter("due: 2026-10-14\ninbox: yes\n");
      const ok = p.ok && p.data.due === "2026-10-14" && p.data.inbox === "yes";
      return [ok, JSON.stringify(p.ok ? p.data : p)];
    }),
    check("rrule: BYMONTHDAY=-1", () => {
      const p = parseRule("FREQ=MONTHLY;BYMONTHDAY=-1");
      if (p.status !== "ok") return [false, p.message];
      const r = queryOccurrences({ rule: p.rule, start: Temporal.PlainDate.from("2026-11-30"), limit: 4 });
      const s = r.dates.map(String).join(",");
      return [s === "2026-11-30,2026-12-31,2027-01-31,2027-02-28", s];
    }),
    check("Zeitzone: Lücke 02:30 → 03:00", () => {
      const i = resolveLocal(Temporal.PlainDateTime.from("2027-03-28T02:30"), "Europe/Berlin");
      return [i.toString() === "2027-03-28T01:00:00Z", i.toString()];
    }),
    check("Zeitzone: doppelte Stunde früherer Instant", () => {
      const i = resolveLocal(Temporal.PlainDateTime.from("2027-10-31T02:30"), "Europe/Berlin");
      return [i.toString() === "2027-10-31T00:30:00Z", i.toString()];
    }),
    check("Gerätezone", () => {
      const tz = Temporal.Now.timeZoneId();
      return [tz.length > 0, tz];
    }),
    check("Begrenzte Berechnung (unmögliche Regel)", () => {
      const p = parseRule("FREQ=DAILY");
      if (p.status !== "ok") return [false, p.message];
      const r = queryOccurrences({
        rule: { ...p.rule, bymonth: [2], bymonthday: [31] },
        start: Temporal.PlainDate.from("2026-01-01"),
        limit: 1,
      });
      return [r.aborted && !r.exhausted, JSON.stringify(r)];
    }),
    check("SHA-256", () => {
      const h = hashText("Markdoist");
      return [h.length === 64, h.slice(0, 16)];
    }),
    check("markdown-it Checklisten", () => {
      const c = findCheckboxes("- [x] a\n```\n- [x] b\n```\n");
      return [c.length === 1, JSON.stringify(c)];
    }),
    check("Datumswert mit Offset", () => {
      const v = parseDateValue("2026-10-12T08:14:03+02:00");
      return [v?.kind === "instant", v ? v.kind : "null"];
    }),
  ];
}
