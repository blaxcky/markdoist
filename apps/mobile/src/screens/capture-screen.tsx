// Schnellerfassung (4.1, AK-26): Titel genügt; landet im Eingang ohne Termin.
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { useRepo } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export function CaptureScreen() {
  const repo = useRepo();
  const notify = useNotify();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
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
  const input = { borderWidth: 1, borderColor: c.outline, borderRadius: 8, padding: 12, color: c.fg, fontSize: 16, backgroundColor: c.surface } as const;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }} style={{ backgroundColor: c.bg }}>
      <TextInput autoFocus placeholder="Titel" placeholderTextColor={c.muted} value={title} onChangeText={setTitle} onSubmitEditing={() => void submit(false)} returnKeyType="done" style={input} testID="capture-title" />
      <TextInput placeholder="Notiz (optional)" placeholderTextColor={c.muted} value={note} onChangeText={setNote} multiline style={[input, { minHeight: 110, textAlignVertical: "top" }]} testID="capture-note" />
      <Text style={{ color: c.muted, fontSize: 13 }}>Neue Aufgaben landen im Eingang, ohne Termin.</Text>
      <View style={{ flexDirection: "row", gap: 12, justifyContent: "flex-end" }}>
        <Pressable onPress={() => void submit(true)} disabled={!title.trim()} testID="capture-edit" style={{ padding: 12, borderRadius: 20, borderWidth: 1, borderColor: c.outline, opacity: title.trim() ? 1 : 0.5 }}>
          <Text style={{ color: c.fg }}>Erfassen &amp; bearbeiten</Text>
        </Pressable>
        <Pressable onPress={() => void submit(false)} disabled={!title.trim()} testID="capture-submit" style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 20, backgroundColor: c.primary, opacity: title.trim() ? 1 : 0.5 }}>
          <Text style={{ color: c.onPrimary, fontWeight: "600" }}>{T.actions.capture.replace("Neue Aufgabe", "Erfassen")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
