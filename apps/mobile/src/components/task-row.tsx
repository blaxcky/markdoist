// Listenzeile mit Wischgesten (4.5): nach rechts erledigt, nach links Aktionen.
import { Pressable, Text, View } from "react-native";
import { Pressable as GesturePressable } from "react-native-gesture-handler";
import { useRef } from "react";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { T } from "@markdoist/app";
import type { Temporal, TaskView } from "@markdoist/core";
import { shortDate } from "../format";
import { useTheme } from "../theme";

interface Props {
  view: TaskView;
  today: Temporal.PlainDate;
  tz: string;
  scheduledHint?: boolean;
  onOpen(): void;
  onToggle(): void;
  onActions(): void;
}

const PRIO = { high: "!!!", normal: "!!", low: "!", none: "" } as const;

export function TaskRow({ view, today, tz, scheduledHint, onOpen, onToggle, onActions }: Props) {
  const c = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const f = view.task.fields;
  const done = f.status === "done";
  const warn = view.diagnostics.some((d) => d.severity !== "info");
  const badge = (text: string, color?: string) => (
    <Text style={{ backgroundColor: c.badge, color: color ?? c.muted, borderRadius: 4, paddingHorizontal: 5, fontSize: 12 }}>{text}</Text>
  );
  return (
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
        style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.outline }}
        testID={`row-${f.title}`}
        accessibilityLabel={f.title}
      >
        <Pressable
          onPress={view.readOnly ? undefined : onToggle}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? T.actions.reopen : T.actions.complete}
          testID={`check-${f.title}`}
          style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: done ? c.primary : c.muted, backgroundColor: done ? c.primary : "transparent", alignItems: "center", justifyContent: "center", marginTop: 1 }}
        >
          {done && <Text style={{ color: c.onPrimary, fontSize: 13, fontWeight: "700" }}>✓</Text>}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={2} style={{ color: done ? c.muted : c.fg, fontSize: 16, textDecorationLine: done ? "line-through" : "none" }}>
            {PRIO[f.priority] ? <Text style={{ color: f.priority === "high" ? c.danger : c.warn }}>{PRIO[f.priority]} </Text> : null}
            {f.title}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {f.inbox && !done && badge(T.badges.inbox)}
            {view.overdue && badge(T.badges.overdue, c.danger)}
            {view.due && <Text style={{ color: view.overdue ? c.danger : c.muted, fontSize: 13 }}>⚑ {shortDate(view.due, today, tz)}</Text>}
            {view.scheduled && (
              <Text style={{ color: c.muted, fontSize: 13 }}>
                {scheduledHint ? "geplant " : "◷ "}
                {shortDate(view.scheduled, today, tz)}
              </Text>
            )}
            {view.series && badge("↻ Serie")}
            {warn && badge("⚠", c.warn)}
          </View>
        </View>
      </GesturePressable>
    </ReanimatedSwipeable>
  );
}
