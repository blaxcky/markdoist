// Aktionen zu einer Aufgabe (Wischen nach links / langes Drücken): Einsortieren, Termin, Löschen.
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { T, withDate } from "@markdoist/app";
import { Temporal, type TaskView } from "@markdoist/core";
import { systemClock, useRepo } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import { Menu } from "./menu";
import { CalendarIcon, ClockIcon, Glyph, InboxIcon } from "./icons";

export function pickDate(initial: string | null, onPick: (date: string) => void) {
  const base = initial ? new Date(`${initial.slice(0, 10)}T12:00:00`) : new Date();
  DateTimePickerAndroid.open({
    value: base,
    mode: "date",
    firstDayOfWeek: 1,
    onChange: (e, d) => {
      if (e.type !== "set" || !d) return;
      const pd = Temporal.PlainDate.from({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
      onPick(pd.toString());
    },
  });
}

export function ActionsSheet({ view, today, onClose }: { view: TaskView | null; today: Temporal.PlainDate; onClose(): void }) {
  const repo = useRepo();
  const notify = useNotify();
  const c = useTheme();
  if (!view) return null;
  const ref = view.task.ref;
  const f = view.task.fields;
  // Termin-Aktionen ändern nur das Datum; eine gesetzte Uhrzeit bleibt erhalten (F005).
  const tz = systemClock().timeZone;
  const dueValue = (d: string) => withDate(view.task.data.due, d, tz);
  const schValue = (d: string) => withDate(view.task.data.scheduled, d, tz);
  const run = (p: Promise<import("@markdoist/app").Outcome>, label: string) => void p.then((o) => notify(o, label));
  return (
    <Menu
      open
      onClose={onClose}
      title={f.title}
      items={[
        f.inbox
          ? { label: T.actions.file, icon: <InboxIcon color={c.muted} size={17} />, testID: "act-file", onPress: () => run(repo.perform(ref, { type: "setInbox", inbox: false }, "Einsortiert"), "Einsortiert") }
          : { label: T.actions.toInbox, icon: <InboxIcon color={c.muted} size={17} />, testID: "act-inbox", onPress: () => run(repo.perform(ref, { type: "setInbox", inbox: true }, "Zurück in den Eingang"), "Zurück in den Eingang") },
        { label: "Frist heute", icon: <CalendarIcon color={c.toneToday} size={16} day={today.day} />, testID: "act-due-today", onPress: () => run(repo.perform(ref, { type: "setDate", field: "due", value: dueValue(today.toString()) }, "Frist gesetzt"), "Frist gesetzt") },
        {
          label: "Frist wählen …",
          icon: <CalendarIcon color={c.muted} size={16} />,
          testID: "act-due",
          onPress: () =>
            pickDate(typeof view.task.data.due === "string" ? view.task.data.due : null, (d) =>
              run(repo.perform(ref, { type: "setDate", field: "due", value: dueValue(d) }, "Frist gesetzt"), "Frist gesetzt"),
            ),
        },
        {
          label: "Einplanen …",
          icon: <ClockIcon color={c.muted} size={16} />,
          testID: "act-scheduled",
          onPress: () =>
            pickDate(typeof view.task.data.scheduled === "string" ? view.task.data.scheduled : null, (d) =>
              run(repo.perform(ref, { type: "setDate", field: "scheduled", value: schValue(d) }, "Eingeplant"), "Eingeplant"),
            ),
        },
        { label: T.actions.delete, icon: <Glyph color={c.danger} size={17}>🗑</Glyph>, testID: "act-delete", danger: true, onPress: () => run(repo.moveToTrash(ref), "Gelöscht") },
      ]}
    />
  );
}
