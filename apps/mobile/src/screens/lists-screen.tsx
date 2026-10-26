// Listen (4.6): Übersicht aller Listen, zuletzt geänderte zuerst. Plus-Button legt eine neue Liste an.
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@markdoist/app";
import { listsView } from "@markdoist/core";
import { ListHeader } from "../components/list-header";
import { ListRow } from "../components/list-row";
import { PlusIcon } from "../components/icons";
import { useRepo, useRepoState } from "../repo";
import { useNotify, useSnackbarInset } from "../notify";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export function ListsScreen() {
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [pulling, setPulling] = useState(false);
  const [creating, setCreating] = useState(false);
  useSnackbarInset(useBottomTabBarHeight() + 20 + 56 + 12);
  const lists = useMemo(() => listsView(state.index), [state.index]);
  const unverified = state.unverified && !state.loading && !state.scanProgress;
  const subtitle =
    [lists.length ? (lists.length === 1 ? "1 Liste" : `${lists.length} Listen`) : "", unverified ? T.unverifiedShort : ""].filter(Boolean).join(" · ") || undefined;

  const create = (title: string) => {
    setCreating(false);
    void repo.create({ title, kind: "list" }).then((o) => {
      if (o.status === "ok" && o.ref) nav.navigate("Checklist", { ref: o.ref });
      else notify(o);
    });
  };

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
        onPress={() => setCreating(true)}
        testID="fab-new-list"
        accessibilityLabel={T.lists.newList}
        android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
        style={{ position: "absolute", right: 16, bottom: 20, width: 56, height: 56, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(0,0,0,0.28)", overflow: "hidden" }}
      >
        <PlusIcon color={c.onPrimary} size={20} weight={2.4} />
      </Pressable>
      {creating && <NewListSheet onCancel={() => setCreating(false)} onCreate={create} />}
    </View>
  );
}

/** Blatt von unten mit dem Namen der neuen Liste, wie die Erfassung. */
function NewListSheet({ onCancel, onCreate }: { onCancel(): void; onCreate(title: string): void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const submit = () => (title.trim() ? onCreate(title.trim()) : onCancel());
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: "flex-end" }} onPress={onCancel}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingBottom: 12 + insets.bottom, paddingHorizontal: 18, gap: 12 }}>
            <Text style={{ color: c.fg, fontSize: 17, fontWeight: "600" }}>{T.lists.newList}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TextInput
                autoFocus
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={submit}
                placeholder={T.lists.titlePlaceholder}
                placeholderTextColor={c.muted}
                returnKeyType="done"
                style={{ flex: 1, color: c.fg, fontSize: 17, paddingVertical: 8 }}
                testID="new-list-title"
              />
              <Pressable
                onPress={submit}
                disabled={!title.trim()}
                testID="new-list-create"
                accessibilityLabel={T.lists.newList}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: title.trim() ? c.primary : c.surfaceHigh, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: c.onPrimary, fontSize: 20, fontWeight: "700" }}>↑</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
