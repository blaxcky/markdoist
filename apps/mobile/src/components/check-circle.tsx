// Runder Haken mit kurzem Ploppen beim Abhaken; gemeinsam für Aufgaben (4.5) und Listeneinträge (4.6).
import { useEffect } from "react";
import { Text } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import type { CompletionPhase } from "@markdoist/app";
import { useTheme } from "../theme";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

interface Props {
  checked: boolean;
  /** Abhak-Ablauf: „checked“ löst das Ploppen aus */
  phase?: CompletionPhase;
  /** Randfarbe im offenen Zustand */
  ring?: string;
  /** Kräftiger Rand mit getöntem Grund (Priorität gesetzt) */
  strong?: boolean;
  /** Zeile der Ausgangslage: FlashList verwendet Zeilen wieder, der Zustand hängt am Prop. */
  id?: string;
}

export function CheckCircle({ checked, phase, ring, strong = false, id }: Props) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (phase === "checked" && !reduced) pop.set(withSequence(withTiming(1.15, { duration: 80, easing: EASE_OUT }), withTiming(1, { duration: 70, easing: EASE_OUT })));
  }, [phase, id, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const color = ring ?? c.p4;
  return (
    <Animated.View
      style={[
        {
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: strong ? 2 : 1.2,
          borderColor: checked ? c.p4 : color,
          backgroundColor: checked ? c.p4 : strong ? `${color}1A` : "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        },
        popStyle,
      ]}
    >
      {checked && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
    </Animated.View>
  );
}
