// Geöffnete Programmier-Liste (4.8): offene Einträge oben, erledigte im einklappbaren Bereich „Erledigt“.
// Jeder Eintrag ist eine eigene Datei; Antippen öffnet ihn mit Notiz im Detail, der Kreis erledigt ihn
// wie einen Listeneintrag (Haken, Haltezeit, dann gleitet er nach „Erledigt“). Plus öffnet das Eingabeblatt.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COMPLETE_COLLAPSE_MS, T, toggleDoneAction, trashDevList, trashDoneDevItems, type CompletionPhase } from "@markdoist/app";
import { devIndex, devItemsView, type TaskView } from "@markdoist/core";
import { Menu } from "../components/menu";
import { ChevronIcon, DotsIcon, LinesIcon, PlusIcon, ViewOptionsIcon } from "../components/icons";
import { CheckCircle } from "../components/check-circle";
import { COLLAPSE, useCompletionFlow } from "../completion";
import { devItemOptionsActive, useFilter } from "../filter";
import { useRepo, useRepoState } from "../repo";
import { useNotify, useSnackbarInset } from "../notify";
import { useTheme } from "../theme";
import { DEV_ORPHANS, type RootStack } from "../navigation";

type Row = { type: "item"; key: string; view: TaskView; first: boolean; last: boolean } | { type: "header"; key: string; count: number };

/** Offene Einträge, Kopf „Erledigt“, erledigte Einträge – ein Array, damit eine Zeile den Gruppenwechsel überlebt. */
function rows(open: TaskView[], done: TaskView[], collapsed: boolean): Row[] {
  const group = (list: TaskView[]): Row[] => list.map((view, i) => ({ type: "item", key: view.task.ref, view, first: i === 0, last: i === list.length - 1 }));
  if (!done.length) return group(open);
  return [...group(open), { type: "header", key: "h-done", count: done.length }, ...(collapsed ? [] : group(done))];
}

const FADE_IN = FadeIn.duration(COMPLETE_COLLAPSE_MS);
const FADE_OUT = FadeOut.duration(COMPLETE_COLLAPSE_MS);

export function DevListScreen() {
  const { ref } = useRoute<RouteProp<RootStack, "DevList">>().params;
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { devItemOpts, setDevItemsOpen } = useFilter();
  const orphans = ref === DEV_ORPHANS;
  const list = orphans ? null : (devIndex(state.index).lists.find((v) => v.task.ref === ref) ?? null);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(list?.task.fields.title ?? "");
  const [collapsed, setCollapsed] = useState(false);
  const [itemMenu, setItemMenu] = useState<TaskView | null>(null);
  useSnackbarInset(insets.bottom + 20 + 56 + 12);

  const ro = list?.readOnly ?? false;
  const items = useMemo(() => devItemsView(state.index, list, devItemOpts), [state.index, list, devItemOpts]);
  const live = useMemo(() => rows(items.open, items.done, collapsed), [items, collapsed]);
  const refs = useMemo(() => [...items.open, ...items.done].map((v) => v.task.ref), [items]);
  const completion = useCompletionFlow({ repo, notify, live, refs });
  const total = items.open.length + items.done.length;

  // Liste gelöscht oder verschoben: zurück zur Übersicht.
  const gone = !orphans && !list;
  useEffect(() => {
    if (gone && !state.loading) nav.goBack();
  }, [gone, state.loading, nav]);

  useLayoutEffect(() => {
    nav.setOptions({
      title: list?.task.fields.title ?? T.dev.orphans,
      headerRight: () => (
        <View style={{ flexDirection: "row" }}>
          <Pressable onPress={() => setDevItemsOpen(true)} hitSlop={8} testID="dev-item-options" accessibilityLabel="Anzeige" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <ViewOptionsIcon color={c.fg} size={20} dot={devItemOptionsActive(devItemOpts) ? c.primary : undefined} />
          </Pressable>
          <Pressable onPress={() => setMenu(true)} hitSlop={8} testID="dev-menu" accessibilityLabel="Listenaktionen" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <DotsIcon color={c.fg} size={18} />
          </Pressable>
        </View>
      ),
    });
  }, [nav, list?.task.fields.title, c.fg, c.primary, devItemOpts, setDevItemsOpen]);

  if (gone) return null;

  const toggle = (v: TaskView) => {
    const { action, label } = toggleDoneAction(v);
    completion.startAction(v.task.ref, label, () => repo.perform(v.task.ref, action, label));
  };

  const confirmDelete = () => {
    if (!list) return;
    Alert.alert(T.dev.deleteList, `${T.dev.deleteConfirm(list.task.fields.title, total)} Einzelne Dateien lassen sich dort wiederherstellen.`, [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "In den Papierkorb",
        style: "destructive",
        // Zurück zur Übersicht führt der Effekt oben, sobald die Liste aus dem Index fehlt.
        onPress: () => void trashDevList(repo, state.index, list).then((o) => notify(o, "Liste gelöscht")),
      },
    ]);
  };

  const collapsing = completion.collapsing;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 20 + 56 + 24 }}>
        {renaming && list ? (
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            onBlur={() => {
              setRenaming(false);
              if (title.trim() && title.trim() !== list.task.fields.title)
                void repo.perform(list.task.ref, { type: "setTitle", title }, "Umbenannt").then((o) => notify(o, "Umbenannt"));
              else setTitle(list.task.fields.title);
            }}
            returnKeyType="done"
            style={{ marginHorizontal: 18, marginBottom: 8, color: c.fg, fontSize: 20, fontWeight: "600", borderBottomWidth: 1, borderColor: c.primary, paddingVertical: 4 }}
            testID="dev-title-input"
          />
        ) : null}
        <Text style={{ color: c.muted, fontSize: 13, marginHorizontal: 18, marginBottom: 8 }} testID="dev-count">
          {total ? `${items.done.length} von ${total} erledigt` : T.dev.emptyList}
        </Text>
        {orphans && <Text style={{ marginHorizontal: 8, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: c.badge, color: c.muted, fontSize: 12 }}>{T.dev.orphansHint}</Text>}
        {list?.diagnostics
          .filter((d) => d.severity !== "info")
          .map((d, k) => (
            <Text key={k} selectable style={{ marginHorizontal: 8, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: c.badge, color: d.severity === "error" ? c.danger : c.warn, fontSize: 12 }}>
              {d.message}
            </Text>
          ))}
        {completion.shown.map((r) =>
          r.type === "item" ? (
            <ItemRow
              key={r.key}
              view={r.view}
              first={r.first}
              last={r.last}
              phase={completion.phase(r.key)}
              collapsing={collapsing}
              onToggle={() => toggle(r.view)}
              onOpen={() => nav.navigate("Detail", { ref: r.view.task.ref })}
              onMenu={() => setItemMenu(r.view)}
            />
          ) : (
            <Animated.View key={r.key} layout={collapsing ? COLLAPSE : undefined} entering={collapsing ? FADE_IN : undefined} exiting={collapsing ? FADE_OUT : undefined}>
              <Pressable
                onPress={() => setCollapsed((x) => !x)}
                testID="dev-done-toggle"
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 10 }}
              >
                <ChevronIcon color={c.muted} size={12} dir={collapsed ? "right" : "down"} />
                <Text style={{ color: c.fg, fontWeight: "600", fontSize: 15 }}>
                  {T.dev.done} <Text style={{ color: c.muted, fontWeight: "400", fontVariant: ["tabular-nums"] }}>{r.count}</Text>
                </Text>
              </Pressable>
            </Animated.View>
          ),
        )}
      </ScrollView>
      {list && !ro && (
        <Pressable
          onPress={() => nav.navigate("AddItem", { ref, dev: true })}
          testID="fab-add-dev-item"
          accessibilityLabel={T.dev.addItem}
          android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
          style={{ position: "absolute", right: 16, bottom: insets.bottom + 20, width: 56, height: 56, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(0,0,0,0.28)", overflow: "hidden" }}
        >
          <PlusIcon color={c.onPrimary} size={20} weight={2.4} />
        </Pressable>
      )}
      <Menu
        open={!!itemMenu}
        onClose={() => setItemMenu(null)}
        title={itemMenu?.task.fields.title}
        items={[
          { label: "Öffnen", onPress: () => itemMenu && nav.navigate("Detail", { ref: itemMenu.task.ref }) },
          {
            label: T.lists.deleteItem,
            danger: true,
            disabled: itemMenu?.readOnly,
            testID: "delete-dev-item",
            onPress: () => itemMenu && void repo.moveToTrash(itemMenu.task.ref).then((o) => notify(o, "Eintrag gelöscht")),
          },
        ]}
      />
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        title={list?.task.fields.title ?? T.dev.orphans}
        items={[
          list && { label: T.dev.rename, onPress: () => (setTitle(list.task.fields.title), setRenaming(true)), disabled: ro, testID: "rename-dev-list" },
          {
            label: T.dev.removeDone,
            onPress: () => void trashDoneDevItems(repo, state.index, list).then((o) => notify(o, `${T.dev.removeDone}: ${items.done.length}`)),
            disabled: !items.done.length,
            testID: "dev-remove-done",
          },
          list && { label: T.dev.deleteList, danger: true, disabled: ro, testID: "delete-dev-list", onPress: confirmDelete },
        ]}
      />
    </View>
  );
}

function ItemRow({
  view,
  first,
  last,
  phase,
  collapsing,
  onToggle,
  onOpen,
  onMenu,
}: {
  view: TaskView;
  first: boolean;
  last: boolean;
  phase?: CompletionPhase;
  /** Nach dem Erledigen: Zeile gleitet an ihre neue Stelle bzw. blendet im eingeklappten Bereich aus. */
  collapsing: boolean;
  onToggle(): void;
  onOpen(): void;
  onMenu(): void;
}) {
  const c = useTheme();
  const f = view.task.fields;
  const isDone = f.status === "done";
  // Während des Ablaufs zeigt der Haken den Zielzustand.
  const checked = isDone !== (phase !== undefined);
  const hasNote = view.task.body.trim() !== "";
  const radius = { borderTopLeftRadius: first ? 12 : 0, borderTopRightRadius: first ? 12 : 0, borderBottomLeftRadius: last ? 12 : 0, borderBottomRightRadius: last ? 12 : 0 };
  return (
    <Animated.View
      layout={collapsing ? COLLAPSE : undefined}
      exiting={collapsing ? FADE_OUT : undefined}
      style={{ marginHorizontal: 8, marginBottom: last ? 0 : 2, flexDirection: "row", alignItems: "center", backgroundColor: c.surface, ...radius }}
      testID={`dev-item-${f.title}`}
    >
      <Pressable
        onPress={view.readOnly ? undefined : onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: view.readOnly }}
        accessibilityLabel={f.title}
        testID={`check-${f.title}`}
        style={{ paddingLeft: 16, paddingRight: 14, paddingVertical: 12 }}
      >
        <CheckCircle checked={checked} phase={phase} id={view.task.ref} />
      </Pressable>
      <Pressable onPress={onOpen} onLongPress={onMenu} delayLongPress={500} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingRight: 16 }} testID={`text-${f.title}`}>
        <Text style={{ flex: 1, color: isDone ? c.muted : c.fg, fontSize: 16, lineHeight: 22, textDecorationLine: isDone ? "line-through" : "none" }}>{f.title}</Text>
        {hasNote && (
          <View accessibilityLabel={T.dev.hasNote} testID={`note-${f.title}`}>
            <LinesIcon color={c.muted} size={13} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
