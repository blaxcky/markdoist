// Listenansichten (4.1–4.3): Eingang, Heute, Alle, Erledigt. Ziehen nach unten liest neu ein.
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { allOpenView, describeOccurrence, doneView, inboxView, matchesFilter, sortViews, todayView, type TaskView } from "@markdoist/core";
import { useFilter } from "../filter";
import { TaskRow } from "../components/task-row";
import { ActionsSheet } from "../components/actions-sheet";
import { useRepo, useRepoState, systemClock } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export type ListKind = "inbox" | "today" | "all" | "done";

type Item =
  | { type: "header"; key: string; title: string; count: number }
  | { type: "task"; key: string; view: TaskView; scheduledHint?: boolean }
  | { type: "occurrence"; key: string; view: TaskView; text: string };

export function ListScreen({ kind }: { kind: ListKind }) {
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [actions, setActions] = useState<TaskView | null>(null);
  const { filter, sort, inboxNewest } = useFilter();
  const idx = state.index;
  const tz = systemClock().timeZone;

  const items: Item[] = useMemo(() => {
    const tasks = (list: TaskView[], hint = false): Item[] =>
      sortViews(list.filter((v) => matchesFilter(v, filter, idx.today)), sort, tz).map((v) => ({
        type: "task",
        key: v.task.ref,
        view: v,
        scheduledHint: hint && !!v.scheduled,
      }));
    switch (kind) {
      case "inbox":
        return tasks(inboxView(idx, tz, inboxNewest));
      case "today": {
        const t = todayView(idx, tz);
        const out: Item[] = [];
        const sec = (title: string, list: TaskView[], hint = false) => {
          const items = tasks(list, hint);
          if (!items.length) return;
          out.push({ type: "header", key: `h-${title}`, title, count: items.length }, ...items);
        };
        sec(T.today.due, t.due, true);
        sec(T.today.plannedToday, t.plannedToday);
        sec(T.today.plannedEarlier, t.plannedEarlier);
        return out;
      }
      case "all":
        return tasks(allOpenView(idx, tz));
      case "done": {
        const d = doneView(idx);
        const out: Item[] = tasks(d.tasks);
        if (d.occurrences.length) {
          out.push({ type: "header", key: "h-occ", title: "Erledigte Vorkommen (letzte 30 Tage)", count: d.occurrences.length });
          d.occurrences.forEach((o, i) =>
            out.push({ type: "occurrence", key: `o-${i}`, view: o.view, text: `Vorkommen ${describeOccurrence(o.date)} – erledigt` }),
          );
        }
        return out;
      }
    }
  }, [idx, kind, tz, filter, sort]);

  const toggle = (v: TaskView) => {
    const done = v.task.fields.status === "done";
    void repo.perform(v.task.ref, done ? { type: "reopen" } : { type: "complete" }, done ? "Wiederöffnet" : "Erledigt").then((o) =>
      notify(o, done ? "Wiederöffnet" : "Erledigt"),
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {state.unverified && !state.scanProgress && <Text style={{ padding: 8, backgroundColor: c.badge, color: c.muted, fontSize: 12 }}>{T.unverified}</Text>}
      {state.scanProgress && state.scanProgress.total > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", padding: 8, backgroundColor: c.badge, gap: 12 }} testID="scan-progress">
          <Text style={{ color: c.muted, fontSize: 12, flex: 1, fontVariant: ["tabular-nums"] }}>
            Prüfe Dateien {state.scanProgress.done}/{state.scanProgress.total}
          </Text>
          <Pressable onPress={() => repo.cancelScan()} hitSlop={8}>
            <Text style={{ color: c.primary, fontSize: 12 }}>Abbrechen</Text>
          </Pressable>
        </View>
      )}
      {state.readError && <Text selectable style={{ padding: 8, backgroundColor: c.badge, color: c.danger, fontSize: 12 }}>{state.readError}{state.stale ? " – letzter bekannter Stand, schreibgeschützt" : ""}</Text>}
      <FlashList
        data={items}
        keyExtractor={(i) => i.key}
        getItemType={(i) => i.type}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={state.scanning} onRefresh={() => void repo.scan({ full: true })} />}
        ListEmptyComponent={
          <Text style={{ color: c.muted, textAlign: "center", padding: 40 }} testID="empty">
            {T.empty[kind]}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.type === "header")
            return (
              <Text style={{ color: c.muted, fontWeight: "600", fontSize: 13, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 }}>
                {item.title.toUpperCase()} <Text style={{ fontWeight: "400", fontVariant: ["tabular-nums"] }}>{item.count}</Text>
              </Text>
            );
          if (item.type === "occurrence")
            return (
              <Pressable onPress={() => nav.navigate("Detail", { ref: item.view.task.ref })} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ color: c.fg }}>{item.view.task.fields.title}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>{item.text}</Text>
              </Pressable>
            );
          return (
            <TaskRow
              view={item.view}
              today={idx.today}
              tz={tz}
              scheduledHint={item.scheduledHint}
              onOpen={() => nav.navigate("Detail", { ref: item.view.task.ref })}
              onToggle={() => toggle(item.view)}
              onActions={() => setActions(item.view)}
            />
          );
        }}
      />
      <Pressable
        onPress={() => nav.navigate("Capture")}
        testID="fab-capture"
        accessibilityLabel={T.actions.capture}
        style={{ position: "absolute", right: 20, bottom: 24, width: 58, height: 58, borderRadius: 16, backgroundColor: c.primaryContainer, alignItems: "center", justifyContent: "center", boxShadow: "0 3px 8px rgba(0,0,0,0.25)" }}
      >
        <Text style={{ fontSize: 30, color: c.fg, marginTop: -2 }}>+</Text>
      </Pressable>
      <ActionsSheet view={actions} today={idx.today} onClose={() => setActions(null)} />
    </View>
  );
}
