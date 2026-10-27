// Listen (4.6): Übersicht aller Listen, zuletzt geänderte zuerst. Plus-Button öffnet das Eingabeblatt für eine neue Liste.
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { listsView } from "@markdoist/core";
import { ListHeader } from "../components/list-header";
import { ListRow } from "../components/list-row";
import { PlusIcon } from "../components/icons";
import { useRepo, useRepoState } from "../repo";
import { useSnackbarInset } from "../notify";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export function ListsScreen() {
  const repo = useRepo();
  const state = useRepoState();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [pulling, setPulling] = useState(false);
  useSnackbarInset(useBottomTabBarHeight() + 20 + 56 + 12);
  const lists = useMemo(() => listsView(state.index), [state.index]);
  const unverified = state.unverified && !state.loading && !state.scanProgress;
  const subtitle =
    [lists.length ? (lists.length === 1 ? "1 Liste" : `${lists.length} Listen`) : "", unverified ? T.unverifiedShort : ""].filter(Boolean).join(" · ") || undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ListHeader title={T.views.lists} subtitle={subtitle} filter={false} />
      <FlashList
        data={lists}
        keyExtractor={(v) => v.task.ref}
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
              {T.empty.lists}
            </Text>
          )
        }
        renderItem={({ item, index }) => (
          <ListRow view={item} first={index === 0} last={index === lists.length - 1} onOpen={() => nav.navigate("Checklist", { ref: item.task.ref })} />
        )}
      />
      <Pressable
        onPress={() => nav.navigate("NewList")}
        testID="fab-new-list"
        accessibilityLabel={T.lists.newList}
        android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
        style={{ position: "absolute", right: 16, bottom: 20, width: 56, height: 56, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(0,0,0,0.28)", overflow: "hidden" }}
      >
        <PlusIcon color={c.onPrimary} size={20} weight={2.4} />
      </Pressable>
    </View>
  );
}
