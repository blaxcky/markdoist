// Eingabeblatt der Erfassung (4.1): Blatt über der Liste, Titelzeile, darunter Chips und Plus-Knopf über der Tastatur.
// Gemeinsam für neue Aufgaben, neue Listen und Listeneinträge (4.6); läuft als kopfloses transparentModal.
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Animated, { Easing, SlideInDown, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { PlusIcon } from "./icons";

interface Props {
  value: string;
  onChangeText(text: string): void;
  placeholder: string;
  onSubmit(): void;
  /** Senden möglich (Text vorhanden, kein Schreiben im Gang) */
  ready: boolean;
  /** Bleibt nach dem Senden offen (Listeneinträge): Das Feld behält den Fokus. */
  keepOpen?: boolean;
  /** Zusatzfelder unter der Titelzeile (Beschreibung) */
  extra?: ReactNode;
  /** Chips links neben dem Senden-Knopf */
  chips?: ReactNode;
  accessibilityLabel?: string;
  submitLabel: string;
  testID: { input: string; submit: string };
}

export function CaptureSheet({ value, onChangeText, placeholder, onSubmit, ready, keepOpen, extra, chips, accessibilityLabel, submitLabel, testID }: Props) {
  const c = useTheme();
  const nav = useNavigation();
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
  // Wird Senden möglich, dreht sich das Plus zügig eine Vierteldrehung und der Knopf wird voll; bremst weich ab, ohne Nachschwingen.
  const armed = useSharedValue(ready ? 1 : 0);
  useEffect(() => {
    armed.value = withTiming(ready ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [ready, armed]);
  const buttonStyle = useAnimatedStyle(() => ({ opacity: interpolate(armed.value, [0, 1], [0.45, 1]) }));
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${armed.value * 90}deg` }] }));
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.backdrop }}>
      <Pressable style={{ flex: 1 }} onPress={() => nav.goBack()} accessibilityLabel="Schließen" testID="sheet-close" />
      <Animated.View entering={SlideInDown.duration(200)} style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 12 + (keyboard ? 0 : insets.bottom) }}>
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.outline, marginBottom: 4 }} />
        <TextInput
          autoFocus
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          returnKeyType={keepOpen ? "next" : "done"}
          submitBehavior="submit"
          cursorColor={c.primary}
          selectionColor={`${c.primary}55`}
          style={{ color: c.fg, fontSize: 20, paddingHorizontal: 18, paddingVertical: 10 }}
          testID={testID.input}
          accessibilityLabel={accessibilityLabel}
        />
        {extra}
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 10, paddingTop: 6, gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 8, paddingRight: 8 }} style={{ flex: 1 }}>
            {chips}
          </ScrollView>
          <Animated.View style={buttonStyle}>
            <Pressable
              onPress={onSubmit}
              disabled={!ready}
              testID={testID.submit}
              accessibilityLabel={submitLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready }}
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}
            >
              <Animated.View style={plusStyle}>
                <PlusIcon color={c.onPrimary} size={18} weight={2.4} />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
