// Farben nach Material 3 (Grün als Primärfarbe), hell/dunkel nach Systemvorgabe oder Einstellung.
import { useColorScheme } from "react-native";
import { createContext, use } from "react";

export const light = {
  bg: "#FBFDF7",
  surface: "#F0F4EC",
  surfaceHigh: "#E5EADF",
  fg: "#191D17",
  muted: "#5C6358",
  outline: "#C0C9BB",
  primary: "#2E7D32",
  onPrimary: "#FFFFFF",
  primaryContainer: "#B8F0B2",
  danger: "#BA1A1A",
  warn: "#8A5100",
  badge: "#E1E6DA",
};

export const dark: typeof light = {
  bg: "#111410",
  surface: "#1A1D18",
  surfaceHigh: "#252A23",
  fg: "#E1E4DC",
  muted: "#A9B0A3",
  outline: "#42493F",
  primary: "#8FD88A",
  onPrimary: "#00390B",
  primaryContainer: "#1F5323",
  danger: "#FFB4AB",
  warn: "#FFB868",
  badge: "#2C3229",
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
