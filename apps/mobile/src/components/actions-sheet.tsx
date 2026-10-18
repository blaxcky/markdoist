// Aktionen zu einer Aufgabe (Wischen nach links / langes Drücken): Einsortieren, Termin, Löschen.
import { Modal, Pressable, Text, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { T, withDate } from "@markdoist/app";
import { Temporal, type TaskView } from "@markdoist/core";
import { systemClock, useRepo } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";

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
  const item = (label: string, onPress: () => void, testID: string, danger = false) => (
    <Pressable onPress={onPress} testID={testID} android_ripple={{ color: c.surfaceHigh }} style={{ paddingVertical: 14, paddingHorizontal: 20 }}>
      <Text style={{ color: danger ? c.danger : c.fg, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
  const run = (p: Promise<import("@markdoist/app").Outcome>, label: string) => {
    onClose();
    void p.then((o) => notify(o, label));
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={onClose}>
        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8, paddingBottom: 24 }}>
          <Text numberOfLines={1} style={{ color: c.muted, paddingHorizontal: 20, paddingVertical: 8 }}>{f.title}</Text>
          {f.inbox
            ? item(T.actions.file, () => run(repo.perform(ref, { type: "setInbox", inbox: false }, "Einsortiert"), "Einsortiert"), "act-file")
            : item(T.actions.toInbox, () => run(repo.perform(ref, { type: "setInbox", inbox: true }, "Zurück in den Eingang"), "Zurück in den Eingang"), "act-inbox")}
          {item("Frist heute", () => run(repo.perform(ref, { type: "setDate", field: "due", value: dueValue(today.toString()) }, "Frist gesetzt"), "Frist gesetzt"), "act-due-today")}
          {item("Frist wählen …", () => {
            onClose();
            pickDate(typeof view.task.data.due === "string" ? view.task.data.due : null, (d) =>
              void repo.perform(ref, { type: "setDate", field: "due", value: dueValue(d) }, "Frist gesetzt").then((o) => notify(o, "Frist gesetzt")),
            );
          }, "act-due")}
          {item("Einplanen …", () => {
            onClose();
            pickDate(typeof view.task.data.scheduled === "string" ? view.task.data.scheduled : null, (d) =>
              void repo.perform(ref, { type: "setDate", field: "scheduled", value: schValue(d) }, "Eingeplant").then((o) => notify(o, "Eingeplant")),
            );
          }, "act-scheduled")}
          {item(T.actions.delete, () => run(repo.moveToTrash(ref), "Gelöscht"), "act-delete", true)}
        </View>
      </Pressable>
    </Modal>
  );
}
