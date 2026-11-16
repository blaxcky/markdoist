// Bausteine der Einstellungsseiten: Abschnitt mit Überschrift, weiße Karte, Zeilen mit Symbol, Auswahl- und
// Schalterzeilen, kleine Plaketten. Hält Abstände und Farben an einer Stelle, damit beide Seiten gleich aussehen.
import type { ReactNode } from "react";
import { Pressable, Switch, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { ChevronIcon } from "./icons";

/** Einzug der Trennlinie unter Zeilen mit Symbol: 16 Rand + 44 Symbolbreite + 14 Abstand */
const ICON_INSET = 74;

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ paddingHorizontal: 4, gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: c.muted, fontSize: 13, fontWeight: "500" }}>
          {title}
        </Text>
        {hint ? <Text style={{ color: c.muted, fontSize: 13 }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Card({ children, style, testID, role, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string; role?: "radiogroup"; label?: string }) {
  const c = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={label}
      style={[{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline, borderRadius: 18, overflow: "hidden" }, style]}
    >
      {children}
    </View>
  );
}

export function Divider({ inset = ICON_INSET }: { inset?: number }) {
  const c = useTheme();
  return <View style={{ height: 1, backgroundColor: c.divider, marginLeft: inset }} />;
}

/** Fläche unten in einer Karte, etwas abgesetzt (Modellzustand, Hinweise). */
export function CardFooter({ children, inset = 16, testID }: { children: ReactNode; inset?: number; testID?: string }) {
  const c = useTheme();
  return (
    <View testID={testID} style={{ borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.field, paddingVertical: 14, paddingRight: 16, paddingLeft: inset, gap: 10 }}>
      {children}
    </View>
  );
}

/** Symbol auf getönter Fläche (Ordner, Diktieren). */
export function IconTile({ children, size = 44, bg, fg }: { children: (color: string) => ReactNode; size?: number; bg?: string; fg?: string }) {
  const c = useTheme();
  const color = fg ?? c.onPrimaryContainer;
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: bg ?? c.primaryContainer, alignItems: "center", justifyContent: "center" }}>{children(color)}</View>
  );
}

export function Pill({ label, tone = "neutral", testID }: { label: string; tone?: "neutral" | "ok" | "warn"; testID?: string }) {
  const c = useTheme();
  const [bg, fg] = tone === "ok" ? [c.doneContainer, c.onDoneContainer] : tone === "warn" ? [c.recBg, c.warn] : [c.badge, c.fg];
  return (
    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: bg, justifyContent: "center" }}>
      <Text testID={testID} style={{ color: fg, fontSize: 12, fontWeight: "500" }}>
        {label}
      </Text>
    </View>
  );
}

/** Zeile mit optionalem Symbol links, Titel, Untertitel und Inhalt rechts; mit `chevron` führt sie weiter. */
export function Row({
  icon,
  title,
  sub,
  trailing,
  chevron,
  onPress,
  testID,
  subTestID,
}: {
  icon?: (color: string) => ReactNode;
  title: string;
  sub?: string | null;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  testID?: string;
  subTestID?: string;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      accessibilityRole={onPress ? "button" : undefined}
      android_ripple={{ color: c.surfaceHigh }}
      style={{ minHeight: sub ? 64 : 56, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10, paddingHorizontal: 16 }}
    >
      {icon && <View style={{ width: 44, alignItems: "center" }}>{icon(c.muted)}</View>}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.fg, fontSize: 16 }}>{title}</Text>
        {sub ? (
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }} testID={subTestID}>
            {sub}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron && <ChevronIcon color={c.muted} size={16} />}
    </Pressable>
  );
}

/** Auswahlzeile einer Gruppe: Kreis links, Titel, Untertitel (z. B. Modellname) und Plakette rechts. */
export function RadioRow({
  title,
  sub,
  mono,
  selected,
  onPress,
  tag,
  first,
  testID,
}: {
  title: string;
  sub?: string;
  mono?: boolean;
  selected: boolean;
  onPress: () => void;
  tag?: ReactNode;
  first?: boolean;
  testID?: string;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      android_ripple={{ color: c.surfaceHigh }}
      style={{
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.divider,
        backgroundColor: selected ? c.recBg : c.surface,
      }}
    >
      <View style={{ width: 44, alignItems: "center" }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? c.primaryStrong : c.p4, alignItems: "center", justifyContent: "center" }}>
          {selected && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.primaryStrong }} />}
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.fg, fontSize: 16 }}>{title}</Text>
        {sub ? <Text style={{ color: c.muted, fontSize: 13, fontFamily: mono ? "monospace" : undefined }}>{sub}</Text> : null}
      </View>
      {tag}
    </Pressable>
  );
}

/** Schalterzeile: die ganze Zeile schaltet um, der Schalter behält seine Testkennung. */
export function SwitchRow({ title, hint, value, onChange, testID }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      android_ripple={{ color: c.surfaceHigh }}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16 }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: c.fg, fontSize: 16 }}>{title}</Text>
        {hint ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.outline }} thumbColor={c.onPrimary} testID={testID} />
    </Pressable>
  );
}

/** Kleiner Rahmenknopf (Prüfen, Entfernen, Modell löschen) oder gefüllt (Speichern, Herunterladen). */
export function SmallButton({ label, onPress, testID, disabled, filled, danger }: { label: string; onPress: () => void; testID?: string; disabled?: boolean; filled?: boolean; danger?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        borderWidth: filled ? 0 : 1,
        borderColor: c.outline,
        backgroundColor: filled ? c.primaryStrong : "transparent",
        justifyContent: "center",
        alignSelf: "flex-start",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: filled ? c.onPrimary : danger ? c.danger : c.fg, fontSize: 14, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}
