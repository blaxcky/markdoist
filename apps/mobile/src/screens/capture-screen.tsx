// Schnellerfassung (4.1, AK-26): Titel genügt; landet im Eingang ohne Termin.
// Gestaltung nach Vorlage: Blatt über der Liste, Titelzeile, Chips und roter Senden-Knopf über der Tastatur (CaptureSheet).
import { useState, type ReactNode } from "react";
import { Pressable, Text, TextInput } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { useRepo } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import { Glyph, InboxIcon, LinesIcon } from "../components/icons";
import { CaptureSheet } from "../components/capture-sheet";
import type { RootStack } from "../navigation";

export function CaptureScreen() {
  const repo = useRepo();
  const notify = useNotify();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!title.trim() && !busy;
  const submit = async (edit: boolean) => {
    if (!title.trim() || busy) return;
    setBusy(true);
    const o = await repo.create({ title: title.trim(), note });
    setBusy(false);
    notify(o, "Erfasst im Eingang");
    if (o.status === "ok") {
      if (edit && o.ref) nav.replace("Detail", { ref: o.ref });
      else nav.goBack();
    }
  };
  const chip = (label: string, icon: ReactNode, onPress: (() => void) | undefined, testID?: string, active = false) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      accessibilityRole={onPress ? "button" : "text"}
      style={{ flexDirection: "row", alignItems: "center", gap: 7, height: 34, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: active ? c.primary : c.outline, backgroundColor: active ? c.primaryContainer : c.surface }}
    >
      {icon}
      <Text style={{ color: c.fg, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  return (
    <CaptureSheet
      value={title}
      onChangeText={setTitle}
      placeholder="Aufgabenname"
      onSubmit={() => void submit(false)}
      ready={ready}
      accessibilityLabel={T.fields.title}
      submitLabel="Erfassen (landet im Eingang, ohne Termin)"
      testID={{ input: "capture-title", submit: "capture-submit" }}
      extra={
        showNote && (
          <TextInput
            autoFocus
            placeholder="Beschreibung"
            placeholderTextColor={c.muted}
            value={note}
            onChangeText={setNote}
            multiline
            cursorColor={c.primary}
            style={{ color: c.fg, fontSize: 15, paddingHorizontal: 18, paddingTop: 0, paddingBottom: 8, maxHeight: 140, textAlignVertical: "top" }}
            testID="capture-note"
          />
        )
      }
      chips={
        <>
          {chip(T.views.inbox, <InboxIcon color={c.muted} size={15} />, undefined)}
          {chip("Beschreibung", <LinesIcon color={c.muted} size={14} />, () => setShowNote((x) => !x), "capture-toggle-note", showNote)}
          {chip("Bearbeiten", <Glyph color={c.muted} size={15}>✎</Glyph>, ready ? () => void submit(true) : undefined, "capture-edit")}
        </>
      }
    />
  );
}
