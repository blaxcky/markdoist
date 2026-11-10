// Art eines Programmier-Eintrags (4.10) als kleiner Chip: Karte im Board und Detail.
import { Text, View } from "react-native";
import { T } from "@markdoist/app";
import type { DevType } from "@markdoist/core";
import { useTheme, type Theme } from "../theme";

export function typeColors(c: Theme, t: DevType): { bg: string; fg: string } {
  return t === "bug" ? { bg: c.bugBg, fg: c.bugFg } : t === "feature" ? { bg: c.featureBg, fg: c.featureFg } : { bg: c.ideaBg, fg: c.ideaFg };
}

export function DevTypeChip({ type }: { type: DevType }) {
  const c = useTheme();
  const col = typeColors(c, type);
  return (
    <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: "center", backgroundColor: col.bg }} testID={`dev-type-${type}`}>
      <Text style={{ color: col.fg, fontSize: 12, fontWeight: "600" }}>{T.dev.typeLabels[type]}</Text>
    </View>
  );
}
