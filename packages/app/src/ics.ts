// ICS-Einleser für den Müllabfuhr-Import (4.7): nur VEVENTs mit Datum und Titel, ohne Uhrzeit.
// Bewusst klein gehalten: Zeilen entfalten, Escapes auflösen, Parameter lesen; keine Wiederholungsregeln.
import { Temporal } from "@markdoist/core";

export interface IcsEvent {
  /** SUMMARY, Escapes aufgelöst */
  summary: string;
  /** Tag des Termins (`YYYY-MM-DD`) in der Gerätezone */
  date: string;
  description: string | null;
}

export interface IcsParse {
  events: IcsEvent[];
  /** VEVENTs mit RRULE/RDATE: in v1 nicht ausgewertet */
  withRule: number;
  /** STATUS:CANCELLED */
  cancelled: number;
  /** ohne SUMMARY oder lesbares DTSTART */
  unreadable: number;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Eine Inhaltszeile `NAME;PARAM=WERT:Wert`; Doppelpunkte in Anführungszeichen trennen nicht. */
function parseLine(line: string): Property | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [rawName, ...rawParams] = splitParams(line.slice(0, colon));
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: (rawName ?? "").toUpperCase(), params, value: line.slice(colon + 1) };
}

function splitParams(head: string): string[] {
  const out: string[] = [];
  let quoted = false;
  let cur = "";
  for (const ch of head) {
    if (ch === '"') quoted = !quoted;
    if (ch === ";" && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** TEXT-Escapes nach RFC 5545: `\n`, `\,`, `\;`, `\\`. */
export function unescapeText(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

const DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/;

/** Tag eines DTSTART in der Gerätezone (3.3); die Uhrzeit selbst wird nicht übernommen. */
function startDay(p: Property, timeZone: string): string | null {
  const v = p.value.trim();
  try {
    const d = DATE_RE.exec(v);
    if (d) return Temporal.PlainDate.from({ year: +d[1]!, month: +d[2]!, day: +d[3]! }, { overflow: "reject" }).toString();
    const t = DATE_TIME_RE.exec(v);
    if (!t) return null;
    const local = Temporal.PlainDateTime.from(
      { year: +t[1]!, month: +t[2]!, day: +t[3]!, hour: +t[4]!, minute: +t[5]!, second: +(t[6] ?? 0) },
      { overflow: "reject" },
    );
    if (t[7]) return Temporal.Instant.from(`${local.toString()}Z`).toZonedDateTimeISO(timeZone).toPlainDate().toString();
    const tzid = p.params.TZID;
    if (tzid) {
      try {
        return local.toZonedDateTime(tzid).withTimeZone(timeZone).toPlainDate().toString();
      } catch {
        // Unbekannte Zonenbezeichnung (etwa Windows-Namen): Tag wie geschrieben.
      }
    }
    return local.toPlainDate().toString();
  } catch {
    return null;
  }
}

/** Liest die Termine einer ICS-Datei (CRLF oder LF, gefaltete Zeilen, verschachtelte VALARMs). */
export function parseIcs(text: string, timeZone: string): IcsParse {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: IcsParse = { events: [], withRule: 0, cancelled: 0, unreadable: 0 };
  let event: Property[] | null = null;
  let nested = 0;
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "BEGIN") {
      if (p.value.toUpperCase() === "VEVENT" && !event) {
        event = [];
        nested = 0;
      } else if (event) nested++;
      continue;
    }
    if (p.name === "END") {
      if (!event) continue;
      if (nested > 0) {
        nested--;
        continue;
      }
      if (p.value.toUpperCase() === "VEVENT") {
        finish(event, timeZone, out);
        event = null;
      }
      continue;
    }
    if (event && nested === 0) event.push(p);
  }
  return out;
}

function finish(props: Property[], timeZone: string, out: IcsParse) {
  const get = (name: string) => props.find((p) => p.name === name);
  if (get("STATUS")?.value.trim().toUpperCase() === "CANCELLED") {
    out.cancelled++;
    return;
  }
  if (get("RRULE") || get("RDATE")) {
    out.withRule++;
    return;
  }
  const summary = get("SUMMARY");
  const start = get("DTSTART");
  const date = start ? startDay(start, timeZone) : null;
  const title = summary ? unescapeText(summary.value).trim() : "";
  if (!date || !title) {
    out.unreadable++;
    return;
  }
  const description = get("DESCRIPTION");
  out.events.push({ summary: title, date, description: description ? unescapeText(description.value).trim() || null : null });
}
