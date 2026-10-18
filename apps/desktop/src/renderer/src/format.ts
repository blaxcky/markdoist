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

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export type DateTone = "overdue" | "today" | "tomorrow" | "week" | "later";

/** Datumsanzeige in der Liste: „Heute“, „Morgen“, Wochentag, sonst „30. Jul“; dazu die Farbstufe. */
export function dateLabel(v: DateValue, today: Temporal.PlainDate, tz: string, overdue = false): { text: string; tone: DateTone } {
  const { date, time } =
    v.kind === "date"
      ? { date: v.date, time: null }
      : v.kind === "local"
        ? { date: v.dateTime.toPlainDate(), time: v.dateTime.toPlainTime() }
        : (() => {
            const z = v.instant.toZonedDateTimeISO(tz);
            return { date: z.toPlainDate(), time: z.toPlainTime() };
          })();
  const days = today.until(date, { largestUnit: "days" }).days;
  let text: string;
  if (days === 0) text = "Heute";
  else if (days === 1) text = "Morgen";
  else if (days === -1) text = "Gestern";
  else if (days > 1 && days < 7) text = WEEKDAY_NAMES[date.dayOfWeek - 1]!;
  else text = `${date.day}. ${MONTHS[date.month - 1]}${date.year !== today.year ? ` ${date.year}` : ""}`;
  if (time) text += ` ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
  const tone: DateTone = overdue || days < 0 ? "overdue" : days === 0 ? "today" : days === 1 ? "tomorrow" : days < 7 ? "week" : "later";
  return { text, tone };
}
