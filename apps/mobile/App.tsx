import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, AppState, Pressable, Text, View, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import type { Repository } from "@markdoist/app";
import { T } from "@markdoist/app";
import SafStorage from "./modules/saf-storage/src/SafStorageModule";
import { createRepository, DOCUMENTS_URI, kv, loadFolder, RepoContext, saveFolder, systemClock, type Folder } from "./src/repo";
import { NotifyProvider } from "./src/notify";
import { RootNavigator, linking } from "./src/navigation";
import { FolderContext } from "./src/folder";
import { dark, light, ThemeSettingContext, type ThemeSetting } from "./src/theme";

export default function App() {
  const scheme = useColorScheme();
  const [setting, setSetting] = useState<ThemeSetting>("system");
  const [folder, setFolder] = useState<Folder | null | undefined>(undefined);
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void kv.get("theme").then((t) => t && setSetting(t as ThemeSetting));
    void loadFolder().then(setFolder);
  }, []);

  const themeApi = useMemo(
    () => ({
      setting,
      set: (s: ThemeSetting) => {
        setSetting(s);
        void kv.set("theme", s);
      },
    }),
    [setting],
  );
  const isDark = setting === "dark" || (setting === "system" && scheme === "dark");
  const c = isDark ? dark : light;

  const choose = useCallback(async () => {
    setError(null);
    try {
      const picked = await SafStorage.pickFolder(DOCUMENTS_URI);
      if (!picked) return;
      await saveFolder(picked);
      setFolder(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Repository je Ordner; Ordnerwechsel beendet Aufträge des alten Ordners (7.6).
  useEffect(() => {
    if (!folder) return;
    const r = createRepository(folder);
    setRepo(r);
    void r.open();
    return () => r.close();
  }, [folder]);

  // Zurückwechseln: Heute neu auswerten und vollständig abgleichen (3.3, 7.1).
  useEffect(() => {
    if (!repo) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        repo.refreshClock();
        void repo.scan({ full: true });
      }
    });
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const clk = systemClock();
      const now = clk.now().toZonedDateTimeISO(clk.timeZone);
      const next = now.toPlainDate().add({ days: 1 }).toZonedDateTime(clk.timeZone);
      timer = setTimeout(() => {
        repo.refreshClock();
        tick();
      }, Math.min(next.epochMilliseconds - now.epochMilliseconds + 500, 60_000));
    };
    tick();
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [repo]);

  const navTheme = useMemo(
    () => ({ ...(isDark ? DarkTheme : DefaultTheme), colors: { ...(isDark ? DarkTheme : DefaultTheme).colors, background: c.bg, card: c.surface, text: c.fg, border: c.outline, primary: c.primary } }),
    [isDark, c],
  );

  let content;
  if (folder === undefined) content = <ActivityIndicator style={{ flex: 1 }} color={c.primary} />;
  else if (!folder || !repo) {
    content = (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24, backgroundColor: c.bg }}>
        <Text style={{ fontSize: 28, fontWeight: "600", color: c.fg }}>{T.appName}</Text>
        <Text style={{ color: c.muted, textAlign: "center" }}>
          {T.empty.noFolder} Am besten einen Unterordner in „Documents“, z. B. im Obsidian-Vault.
        </Text>
        <Pressable onPress={() => void choose()} testID="choose-folder" style={{ backgroundColor: c.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20 }}>
          <Text style={{ color: c.onPrimary, fontWeight: "600" }}>{T.actions.chooseFolder}</Text>
        </Pressable>
        {error && <Text selectable style={{ color: c.danger, textAlign: "center" }}>{error}</Text>}
      </View>
    );
  } else {
    content = (
      <RepoContext value={repo}>
        <FolderContext value={{ name: folder.name, choose }}>
          <NotifyProvider>
            <NavigationContainer linking={linking} theme={navTheme}>
              <RootNavigator />
            </NavigationContainer>
          </NotifyProvider>
        </FolderContext>
      </RepoContext>
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeSettingContext value={themeApi}>
          {content}
          <StatusBar style={isDark ? "light" : "dark"} />
        </ThemeSettingContext>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
