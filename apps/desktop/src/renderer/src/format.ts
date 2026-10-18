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

export { splitDateValue } from "@markdoist/app";
