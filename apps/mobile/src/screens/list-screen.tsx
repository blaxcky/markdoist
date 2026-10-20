// Listenansichten (4.1–4.3): Eingang, Heute, Alle, Erledigt. Ziehen nach unten liest neu ein.
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { ListHeader } from "../components/list-header";
import { PlusIcon } from "../components/icons";
import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T, toggleDoneAction } from "@markdoist/app";
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
  | { type: "task"; key: string; view: TaskView; scheduledHint?: boolean; first?: boolean; last?: boolean }
  | { type: "occurrence"; key: string; view: TaskView; text: string; first?: boolean; last?: boolean };

/** Erste und letzte Zeile je Gruppe markieren (abgerundete Kartenecken). */
function group(items: Item[]): Item[] {
  return items.map((it, i) => {
    if (it.type === "header") return it;
    const prev = items[i - 1];
    const next = items[i + 1];
    return { ...it, first: !prev || prev.type === "header" || prev.type !== it.type, last: !next || next.type === "header" || next.type !== it.type };
  });
}

const TITLES: Record<ListKind, string> = { inbox: T.views.inbox, today: T.views.today, all: T.views.all, done: T.views.done };

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

  const items: Item[] = useMemo(() => group(build()), [idx, kind, tz, filter, sort, inboxNewest]);
  const count = items.filter((i) => i.type === "task").length;

  function build(): Item[] {
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
  }

  // Bei Serien das angezeigte Vorkommen mitgeben, damit ein zweites Tippen nicht das nächste trifft (R6).
  const toggle = (v: TaskView) => {
    const { action, label } = toggleDoneAction(v);
    void repo.perform(v.task.ref, action, label).then((o) => notify(o, label));
  };

  const banner = { marginHorizontal: 8, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: c.badge } as const;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ListHeader title={TITLES[kind]} subtitle={count ? `${count} ${count === 1 ? "Aufgabe" : "Aufgaben"}` : undefined} />
      {state.unverified && !state.scanProgress && <Text style={[banner, { color: c.muted, fontSize: 12 }]}>{T.unverified}</Text>}
      {state.scanProgress && state.scanProgress.total > 0 && (
        <View style={[banner, { flexDirection: "row", alignItems: "center", gap: 12 }]} testID="scan-progress">
          <Text style={{ color: c.muted, fontSize: 12, flex: 1, fontVariant: ["tabular-nums"] }}>
            Prüfe Dateien {state.scanProgress.done}/{state.scanProgress.total}
          </Text>
          <Pressable onPress={() => repo.cancelScan()} hitSlop={8}>
            <Text style={{ color: c.primary, fontSize: 12, fontWeight: "600" }}>Abbrechen</Text>
          </Pressable>
        </View>
      )}
      {state.readError && <Text selectable style={[banner, { color: c.danger, fontSize: 12 }]}>{state.readError}{state.stale ? " – letzter bekannter Stand, schreibgeschützt" : ""}</Text>}
      <FlashList
        data={items}
        keyExtractor={(i) => i.key}
        getItemType={(i) => i.type}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={state.scanning} onRefresh={() => void repo.scan({ full: true })} colors={[c.primary]} progressBackgroundColor={c.surface} />}
        ListEmptyComponent={
          <Text style={{ color: c.muted, textAlign: "center", padding: 40 }} testID="empty">
            {T.empty[kind]}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.type === "header")
            return (
              <Text style={{ color: c.fg, fontWeight: "600", fontSize: 15, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 }} accessibilityRole="header">
                {item.title} <Text style={{ color: c.muted, fontWeight: "400", fontVariant: ["tabular-nums"] }}>{item.count}</Text>
              </Text>
            );
          if (item.type === "occurrence")
            return (
              <Pressable
                onPress={() => nav.navigate("Detail", { ref: item.view.task.ref })}
                android_ripple={{ color: c.surfaceHigh }}
                style={{ marginHorizontal: 8, marginBottom: item.last ? 0 : 2, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface, borderTopLeftRadius: item.first ? 12 : 0, borderTopRightRadius: item.first ? 12 : 0, borderBottomLeftRadius: item.last ? 12 : 0, borderBottomRightRadius: item.last ? 12 : 0 }}
              >
                <Text style={{ color: c.fg, fontSize: 16 }}>{item.view.task.fields.title}</Text>
                <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{item.text}</Text>
              </Pressable>
            );
          return (
            <TaskRow
              view={item.view}
              today={idx.today}
              tz={tz}
              scheduledHint={item.scheduledHint}
              first={item.first}
              last={item.last}
              showInbox={kind !== "inbox"}
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
        android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
        style={{ position: "absolute", right: 16, bottom: 20, width: 56, height: 56, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(0,0,0,0.28)", overflow: "hidden" }}
      >
        <PlusIcon color={c.onPrimary} size={20} weight={2.4} />
      </Pressable>
      <ActionsSheet view={actions} today={idx.today} onClose={() => setActions(null)} />
    </View>
  );
}
