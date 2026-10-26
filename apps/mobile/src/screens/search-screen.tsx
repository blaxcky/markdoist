// Suche (4.3): Titel und Inhalt, ohne Groß-/Kleinschreibung und Umlaute; Titeltreffer zuerst.
import { useMemo, useRef, useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { matchesFilter, search, sortViews, type TaskView } from "@markdoist/core";
import { useFilter } from "../filter";
import { TaskRow } from "../components/task-row";
import { ListRow } from "../components/list-row";
import { ActionsSheet } from "../components/actions-sheet";
import { useRepo, useRepoState, systemClock } from "../repo";
import { useNotify } from "../notify";
import { CollapseCell, CollapseProvider, useCompletionFlow } from "../completion";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export function SearchScreen() {
  const state = useRepoState();
  const repo = useRepo();
  const notify = useNotify();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [q, setQ] = useState("");
  const [includeDone, setIncludeDone] = useState(false);
  const [actions, setActions] = useState<TaskView | null>(null);
  const { filter, sort } = useFilter();
  const tz = systemClock().timeZone;
  // Filter und Sortierung gelten auch für Suchergebnisse (4.3), wie auf dem Desktop.
  const { results, ms } = useMemo(() => {
    const t0 = Date.now();
    const r = sortViews(search(state.index, q, { includeDone }).filter((v) => matchesFilter(v, filter, state.index.today)), sort, tz);
    return { results: r, ms: Date.now() - t0 };
  }, [state.index, q, includeDone, filter, sort, tz]);
  const listRef = useRef<FlashListRef<TaskView>>(null);
  const completion = useCompletionFlow({ repo, notify, live: results, refs: results.map((v) => v.task.ref), list: listRef });
  const shown = completion.shown;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingHorizontal: 8, paddingVertical: 12, gap: 8 }}>
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Suchen" placeholderTextColor={c.muted} testID="search-input" cursorColor={c.primary} style={{ borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, color: c.fg, fontSize: 16, backgroundColor: c.surface }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Switch value={includeDone} onValueChange={setIncludeDone} trackColor={{ true: c.primary }} />
          <Text style={{ color: c.fg }}>inkl. erledigt</Text>
          {q.trim() ? <Text style={{ color: c.muted, marginLeft: "auto", fontVariant: ["tabular-nums"] }} testID="search-stats">{results.length} Treffer · {ms} ms</Text> : null}
        </View>
      </View>
      <CollapseProvider value={completion.collapsing}>
        <FlashList
          ref={listRef}
          CellRendererComponent={CollapseCell}
          data={shown}
          keyExtractor={(v) => v.task.ref}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={q.trim() ? <Text style={{ color: c.muted, textAlign: "center", padding: 30 }}>Keine Treffer.</Text> : null}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) =>
            item.task.fields.isList ? (
              <ListRow view={item} first={index === 0} last={index === shown.length - 1} onOpen={() => nav.navigate("Checklist", { ref: item.task.ref })} />
            ) : (
            <TaskRow
              view={item}
              first={index === 0}
              last={index === shown.length - 1}
              today={state.index.today}
              tz={tz}
              onOpen={() => nav.navigate("Detail", { ref: item.task.ref })}
              phase={completion.phase(item.task.ref)}
              onLeft={() => completion.left(item.task.ref)}
              onToggle={() => completion.start(item)}
              onActions={() => setActions(item)}
            />
            )
          }
        />
      </CollapseProvider>
      <ActionsSheet view={actions} today={state.index.today} onClose={() => setActions(null)} />
    </View>
  );
}
