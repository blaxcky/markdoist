// Bearbeiten von Datumsfeldern (3.3, F005): Anzeige in Ortszeit, Uhrzeit bleibt beim Datumswechsel erhalten.
import { parseDateValue } from "@markdoist/core";

/** Datum und Uhrzeit eines Feldwerts; Werte mit Offset oder `Z` in lokaler Wanduhrzeit. */
export function splitDateValue(raw: unknown, timeZone?: string): { date: string; time: string } {
  if (typeof raw !== "string") return { date: "", time: "" };
  const v = parseDateValue(raw);
  if (v?.kind === "instant" && timeZone) {
    const z = v.instant.toZonedDateTimeISO(timeZone);
    return { date: z.toPlainDate().toString(), time: z.toPlainTime().toString({ smallestUnit: "minute" }) };
  }
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(raw.trim());
  return m ? { date: m[1]!, time: m[2] ?? "" } : { date: "", time: "" };
}

/** Neuer Feldwert mit anderem Datum; eine vorhandene Uhrzeit bleibt (als lokale Wanduhrzeit) erhalten. */
export function withDate(raw: unknown, date: string, timeZone?: string): string {
  const { time } = splitDateValue(raw, timeZone);
  return time ? `${date}T${time}` : date;
}
