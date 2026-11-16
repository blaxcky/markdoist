// Einstellungen am Handy: gruppierte Karten (Ordner, Darstellung, Diktieren, Über). Diktieren hat eine eigene
// Seite; hier steht nur eine Zeile mit Zusammenfassung und Zustand.
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PROVIDER_LABEL, T, textModels, transcribeTarget } from "@markdoist/app";
import { use } from "react";
import { useRepo, useRepoState } from "../repo";
import { useFolder } from "../folder";
import { ThemeSettingContext, useTheme, type ThemeSetting } from "../theme";
import type { RootStack } from "../navigation";
import { useDictationConfig } from "../dictation/store";
import { localAvailable, useLocalModel } from "../dictation/local";
import { ChevronIcon, FolderIcon, MicIcon, RepeatIcon, TrashIcon } from "../components/icons";
import { Card, Divider, IconTile, Pill, Row, Section } from "../components/settings-ui";

const P = T.dictation.page;
const THEMES: { id: ThemeSetting; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Hell" },
  { id: "dark", label: "Dunkel" },
];

function DictationEntry({ onPress }: { onPress: () => void }) {
  const c = useTheme();
  const { keys, settings, loaded } = useDictationConfig();
  const local = useLocalModel();
  const picked = transcribeTarget(settings).provider;
  const stt = picked === "local" && !localAvailable() ? "openai" : picked;
  const text = textModels(settings).provider;
  const missing = stt === "local" ? (local?.state === "ready" ? null : P.noModel) : keys[stt] ? null : P.noKey;
  const textMissing = !keys[text];
  const status = !loaded ? null : missing ?? (textMissing ? P.noKey : null);
  return (
    <Pressable
      onPress={onPress}
      testID="open-dictation"
      accessibilityRole="button"
      android_ripple={{ color: c.surfaceHigh }}
      style={{ minHeight: 76, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 16 }}
    >
      <IconTile>{(col) => <MicIcon color={col} size={20} />}</IconTile>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: c.fg, fontSize: 16 }}>{P.entry}</Text>
          {loaded && <Pill label={status ?? P.ready} tone={status ? "warn" : "ok"} testID="dictation-status-pill" />}
        </View>
        {loaded && (
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
            {P.summary(stt === "local" ? P.sttOnDevice : P.sttWith(PROVIDER_LABEL[stt]), PROVIDER_LABEL[text])}
          </Text>
        )}
      </View>
      <ChevronIcon color={c.muted} size={16} />
    </Pressable>
  );
}

export function SettingsScreen() {
  const c = useTheme();
  const repo = useRepo();
  const state = useRepoState();
  const folder = useFolder();
  const theme = use(ThemeSettingContext);
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState(false);
  const scan = state.lastScan;
  const trash = state.trash.length;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 22 }}>
      <Section title="Aufgabenordner">
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
            <IconTile>{(col) => <FolderIcon color={col} size={22} />}</IconTile>
            <View style={{ flex: 1, gap: 2 }}>
              <Text selectable style={{ color: c.fg, fontSize: 17, fontWeight: "500" }} numberOfLines={2}>
                {folder.name}
              </Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>{scan ? `${scan.files} Dateien` : "Freigegebener Ordner"}</Text>
            </View>
            <Pressable
              onPress={() => void folder.choose()}
              testID="change-folder"
              accessibilityRole="button"
              accessibilityLabel="Ordner wechseln oder Freigabe erneuern"
              style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: c.outline, justifyContent: "center" }}
            >
              <Text style={{ color: c.primaryStrong, fontSize: 14, fontWeight: "500" }}>Wechseln</Text>
            </Pressable>
          </View>
          <Divider />
          <Row icon={(col) => <RepeatIcon color={col} size={20} />} title={T.actions.rescan} sub="Alle Dateien im Ordner neu lesen" onPress={() => void repo.scan({ full: true })} testID="rescan" />
          <Divider />
          <Row
            icon={(col) => <TrashIcon color={col} size={20} />}
            title={T.views.trash}
            onPress={() => nav.navigate("Trash")}
            testID="open-trash"
            chevron
            trailing={trash > 0 ? <Pill label={String(trash)} /> : undefined}
          />
        </Card>
      </Section>

      <Section title="Darstellung">
        <Card style={{ padding: 6, flexDirection: "row", gap: 4 }} role="radiogroup" label="Darstellung">
          {THEMES.map((t) => {
            const on = theme.setting === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => theme.set(t.id)}
                testID={`theme-${t.id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                style={{ flex: 1, height: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.primaryContainer : "transparent" }}
              >
                <Text style={{ color: on ? c.onPrimaryContainer : c.fg, fontSize: 15, fontWeight: on ? "500" : "400" }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </Card>
      </Section>

      <Section title={T.dictation.section}>
        <Card>
          <DictationEntry onPress={() => nav.navigate("Dictation")} />
        </Card>
      </Section>

      <Section title="Über">
        <Card>
          <Row title="Markdoist" trailing={<Text selectable style={{ color: c.muted, fontSize: 15 }} testID="version">{Constants.expoConfig?.version ?? ""}</Text>} />
          {scan && (
            <>
              <Divider inset={16} />
              <Row title="Messwerte des letzten Abgleichs" onPress={() => setStats((v) => !v)} testID="scan-stats" trailing={<ChevronIcon color={c.muted} size={16} dir={stats ? "down" : "right"} />} />
              {stats && (
                <Text selectable style={{ color: c.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingBottom: 16 }} testID="last-scan">
                  Letzter {scan.full ? "vollständiger " : ""}Abgleich: {scan.files} Dateien, {scan.read} gelesen, {scan.ms} ms (Lesen {scan.readMs} ms, Auswerten {scan.parseMs} ms)
                  {state.cacheLoadMs !== null ? `; Anzeige aus Cache nach ${state.cacheLoadMs} ms` : ""}
                </Text>
              )}
            </>
          )}
        </Card>
      </Section>
    </ScrollView>
  );
}
