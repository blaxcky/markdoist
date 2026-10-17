import { formatGerman, Temporal, type DateValue } from "@markdoist/core";

/** Kurze deutsche Datumsanzeige; Jahr nur, wenn es vom heutigen abweicht. */
export function shortDate(v: DateValue | null, today: Temporal.PlainDate, tz: string): string {
  if (!v) return "";
  const year =
    v.kind === "date"
      ? v.date.year
      : v.kind === "local"
        ? v.dateTime.year
        : v.instant.toZonedDateTimeISO(tz).year;
  return formatGerman(v, tz, { year: year !== today.year }).replace(/\.$/, ".");
}

/** Wert eines Datumsfelds für <input type="date"> und <input type="time">. */
export function splitDateValue(raw: unknown): { date: string; time: string } {
  if (typeof raw !== "string") return { date: "", time: "" };
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(raw.trim());
  return m ? { date: m[1]!, time: m[2] ?? "" } : { date: "", time: "" };
}
