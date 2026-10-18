// Suche (4.3): Titel und Inhalt, ohne Groß-/Kleinschreibung und Umlaute; Titeltreffer zuerst.
import { useMemo, useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { matchesFilter, search, sortViews, type TaskView } from "@markdoist/core";
import { useFilter } from "../filter";
import { TaskRow } from "../components/task-row";
import { ActionsSheet } from "../components/actions-sheet";
import { useRepo, useRepoState, systemClock } from "../repo";
import { useNotify } from "../notify";
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
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 12, gap: 8 }}>
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Suchen" placeholderTextColor={c.muted} testID="search-input" style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, color: c.fg, fontSize: 16, backgroundColor: c.surface }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Switch value={includeDone} onValueChange={setIncludeDone} trackColor={{ true: c.primary }} />
          <Text style={{ color: c.fg }}>inkl. erledigt</Text>
          {q.trim() ? <Text style={{ color: c.muted, marginLeft: "auto", fontVariant: ["tabular-nums"] }} testID="search-stats">{results.length} Treffer · {ms} ms</Text> : null}
        </View>
      </View>
      <FlashList
        data={results}
        keyExtractor={(v) => v.task.ref}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={q.trim() ? <Text style={{ color: c.muted, textAlign: "center", padding: 30 }}>Keine Treffer.</Text> : null}
        renderItem={({ item }) => (
          <TaskRow
            view={item}
            today={state.index.today}
            tz={tz}
            onOpen={() => nav.navigate("Detail", { ref: item.task.ref })}
            onToggle={() => {
              const done = item.task.fields.status === "done";
              void repo.perform(item.task.ref, done ? { type: "reopen" } : { type: "complete" }).then((o) => notify(o, done ? "Wiederöffnet" : "Erledigt"));
            }}
            onActions={() => setActions(item)}
          />
        )}
      />
      <ActionsSheet view={actions} today={state.index.today} onClose={() => setActions(null)} />
    </View>
  );
}
