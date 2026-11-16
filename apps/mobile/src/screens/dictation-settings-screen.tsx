// Eigene Seite „Diktieren“ unter den Einstellungen; Ziel der Hinweise „Schlüssel fehlt“ und „Modell fehlt“.
import { KeyboardAvoidingView, ScrollView } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DictationSettings } from "../components/dictation-settings";
import { useTheme } from "../theme";

export function DictationSettingsScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  return (
    // Edge-to-edge (Android 15+): adjustResize verkleinert das Fenster nicht mehr. Ohne Ausgleich liegt die Tastatur
    // über den Eingabefeldern unten, und die Liste lässt sich nicht weit genug schieben, um sie freizulegen.
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <DictationSettings />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
