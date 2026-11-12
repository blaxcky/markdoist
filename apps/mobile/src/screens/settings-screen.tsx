import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { use } from "react";
import { useRepo, useRepoState } from "../repo";
import { useFolder } from "../folder";
import { ThemeSettingContext, useTheme, type ThemeSetting } from "../theme";
import type { RootStack } from "../navigation";
import { DictationSettings } from "../components/dictation-settings";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function SettingsScreen() {
  const c = useTheme();
  const repo = useRepo();
  const state = useRepoState();
  const folder = useFolder();
  const theme = use(ThemeSettingContext);
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const row = (label: string, onPress: () => void, testID?: string) => (
    <Pressable onPress={onPress} testID={testID} android_ripple={{ color: c.surfaceHigh }} style={{ paddingVertical: 14 }}>
      <Text style={{ color: c.fg, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
  return (
    // Edge-to-edge (Android 15+): adjustResize verkleinert das Fenster nicht mehr. Ohne Ausgleich liegt die Tastatur
    // über den Eingabefeldern unten, und die Liste lässt sich nicht weit genug schieben, um sie freizulegen.
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 4 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: c.muted, fontSize: 13 }}>Aufgabenordner</Text>
        <Text selectable style={{ color: c.fg, fontSize: 16 }}>{folder.name}</Text>
        {row("Ordner wechseln / Freigabe erneuern", () => void folder.choose(), "change-folder")}
        {row(T.actions.rescan, () => void repo.scan({ full: true }))}
        {state.lastScan && (
          <Text selectable style={{ color: c.muted, fontSize: 13 }} testID="last-scan">
            Letzter {state.lastScan.full ? "vollständiger " : ""}Abgleich: {state.lastScan.files} Dateien, {state.lastScan.read} gelesen, {state.lastScan.ms} ms (Lesen {state.lastScan.readMs} ms, Auswerten {state.lastScan.parseMs} ms)
            {state.cacheLoadMs !== null ? `; Anzeige aus Cache nach ${state.cacheLoadMs} ms` : ""}
          </Text>
        )}
        {row(T.views.trash, () => nav.navigate("Trash"), "open-trash")}
        <Text style={{ color: c.muted, fontSize: 13, marginTop: 16 }}>Darstellung</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          {(["system", "light", "dark"] as ThemeSetting[]).map((s) => (
            <Pressable key={s} onPress={() => theme.set(s)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.setting === s ? c.primary : c.outline, backgroundColor: theme.setting === s ? c.primaryContainer : "transparent" }}>
              <Text style={{ color: c.fg }}>{{ system: "System", light: "Hell", dark: "Dunkel" }[s]}</Text>
            </Pressable>
          ))}
        </View>
        <DictationSettings />
        <Text style={{ color: c.muted, fontSize: 13, marginTop: 24 }}>Über</Text>
        <Text selectable style={{ color: c.fg }} testID="version">Markdoist {Constants.expoConfig?.version ?? ""}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
