// Schnellerfassung (4.1, AK-26): Titel genügt; landet im Eingang ohne Termin.
// Gestaltung nach Vorlage: Blatt über der Liste, Titelzeile, Chips und roter Senden-Knopf über der Tastatur.
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@markdoist/app";
import { useRepo } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import { Glyph, InboxIcon, LinesIcon } from "../components/icons";
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
  // Ohne Tastatur Abstand zur Gestenleiste halten (randlose Darstellung).
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(true);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
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
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.backdrop }}>
      <Pressable style={{ flex: 1 }} onPress={() => nav.goBack()} accessibilityLabel="Schließen" />
      <Animated.View entering={SlideInDown.duration(200)} style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 12 + (keyboard ? 0 : insets.bottom) }}>
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.outline, marginBottom: 4 }} />
        <TextInput
          autoFocus
          placeholder="Aufgabenname"
          placeholderTextColor={c.muted}
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={() => void submit(false)}
          returnKeyType="done"
          submitBehavior="submit"
          cursorColor={c.primary}
          selectionColor={`${c.primary}55`}
          style={{ color: c.fg, fontSize: 20, paddingHorizontal: 18, paddingVertical: 10 }}
          testID="capture-title"
          accessibilityLabel={T.fields.title}
        />
        {showNote && (
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
        )}
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 10, paddingTop: 6, gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 8, paddingRight: 8 }} style={{ flex: 1 }}>
            {chip(T.views.inbox, <InboxIcon color={c.muted} size={15} />, undefined)}
            {chip("Beschreibung", <LinesIcon color={c.muted} size={14} />, () => setShowNote((x) => !x), "capture-toggle-note", showNote)}
            {chip("Bearbeiten", <Glyph color={c.muted} size={15}>✎</Glyph>, ready ? () => void submit(true) : undefined, "capture-edit")}
          </ScrollView>
          <Pressable
            onPress={() => void submit(false)}
            disabled={!ready}
            testID="capture-submit"
            accessibilityLabel="Erfassen (landet im Eingang, ohne Termin)"
            accessibilityRole="button"
            style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.primary, opacity: ready ? 1 : 0.45, alignItems: "center", justifyContent: "center" }}
          >
            <Glyph color={c.onPrimary} size={22} bold>↑</Glyph>
          </Pressable>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
