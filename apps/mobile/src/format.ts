import { formatGerman, type DateValue, type Temporal } from "@markdoist/core";

export function shortDate(v: DateValue | null, today: Temporal.PlainDate, tz: string): string {
  if (!v) return "";
  const year = v.kind === "date" ? v.date.year : v.kind === "local" ? v.dateTime.year : v.instant.toZonedDateTimeISO(tz).year;
  return formatGerman(v, tz, { year: year !== today.year });
}
