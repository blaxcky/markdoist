// Farben nach den Vorlage-Screenshots (warmer Grund, weiße Karten, Rot als Akzent), hell/dunkel nach Systemvorgabe oder Einstellung.
import { useColorScheme } from "react-native";
import { createContext, use } from "react";

export const light = {
  bg: "#F6F2EE",
  surface: "#FFFFFF",
  surfaceHigh: "#EDE8E3",
  tabBar: "#FBF9F7",
  fg: "#202020",
  muted: "#6B6560",
  outline: "#E4DED8",
  primary: "#DC4C3E",
  onPrimary: "#FFFFFF",
  primaryContainer: "#FFE8DE",
  danger: "#D1453B",
  warn: "#AD6200",
  badge: "#EFEAE5",
  backdrop: "rgba(0,0,0,0.32)",
  p1: "#D1453B",
  p2: "#EB8909",
  p3: "#246FE0",
  p4: "#8A8580",
  toneToday: "#058527",
  toneTomorrow: "#AD6200",
  toneWeek: "#692EC2",
  doneContainer: "#E3F1E6",
  onDoneContainer: "#056B20",
  divider: "#EFEAE5",
};

export const dark: typeof light = {
  bg: "#181818",
  surface: "#262626",
  surfaceHigh: "#333333",
  tabBar: "#1F1F1F",
  fg: "#E8E8E8",
  muted: "#A8A8A8",
  outline: "#383838",
  primary: "#E2584C",
  onPrimary: "#FFFFFF",
  primaryContainer: "#47302B",
  danger: "#FF7066",
  warn: "#FF9A14",
  badge: "#333333",
  backdrop: "rgba(0,0,0,0.55)",
  p1: "#FF7066",
  p2: "#FF9A14",
  p3: "#5297FF",
  p4: "#8A8A8A",
  toneToday: "#25B84C",
  toneTomorrow: "#FF9A14",
  toneWeek: "#A970FF",
  doneContainer: "#1E3B25",
  onDoneContainer: "#7BD88F",
  divider: "#303030",
};

export type Theme = typeof light;
export type ThemeSetting = "system" | "light" | "dark";

export const ThemeSettingContext = createContext<{ setting: ThemeSetting; set(s: ThemeSetting): void }>({
  setting: "system",
  set: () => {},
});

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const { setting } = use(ThemeSettingContext);
  const isDark = setting === "dark" || (setting === "system" && scheme === "dark");
  return isDark ? dark : light;
}

/** Farbe des runden Hakens nach Priorität (hoch = rot … keine = grau). */
export function prioColor(c: Theme, p: "high" | "normal" | "low" | "none"): string {
  return { high: c.p1, normal: c.p2, low: c.p3, none: c.p4 }[p];
}
