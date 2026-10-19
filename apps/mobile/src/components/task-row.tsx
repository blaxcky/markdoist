// Listenzeile mit Wischgesten (4.5): nach rechts erledigt, nach links Aktionen.
// Gestaltung nach Vorlage: weiße Karte, runder Haken in Prioritätsfarbe, Datum mit Kalendersymbol in Farbstufe.
import { Pressable, Text, View } from "react-native";
import { Pressable as GesturePressable } from "react-native-gesture-handler";
import { useRef } from "react";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { T } from "@markdoist/app";
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
  onOpen(): void;
  onToggle(): void;
  onActions(): void;
}

export function TaskRow({ view, today, tz, scheduledHint, first = true, last = true, showInbox = true, onOpen, onToggle, onActions }: Props) {
  const c = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const f = view.task.fields;
  const done = f.status === "done";
  const warn = view.diagnostics.some((d) => d.severity !== "info");
  const ring = prioColor(c, f.priority);
  const due = view.due ? dateLabel(view.due, today, tz, view.overdue) : null;
  const sch = view.scheduled ? dateLabel(view.scheduled, today, tz) : null;
  const meta = !!(due || sch || view.series || warn || f.status === "in-progress" || (showInbox && f.inbox && !done));
  const radius = { borderTopLeftRadius: first ? 12 : 0, borderTopRightRadius: first ? 12 : 0, borderBottomLeftRadius: last ? 12 : 0, borderBottomRightRadius: last ? 12 : 0 };
  return (
    <View style={{ marginHorizontal: 8, marginBottom: last ? 0 : 2, overflow: "hidden", ...radius }}>
      <ReanimatedSwipeable
        ref={swipe}
        friction={2}
        leftThreshold={70}
        rightThreshold={70}
        renderLeftActions={() => (
          <View style={{ flex: 1, backgroundColor: c.primary, justifyContent: "center", paddingLeft: 20 }}>
            <Text style={{ color: c.onPrimary, fontWeight: "600" }}>{done ? T.actions.reopen : T.actions.complete}</Text>
          </View>
        )}
        renderRightActions={() => (
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
        <GesturePressable
          onPress={onOpen}
          onLongPress={onActions}
          delayLongPress={600}
          android_ripple={{ color: c.surfaceHigh }}
          style={{ flexDirection: "row", gap: 14, paddingLeft: 16, paddingRight: 14, paddingVertical: 12, backgroundColor: c.surface }}
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
          <Pressable
            onPress={view.readOnly ? undefined : onToggle}
            hitSlop={10}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={done ? T.actions.reopen : T.actions.complete}
            testID={`check-${f.title}`}
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: f.priority === "none" ? 1.2 : 2,
              borderColor: done ? c.p4 : ring,
              backgroundColor: done ? c.p4 : f.priority === "none" ? "transparent" : `${ring}1A`,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            {done && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
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
          </View>
        </GesturePressable>
      </ReanimatedSwipeable>
    </View>
  );
}
