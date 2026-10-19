// Liniensymbole im Stil der Vorlage, aus Views gezeichnet (kein SVG, kein neuer nativer Build nötig).
import { Text, View } from "react-native";

type P = { color: string; size?: number };

const stroke = (size: number) => Math.max(1.4, Math.round(size / 11));

/** Kalenderblatt; mit `day` als Tageszahl, mit `filled` als gefüllte Fläche (aktive „Heute“-Schaltfläche). */
export function CalendarIcon({ color, size = 14, day, filled, fillText = "#fff" }: P & { day?: number; filled?: boolean; fillText?: string }) {
  const b = stroke(size);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: b,
        borderTopWidth: Math.max(b * 2, size * 0.22),
        borderColor: color,
        borderRadius: size * 0.2,
        backgroundColor: filled ? color : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {day !== undefined ? (
        <Text style={{ color: filled ? fillText : color, fontSize: size * 0.48, lineHeight: size * 0.56, fontWeight: "700", includeFontPadding: false }}>{day}</Text>
      ) : (
        <View style={{ position: "absolute", bottom: size * 0.12, right: size * 0.14, width: size * 0.26, height: b, backgroundColor: color }} />
      )}
    </View>
  );
}

/** Ablagefach (Eingang). */
export function InboxIcon({ color, size = 14, filled }: P & { filled?: boolean }) {
  const b = stroke(size);
  const top = size * 0.42;
  return (
    <View style={{ width: size, height: size * 0.9, borderWidth: b, borderColor: color, borderRadius: size * 0.2, overflow: "hidden" }}>
      {filled && <View style={{ position: "absolute", left: 0, right: 0, top, bottom: 0, backgroundColor: color }} />}
      <View style={{ position: "absolute", left: 0, width: size * 0.28, top, height: b, backgroundColor: color }} />
      <View style={{ position: "absolute", right: 0, width: size * 0.28, top, height: b, backgroundColor: color }} />
      <View
        style={{
          position: "absolute",
          left: size * 0.24,
          right: size * 0.24,
          top,
          height: size * 0.22,
          borderWidth: b,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: size * 0.12,
          borderBottomRightRadius: size * 0.12,
          backgroundColor: filled ? color : "transparent",
        }}
      />
    </View>
  );
}

/** Kalender mit Punkteraster (Alle offenen). */
export function GridIcon({ color, size = 14 }: P) {
  const b = stroke(size);
  const dot = Math.max(2, size * 0.13);
  return (
    <View style={{ width: size, height: size, borderWidth: b, borderTopWidth: Math.max(b * 2, size * 0.2), borderColor: color, borderRadius: size * 0.2, padding: size * 0.1, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignContent: "space-around" }}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ width: dot, height: dot, borderRadius: 1, backgroundColor: color, marginHorizontal: size * 0.02 }} />
      ))}
    </View>
  );
}

/** Kreis mit Haken (Erledigt). */
export function CheckCircleIcon({ color, size = 14 }: P) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: stroke(size), borderColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color, fontSize: size * 0.62, lineHeight: size * 0.72, fontWeight: "700", includeFontPadding: false }}>✓</Text>
    </View>
  );
}

/** Drei waagerechte Striche. */
export function MenuIcon({ color, size = 18 }: P) {
  const b = stroke(size);
  return (
    <View style={{ width: size, height: size * 0.72, justifyContent: "space-between" }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ height: b, borderRadius: b, backgroundColor: color }} />
      ))}
    </View>
  );
}

/** Drei senkrechte Punkte (⋮). */
export function DotsIcon({ color, size = 18 }: P) {
  const d = Math.max(3, size * 0.2);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "space-between", paddingVertical: size * 0.04 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

/** Blatt mit Zeilen (Anzeige: Filter und Sortierung); `dot` markiert aktive Einstellungen. */
export function ViewOptionsIcon({ color, size = 20, dot }: P & { dot?: string }) {
  const b = stroke(size);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: "absolute", left: size * 0.08, right: size * 0.14, top: size * 0.12, bottom: size * 0.06, borderWidth: b, borderColor: color, borderRadius: size * 0.14, paddingHorizontal: size * 0.14, justifyContent: "space-evenly" }}>
        {[0.5, 0.5, 0.35].map((w, i) => (
          <View key={i} style={{ height: b, width: size * w, backgroundColor: color }} />
        ))}
      </View>
      {dot && <View style={{ position: "absolute", right: 0, top: 0, width: size * 0.34, height: size * 0.34, borderRadius: size, backgroundColor: dot }} />}
    </View>
  );
}

export function SearchIcon({ color, size = 18 }: P) {
  const b = stroke(size);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size * 0.72, height: size * 0.72, borderRadius: size, borderWidth: b, borderColor: color }} />
      <View style={{ position: "absolute", width: size * 0.36, height: b * 1.2, backgroundColor: color, right: -size * 0.02, bottom: size * 0.12, transform: [{ rotate: "45deg" }] }} />
    </View>
  );
}

export function FlagIcon({ color, size = 14 }: P) {
  const b = stroke(size);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: "absolute", left: size * 0.1, top: 0, bottom: 0, width: b, backgroundColor: color }} />
      <View style={{ position: "absolute", left: size * 0.1, top: size * 0.06, width: size * 0.75, height: size * 0.5, borderWidth: b, borderColor: color, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />
    </View>
  );
}

export function ClockIcon({ color, size = 14 }: P) {
  const b = stroke(size);
  return (
    <View style={{ width: size, height: size, borderRadius: size, borderWidth: b, borderColor: color }}>
      <View style={{ position: "absolute", left: size / 2 - b, top: size * 0.18, width: b, height: size * 0.34, backgroundColor: color }} />
      <View style={{ position: "absolute", left: size / 2 - b, top: size / 2 - b, width: size * 0.26, height: b, backgroundColor: color }} />
    </View>
  );
}

/** Zeilen unterschiedlicher Länge (Beschreibung). */
export function LinesIcon({ color, size = 14 }: P) {
  const b = stroke(size);
  return (
    <View style={{ width: size, height: size * 0.8, justifyContent: "space-between" }}>
      {[1, 1, 1, 0.6].map((w, i) => (
        <View key={i} style={{ height: b, width: size * w, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function PlusIcon({ color, size = 16, weight }: P & { weight?: number }) {
  const b = weight ?? stroke(size);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: b, borderRadius: b, backgroundColor: color }} />
      <View style={{ position: "absolute", width: b, height: size, borderRadius: b, backgroundColor: color }} />
    </View>
  );
}

/** Kleine Textsymbole, die als Glyphe gut genug aussehen. */
export function Glyph({ children, color, size = 14, bold }: P & { children: string; bold?: boolean }) {
  return <Text style={{ color, fontSize: size, lineHeight: size * 1.15, fontWeight: bold ? "700" : "400", includeFontPadding: false }}>{children}</Text>;
}
