// Aktionen zu einer Aufgabe (Wischen nach links / langes Drücken): Gruppe Frist (Heute, Morgen, In einer Woche,
// Datum wählen) mit Einplanen, abgesetzt Einsortieren/Eingang, zuletzt Löschen (4.5).
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { T, withDate } from "@markdoist/app";
import { Temporal, todayOf, type TaskView } from "@markdoist/core";
import { systemClock, useRepo } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import { Menu } from "./menu";
import { CalendarIcon, ClockIcon, Glyph, InboxIcon } from "./icons";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function pickDate(initial: string | null, onPick: (date: string) => void) {
  const base = initial ? new Date(`${initial.slice(0, 10)}T12:00:00`) : new Date();
  DateTimePickerAndroid.open({
    value: base,
    mode: "date",
    firstDayOfWeek: 1,
    // „Heute“ übernimmt sofort den heutigen Tag. Neu öffnen geht nicht: Das native Modul findet beim
    // erneuten open() noch das schließende Fragment, aktualisiert nur dieses und zeigt keinen Dialog.
    neutralButton: { label: "Heute" },
    onChange: (e, d) => {
      if (e.type === "neutralButtonPressed") return onPick(todayOf(systemClock()).toString());
      if (e.type !== "set" || !d) return;
      const pd = Temporal.PlainDate.from({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      });
      onPick(pd.toString());
    },
  });
}

export function ActionsSheet({
  view,
  today,
  onClose,
}: {
  view: TaskView | null;
  today: Temporal.PlainDate;
  onClose(): void;
}) {
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
  const run = (p: Promise<import("@markdoist/app").Outcome>, label: string) =>
    void p.then((o) => notify(o, label));
  const setDue = (d: string) =>
    run(
      repo.perform(ref, { type: "setDate", field: "due", value: dueValue(d) }, "Frist gesetzt"),
      "Frist gesetzt",
    );
  const hint = (d: Temporal.PlainDate) => `${WEEKDAYS[d.dayOfWeek - 1]} ${d.day}.${d.month}.`;
  const tomorrow = today.add({ days: 1 });
  const week = today.add({ days: 7 });
  return (
    <Menu
      open
      onClose={onClose}
      title={f.title}
      items={[
        { heading: "Frist" },
        {
          label: "Heute",
          hint: hint(today),
          icon: <CalendarIcon color={c.toneToday} size={16} day={today.day} />,
          testID: "act-due-today",
          onPress: () => setDue(today.toString()),
        },
        {
          label: "Morgen",
          hint: hint(tomorrow),
          icon: <CalendarIcon color={c.toneTomorrow} size={16} day={tomorrow.day} />,
          testID: "act-due-tomorrow",
          onPress: () => setDue(tomorrow.toString()),
        },
        {
          label: "In einer Woche",
          hint: hint(week),
          icon: <CalendarIcon color={c.toneWeek} size={16} day={week.day} />,
          testID: "act-due-week",
          onPress: () => setDue(week.toString()),
        },
        {
          label: "Datum wählen …",
          icon: <CalendarIcon color={c.muted} size={16} />,
          testID: "act-due",
          onPress: () =>
            pickDate(typeof view.task.data.due === "string" ? view.task.data.due : null, setDue),
        },
        {
          label: "Einplanen …",
          icon: <ClockIcon color={c.muted} size={16} />,
          testID: "act-scheduled",
          onPress: () =>
            pickDate(
              typeof view.task.data.scheduled === "string" ? view.task.data.scheduled : null,
              (d) =>
                run(
                  repo.perform(
                    ref,
                    { type: "setDate", field: "scheduled", value: schValue(d) },
                    "Eingeplant",
                  ),
                  "Eingeplant",
                ),
            ),
        },
        "divider",
        f.inbox
          ? {
              label: T.actions.file,
              icon: <InboxIcon color={c.muted} size={17} />,
              testID: "act-file",
              onPress: () =>
                run(
                  repo.perform(ref, { type: "setInbox", inbox: false }, "Einsortiert"),
                  "Einsortiert",
                ),
            }
          : {
              label: T.actions.toInbox,
              icon: <InboxIcon color={c.muted} size={17} />,
              testID: "act-inbox",
              onPress: () =>
                run(
                  repo.perform(ref, { type: "setInbox", inbox: true }, "Zurück in den Eingang"),
                  "Zurück in den Eingang",
                ),
            },
        "divider",
        {
          label: T.actions.delete,
          icon: (
            <Glyph color={c.danger} size={17}>
              🗑
            </Glyph>
          ),
          testID: "act-delete",
          danger: true,
          onPress: () => run(repo.moveToTrash(ref), "Gelöscht"),
        },
      ]}
    />
  );
}
