// Programmieren (4.8): Übersicht der Programmier-Listen, sortier- und filterbar wie Listen (4.6).
// Darunter die Gruppe „Ohne Liste“, wenn es Einträge ohne vorhandene Liste gibt. Plus legt eine Liste an.
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { devListProgress, devListsView, type TaskView } from "@markdoist/core";
import { ListHeader } from "../components/list-header";
import { listOptionsActive, useFilter } from "../filter";
import { DevListRow } from "../components/dev-list-row";
import { PlusIcon } from "../components/icons";
import { useRepo, useRepoState } from "../repo";
import { useSnackbarInset } from "../notify";
import { useTheme } from "../theme";
import { DEV_ORPHANS, type RootStack } from "../navigation";

export function DevListsScreen() {
  const repo = useRepo();
  const state = useRepoState();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [pulling, setPulling] = useState(false);
  useSnackbarInset(useBottomTabBarHeight() + 20 + 56 + 12);
  const { devOpts, setDevOpen } = useFilter();
  const lists = useMemo(() => devListsView(state.index, devOpts), [state.index, devOpts]);
  const orphans = devListProgress(state.index, null).total > 0;
  // `null` steht für die Gruppe „Ohne Liste“ am Ende.
  const rows: (TaskView | null)[] = orphans ? [...lists, null] : lists;
  const unverified = state.unverified && !state.loading && !state.scanProgress;
  const subtitle =
    [lists.length ? (lists.length === 1 ? "1 Liste" : `${lists.length} Listen`) : "", unverified ? T.unverifiedShort : ""].filter(Boolean).join(" · ") || undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ListHeader title={T.views.dev} subtitle={subtitle} onOptions={() => setDevOpen(true)} optionsActive={listOptionsActive(devOpts)} />
      <FlashList
        data={rows}
        keyExtractor={(v) => v?.task.ref ?? DEV_ORPHANS}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => {
              setPulling(true);
              void repo.scan({ full: true }).finally(() => setPulling(false));
            }}
            colors={[c.primary]}
            progressBackgroundColor={c.surface}
          />
        }
        ListEmptyComponent={
          state.loading ? null : (
            <Text style={{ color: c.muted, textAlign: "center", padding: 40 }} testID="empty">
              {devOpts.filter === "open" ? T.empty.listsOpen : devOpts.filter === "none-open" ? T.empty.listsNoneOpen : T.empty.dev}
            </Text>
          )
        }
        renderItem={({ item, index }) => (
          <DevListRow
            idx={state.index}
            view={item}
            first={index === 0}
            last={index === rows.length - 1}
            onOpen={() => nav.navigate("DevList", { ref: item?.task.ref ?? DEV_ORPHANS })}
          />
        )}
      />
      <Pressable
        onPress={() => nav.navigate("NewList", { dev: true })}
        testID="fab-new-dev-list"
        accessibilityLabel={T.dev.newList}
        android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
        style={{ position: "absolute", right: 16, bottom: 20, width: 56, height: 56, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(0,0,0,0.28)", overflow: "hidden" }}
      >
        <PlusIcon color={c.onPrimary} size={20} weight={2.4} />
      </Pressable>
    </View>
  );
}
