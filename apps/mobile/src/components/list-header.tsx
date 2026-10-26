// Kopfzeile der Listen nach Vorlage: große Überschrift mit Aufgabenzahl, rechts Anzeige-Optionen und ⋮-Menü.
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@markdoist/app";
import { problemsView } from "@markdoist/core";
import { filterActive, useFilter } from "../filter";
import { useRepo, useRepoState } from "../repo";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";
import { Menu } from "./menu";
import { DotsIcon, Glyph, SearchIcon, ViewOptionsIcon } from "./icons";

export function ListHeader({ title, subtitle, filter = true }: { title: string; subtitle?: string; filter?: boolean }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const state = useRepoState();
  const repo = useRepo();
  const c = useTheme();
  const f = useFilter();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const problems = useMemo(
    () => problemsView(state.index).length + state.recovery.length + repo.pendingDrafts(5000).length,
    [state.index, state.recovery, state.drafts, state.files, repo],
  );
  const active = filterActive(f.filter, f.sort, f.inboxNewest);
  const iconBtn = (child: ReactNode, onPress: () => void, testID: string, label: string) => (
    <Pressable onPress={onPress} hitSlop={6} testID={testID} accessibilityLabel={label} accessibilityRole="button" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 }} android_ripple={{ color: c.surfaceHigh, borderless: true }}>
      {child}
    </Pressable>
  );
  return (
    <View style={{ paddingTop: insets.top + 14, paddingLeft: 18, paddingRight: 8, paddingBottom: 6, flexDirection: "row", alignItems: "flex-start", backgroundColor: c.bg }}>
      <View style={{ flex: 1, paddingTop: 2 }}>
        <Text style={{ color: c.fg, fontSize: 22, fontWeight: "600" }} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={{ color: c.muted, fontSize: 13, marginTop: 1 }} testID="list-count">{subtitle}</Text> : null}
      </View>
      {problems > 0 && (
        <Pressable onPress={() => nav.navigate("Problems")} testID="nav-problems" accessibilityLabel={`${T.views.problems}: ${problems}`} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 40, paddingHorizontal: 8 }}>
          <Glyph color={c.warn} size={16}>⚠</Glyph>
          <Text style={{ color: c.warn, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{problems}</Text>
        </Pressable>
      )}
      {iconBtn(<SearchIcon color={c.fg} size={19} />, () => nav.navigate("Search"), "nav-search", T.views.search)}
      {filter && iconBtn(<ViewOptionsIcon color={c.fg} size={21} dot={active ? c.primary : undefined} />, () => f.setOpen(true), "nav-filter", "Filter und Sortierung")}
      {iconBtn(<DotsIcon color={c.fg} size={18} />, () => setMenu(true), "nav-menu", "Weitere Optionen")}
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        placement="top"
        top={52}
        items={[
          filter && { label: "Filter und Sortierung", onPress: () => f.setOpen(true) },
          { label: T.actions.rescan, onPress: () => void repo.scan({ full: true }) },
          { label: problems > 0 ? `${T.views.problems} (${problems})` : T.views.problems, onPress: () => nav.navigate("Problems") },
          { label: T.views.trash, onPress: () => nav.navigate("Trash") },
          { label: "Einstellungen", onPress: () => nav.navigate("Settings"), testID: "nav-settings" },
        ]}
      />
    </View>
  );
}
