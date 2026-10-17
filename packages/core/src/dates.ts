// Datums- und Zeitwerte nach Abschnitt 3.3.
// Reine Datumswerte werden nie in UTC umgerechnet. Uhr und Zeitzone werden injiziert.
import { Temporal } from "temporal-polyfill";

export { Temporal };

/** Uhr und Gerätezone als ausdrückliche Eingabe des Kerns. */
export interface Clock {
  now(): Temporal.Instant;
  timeZone: string;
}

export function fixedClock(isoInstant: string, timeZone: string): Clock {
  const instant = Temporal.Instant.from(isoInstant);
  return { now: () => instant, timeZone };
}

/** Zeitpunkt aus lokaler Wanduhrzeit in einer Zone, z. B. für Testuhren. */
export function clockAtLocal(localDateTime: string, timeZone: string): Clock {
  const instant = resolveLocal(Temporal.PlainDateTime.from(localDateTime), timeZone);
  return { now: () => instant, timeZone };
}

export type DateValue =
  | { kind: "date"; date: Temporal.PlainDate; raw: string }
  | { kind: "local"; dateTime: Temporal.PlainDateTime; raw: string }
  | { kind: "instant"; instant: Temporal.Instant; offset: string; raw: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const OFFSET_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Liest einen Datumswert. Liefert `null` bei ungültigem Wert. */
export function parseDateValue(raw: unknown): DateValue | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  try {
    if (DATE_RE.test(s)) {
      return { kind: "date", date: Temporal.PlainDate.from(s, { overflow: "reject" }), raw };
    }
    if (LOCAL_RE.test(s)) {
      const iso = s.replace(" ", "T");
      return {
        kind: "local",
        dateTime: Temporal.PlainDateTime.from(iso, { overflow: "reject" }),
        raw,
      };
    }
    const m = OFFSET_RE.exec(s);
    if (m) {
      const iso = s.replace(" ", "T");
      const instant = Temporal.Instant.from(iso);
      // Kalenderteil zusätzlich streng prüfen (Instant.from korrigiert z. B. 2026-02-30 nicht).
      Temporal.PlainDate.from(`${m[1]}-${m[2]}-${m[3]}`, { overflow: "reject" });
      return { kind: "instant", instant, offset: m[7] ?? "Z", raw };
    }
  } catch {
    return null;
  }
  return null;
}

/** Löst eine lokale Wanduhrzeit eindeutig auf (3.3):
 *  - Zeitlücke (Frühjahr): erster gültiger Zeitpunkt nach der Lücke (Übergangszeitpunkt).
 *  - Doppelte Stunde (Herbst): der frühere Instant. */
export function resolveLocal(dt: Temporal.PlainDateTime, timeZone: string): Temporal.Instant {
  try {
    return dt.toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant();
  } catch {
    const before = dt.toZonedDateTime(timeZone, { disambiguation: "earlier" });
    const next = before.getTimeZoneTransition("next");
    if (next) return next.toInstant();
    return before.toInstant();
  }
}

export function todayOf(clock: Clock): Temporal.PlainDate {
  return clock.now().toZonedDateTimeISO(clock.timeZone).toPlainDate();
}

/** Kalendertag eines Datumswerts in der Gerätezone. */
export function datePart(v: DateValue, timeZone: string): Temporal.PlainDate {
  switch (v.kind) {
    case "date":
      return v.date;
    case "local":
      return v.dateTime.toPlainDate();
    case "instant":
      return v.instant.toZonedDateTimeISO(timeZone).toPlainDate();
  }
}

/** Überfällig nach 3.3. Nur für `due` verwenden; `scheduled` ist nie überfällig. */
export function isOverdue(due: DateValue, clock: Clock): boolean {
  switch (due.kind) {
    case "date":
      return Temporal.PlainDate.compare(due.date, todayOf(clock)) < 0;
    case "local":
      return Temporal.Instant.compare(clock.now(), resolveLocal(due.dateTime, clock.timeZone)) > 0;
    case "instant":
      return Temporal.Instant.compare(clock.now(), due.instant) > 0;
  }
}

/** Vergleichsschlüssel für Sortierung (Instant-Millisekunden bzw. Tagesbeginn). */
export function sortKey(v: DateValue, timeZone: string): number {
  switch (v.kind) {
    case "date":
      return v.date.toZonedDateTime({ timeZone }).epochMilliseconds;
    case "local":
      return resolveLocal(v.dateTime, timeZone).epochMilliseconds;
    case "instant":
      return v.instant.epochMilliseconds;
  }
}

export function compareDates(a: Temporal.PlainDate, b: Temporal.PlainDate): number {
  return Temporal.PlainDate.compare(a, b);
}

/** Zeitstempel mit lokalem Offset, z. B. `2026-10-12T08:14:03+02:00`. */
export function formatTimestamp(instant: Temporal.Instant, timeZone: string): string {
  const z = instant.toZonedDateTimeISO(timeZone);
  return z.toString({ smallestUnit: "second", timeZoneName: "never" });
}

export function formatDateKey(d: Temporal.PlainDate): string {
  return d.toString();
}

export function formatLocal(dt: Temporal.PlainDateTime): string {
  return dt.toString({ smallestUnit: "minute" });
}

/** Kalendertag eines Zeitstempels mit Offset, wie er gespeichert wurde (nicht neu datiert). */
export function storedCalendarDay(raw: unknown): Temporal.PlainDate | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  if (!m) return null;
  try {
    return Temporal.PlainDate.from(m[1]!, { overflow: "reject" });
  } catch {
    return null;
  }
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Deutsche Anzeige, z. B. `Mo, 12.10.2026` bzw. `Mo, 12.10.2026, 17:00`. */
export function formatGerman(v: DateValue, timeZone: string, opts: { year?: boolean } = {}): string {
  const year = opts.year ?? true;
  const fmtDate = (d: Temporal.PlainDate) =>
    `${WEEKDAYS[d.dayOfWeek - 1]}, ${pad(d.day)}.${pad(d.month)}.${year ? d.year : ""}`;
  switch (v.kind) {
    case "date":
      return fmtDate(v.date);
    case "local":
      return `${fmtDate(v.dateTime.toPlainDate())}, ${pad(v.dateTime.hour)}:${pad(v.dateTime.minute)}`;
    case "instant": {
      const z = v.instant.toZonedDateTimeISO(timeZone);
      return `${fmtDate(z.toPlainDate())}, ${pad(z.hour)}:${pad(z.minute)}`;
    }
  }
}

export function formatGermanDate(d: Temporal.PlainDate, opts: { year?: boolean } = {}): string {
  return formatGerman({ kind: "date", date: d, raw: d.toString() }, "UTC", opts);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
