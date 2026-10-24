// Listenzeile mit Wischgesten (4.5): nach rechts erledigt, nach links Aktionen.
// Gestaltung nach Vorlage: weiße Karte, runder Haken in Prioritätsfarbe, Datum mit Kalendersymbol in Farbstufe.
import { Text, View } from "react-native";
import { Pressable as GesturePressable } from "react-native-gesture-handler";
import { useCallback, useEffect, useRef } from "react";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { COMPLETE_FADE_MS, T, type CompletionPhase } from "@markdoist/app";
import type { Temporal, TaskView } from "@markdoist/core";
import { dateLabel, toneColor } from "../format";
import { prioColor, useTheme } from "../theme";
import { CalendarIcon, ClockIcon, Glyph, InboxIcon } from "./icons";

interface Props {
  view: TaskView;
  today: Temporal.PlainDate;
  tz: string;
  scheduledHint?: boolean;
  /** Lage in der Kartengruppe: abgerundete Ecken oben/unten */
  first?: boolean;
  last?: boolean;
  /** „Eingang“ rechts anzeigen (nicht in der Eingangsansicht selbst) */
  showInbox?: boolean;
  /** Abhak-Ablauf: Zielzustand zeigen bzw. ausblenden */
  phase?: CompletionPhase;
  onLeft?(): void;
  onOpen(): void;
  onToggle(): void;
  onActions(): void;
}

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// Wischen erst nach deutlicher Seitwärtsbewegung; wer zuerst senkrecht zieht, scrollt die Liste.
// failOffsetY kommt aus patches/react-native-gesture-handler@3.3.0.patch.
const SWIPE_OFFSET_X = 20;
const SWIPE_FAIL_Y: [number, number] = [-10, 10];

export function TaskRow({ view, today, tz, scheduledHint, first = true, last = true, showInbox = true, phase, onLeft, onOpen, onToggle, onActions }: Props) {
  const c = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const f = view.task.fields;
  const done = f.status === "done";
  // Während des Ablaufs zeigt der Haken den Zielzustand (gesetzt bzw. beim Wiederöffnen entfernt).
  const checked = done !== (phase !== undefined);
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const fade = useSharedValue(1);
  const leftRef = useRef(onLeft);
  useEffect(() => {
    leftRef.current = onLeft;
  });
  const left = useCallback(() => leftRef.current?.(), []);
  // Zustand hängt am phase-Prop, nicht an der Zeile: FlashList verwendet Zeilen wieder.
  useEffect(() => {
    if (phase === "checked" && !reduced) pop.set(withSequence(withTiming(1.15, { duration: 80, easing: EASE_OUT }), withTiming(1, { duration: 70, easing: EASE_OUT })));
    if (phase === "leaving")
      fade.set(
        withTiming(0, { duration: reduced ? 0 : COMPLETE_FADE_MS, easing: EASE_OUT }, (finished) => {
          if (finished) scheduleOnRN(left);
        }),
      );
    else fade.set(1);
  }, [phase, view.task.ref, reduced, pop, fade, left]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const warn = view.diagnostics.some((d) => d.severity !== "info");
  const ring = prioColor(c, f.priority);
  const due = view.due ? dateLabel(view.due, today, tz, view.overdue) : null;
  const sch = view.scheduled ? dateLabel(view.scheduled, today, tz) : null;
  const meta = !!(due || sch || view.series || warn || f.status === "in-progress" || (showInbox && f.inbox && !done));
  const radius = { borderTopLeftRadius: first ? 12 : 0, borderTopRightRadius: first ? 12 : 0, borderBottomLeftRadius: last ? 12 : 0, borderBottomRightRadius: last ? 12 : 0 };
  return (
    <Animated.View pointerEvents={phase === "leaving" ? "none" : "auto"} style={[{ marginHorizontal: 8, marginBottom: last ? 0 : 2, overflow: "hidden", ...radius }, fadeStyle]}>
      <ReanimatedSwipeable
        ref={swipe}
        friction={2}
        leftThreshold={70}
        rightThreshold={70}
        dragOffsetFromLeft={SWIPE_OFFSET_X}
        dragOffsetFromRight={-SWIPE_OFFSET_X}
        failOffsetY={SWIPE_FAIL_Y}
        // Während des Ablaufs keine Wischaktionen: Beim Ausblenden schienen sie durch die Zeile.
        renderLeftActions={phase ? undefined : () => (
          <View style={{ flex: 1, backgroundColor: c.primary, justifyContent: "center", paddingLeft: 20 }}>
            <Text style={{ color: c.onPrimary, fontWeight: "600" }}>{done ? T.actions.reopen : T.actions.complete}</Text>
          </View>
        )}
        renderRightActions={phase ? undefined : () => (
          <View style={{ flex: 1, backgroundColor: c.surfaceHigh, justifyContent: "center", alignItems: "flex-end", paddingRight: 20 }}>
            <Text style={{ color: c.fg, fontWeight: "600" }}>Aktionen</Text>
          </View>
        )}
        onSwipeableOpen={(dir) => {
          swipe.current?.close();
          if (view.readOnly) return;
          // Gemeldet wird die Bewegungsrichtung (im Emulator geprüft):
          // nach rechts = erledigen, nach links = Aktionen (4.5).
          if (dir === "right") onToggle();
          else onActions();
        }}
      >
        {/* Haken und Zeile liegen nebeneinander statt ineinander: verschachtelt lösten
            beide aus, ein Tipp auf den Haken öffnete zusätzlich das Detail. */}
        <View style={{ flexDirection: "row", backgroundColor: c.surface }}>
          <GesturePressable
            onPress={view.readOnly ? undefined : onToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={done ? T.actions.reopen : T.actions.complete}
            testID={`check-${f.title}`}
            style={{ paddingLeft: 16, paddingRight: 14, paddingVertical: 12 }}
          >
            <Animated.View
              style={[
                {
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: f.priority === "none" ? 1.2 : 2,
                  borderColor: checked ? c.p4 : ring,
                  backgroundColor: checked ? c.p4 : f.priority === "none" ? "transparent" : `${ring}1A`,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                },
                popStyle,
              ]}
            >
              {checked && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
            </Animated.View>
          </GesturePressable>
          <GesturePressable
            onPress={onOpen}
            onLongPress={onActions}
            delayLongPress={600}
            android_ripple={{ color: c.surfaceHigh }}
            style={{ flex: 1, gap: 4, paddingRight: 14, paddingVertical: 12 }}
            testID={`row-${f.title}`}
            accessibilityLabel={`${f.title}${view.overdue ? `, ${T.badges.overdue}` : ""}`}
            accessibilityActions={[
              { name: "toggle", label: done ? T.actions.reopen : T.actions.complete },
              { name: "actions", label: "Aktionen" },
            ]}
            onAccessibilityAction={(e) => {
              if (view.readOnly) return;
              if (e.nativeEvent.actionName === "toggle") onToggle();
              else if (e.nativeEvent.actionName === "actions") onActions();
            }}
          >
            <Text numberOfLines={4} style={{ color: done ? c.muted : c.fg, fontSize: 16, lineHeight: 22, textDecorationLine: done ? "line-through" : "none" }}>
              {f.title}
            </Text>
            {meta && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 2 }}>
                  {due && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <CalendarIcon color={toneColor(c, due.tone)} size={12} />
                      <Text style={{ color: toneColor(c, due.tone), fontSize: 13 }}>{due.text}</Text>
                      {view.series && <Glyph color={toneColor(c, due.tone)} size={13}>↻</Glyph>}
                    </View>
                  )}
                  {sch && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <ClockIcon color={c.muted} size={12} />
                      <Text style={{ color: c.muted, fontSize: 13 }}>
                        {scheduledHint ? "geplant " : ""}
                        {sch.text}
                      </Text>
                      {view.series && !due && <Glyph color={c.muted} size={13}>↻</Glyph>}
                    </View>
                  )}
                  {view.series && !due && !sch && <Glyph color={c.muted} size={13}>↻</Glyph>}
                  {f.status === "in-progress" && <Text style={{ color: c.p3, fontSize: 13 }}>{T.status["in-progress"]}</Text>}
                  {warn && <Text style={{ color: c.warn, fontSize: 13 }}>⚠ {T.badges.warning}</Text>}
                </View>
                {showInbox && f.inbox && !done && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text style={{ color: c.muted, fontSize: 13 }}>{T.badges.inbox}</Text>
                    <InboxIcon color={c.muted} size={12} />
                  </View>
                )}
              </View>
            )}
          </GesturePressable>
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  );
}
