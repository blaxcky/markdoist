// Geöffnete Programmier-Liste als Board (4.10): Reiter „Neu · In Arbeit · Erledigt“ oben, je Reiter eine
// Kartenliste; Wischen wechselt den Reiter. Darüber Filter-Chips nach Art. Der Kreis einer Karte folgt der
// Stufung aus 4.8 (Neu → In Arbeit → Erledigt), langes Drücken öffnet das Menü mit Status und Art.
// Plus öffnet das Eingabeblatt: nur Text oder Diktat; Titel und Art schlägt die KI vor.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ageDays, fillPendingTitles, notePlainText, startDevWorkAction, T, toggleDoneAction, trashDevList, trashDoneDevItems, type CompletionPhase } from "@markdoist/app";
import { DEV_DONE_LIMIT, devBoardView, devIndex, devItemsOf, type DevType, type DevTypeFilter, type TaskView } from "@markdoist/core";
import { Menu } from "../components/menu";
import { DotsIcon, PlusIcon, ViewOptionsIcon } from "../components/icons";
import { CheckCircle } from "../components/check-circle";
import { useCompletionFlow } from "../completion";
import { devItemOptionsActive, useFilter } from "../filter";
import { useRepo, useRepoState } from "../repo";
import { useNotify, useSnackbarInset } from "../notify";
import { useTheme } from "../theme";
import { DevTypeChip } from "../components/dev-type-chip";
import { DEV_ORPHANS, type RootStack } from "../navigation";
import { suggestTitleAuto } from "../dictation/title";

type Column = "open" | "work" | "done";
const COLUMNS: Column[] = ["open", "work", "done"];
const COLUMN_STATUS = { open: "open", work: "in-progress", done: "done" } as const;
const columnOf = (v: TaskView): Column => (v.task.fields.status === "done" ? "done" : v.task.fields.status === "in-progress" ? "work" : "open");

/** Filter nach Art gilt für die Sitzung, über Listen hinweg (4.10). */
let sessionFilter: DevTypeFilter = "all";

export function DevListScreen() {
  const { ref } = useRoute<RouteProp<RootStack, "DevList">>().params;
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { devItemOpts, setDevItemsOpen } = useFilter();
  const orphans = ref === DEV_ORPHANS;
  const list = orphans ? null : (devIndex(state.index).lists.find((v) => v.task.ref === ref) ?? null);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(list?.task.fields.title ?? "");
  const [itemMenu, setItemMenu] = useState<TaskView | null>(null);
  const [filter, setFilterState] = useState<DevTypeFilter>(sessionFilter);
  const setFilter = (x: DevTypeFilter) => setFilterState((sessionFilter = x));
  const [tab, setTab] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  useSnackbarInset(insets.bottom + 20 + 56 + 12);

  const ro = list?.readOnly ?? false;
  const board = useMemo(() => devBoardView(state.index, list, devItemOpts, filter), [state.index, list, devItemOpts, filter]);
  const live = useMemo(() => [...board.open, ...board.work, ...board.done], [board]);
  const refs = useMemo(() => live.map((v) => v.task.ref), [live]);
  const completion = useCompletionFlow({ repo, notify, live, refs });
  // Während des Abhakens bleibt die Karte in ihrer alten Spalte stehen (eingefrorener Stand).
  const cols: Record<Column, TaskView[]> = { open: [], work: [], done: [] };
  for (const v of completion.shown) cols[columnOf(v)].push(v);
  const all = devItemsOf(state.index, list);
  const total = all.length;
  const doneTotal = all.filter((v) => v.task.fields.status === "done").length;

  // Liste gelöscht oder verschoben: zurück zur Übersicht.
  const gone = !orphans && !list;
  useEffect(() => {
    if (gone && !state.loading) nav.goBack();
  }, [gone, state.loading, nav]);

  // Vorläufige Titel beim Öffnen der Liste nachholen (4.10).
  useEffect(() => {
    if (!state.loading) void fillPendingTitles(repo, list, suggestTitleAuto);
    // nur beim Öffnen bzw. nach dem ersten Einlesen
  }, [repo, ref, state.loading]);

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

  const showTab = (i: number) => {
    setTab(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  const toggle = (v: TaskView) => {
    // Erster Tipp: nur „In Arbeit“, die Karte wandert in den mittleren Reiter. Erst der zweite erledigt.
    const work = startDevWorkAction(v);
    if (work) return void repo.perform(v.task.ref, work.action, work.label).then((o) => notify(o, work.label));
    const { action, label } = toggleDoneAction(v);
    completion.startAction(v.task.ref, label, () => repo.perform(v.task.ref, action, label));
  };

  const move = (v: TaskView, col: Column) => {
    const label = T.dev.moveTo(T.dev.columns[col]);
    void repo.perform(v.task.ref, { type: "setStatus", status: COLUMN_STATUS[col] }, label).then((o) => notify(o, label));
  };
  const setType = (v: TaskView, devType: DevType | null) => {
    const label = `${T.dev.typeMenu}: ${devType ? T.dev.typeLabels[devType] : T.dev.noType}`;
    void repo.perform(v.task.ref, { type: "setDevType", devType }, label).then((o) => notify(o, label));
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

  const today = state.index.today.toString();
  const im = itemMenu;
  const imCol = im ? columnOf(im) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
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
          style={{ marginHorizontal: 18, marginTop: 4, marginBottom: 8, color: c.fg, fontSize: 20, fontWeight: "600", borderBottomWidth: 1, borderColor: c.primary, paddingVertical: 4 }}
          testID="dev-title-input"
        />
      ) : null}
      {/* Reiter */}
      <View style={{ flexDirection: "row", marginHorizontal: 8, marginTop: 4, borderBottomWidth: 1, borderBottomColor: c.divider }} accessibilityRole="tablist">
        {COLUMNS.map((col, i) => (
          <Pressable
            key={col}
            onPress={() => showTab(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === i }}
            testID={`dev-tab-${col}`}
            style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: tab === i ? c.primary : "transparent", marginBottom: -1 }}
          >
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
              <Text style={{ color: tab === i ? c.fg : c.muted, fontSize: 14, fontWeight: tab === i ? "600" : "500" }}>{T.dev.columns[col]}</Text>
              <Text style={{ color: c.muted, fontSize: 14, fontVariant: ["tabular-nums"] }} testID={`dev-count-${col}`}>
                {cols[col].length}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {/* Filter nach Art */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
        {(["all", "bug", "feature", "idea"] as const).map((x) => {
          const on = filter === x;
          return (
            <Pressable
              key={x}
              onPress={() => setFilter(x)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              testID={`dev-filter-${x}`}
              style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: "center", backgroundColor: on ? c.fg : c.surface, borderWidth: 1, borderColor: on ? c.fg : c.outline }}
            >
              <Text style={{ color: on ? c.bg : c.fg, fontSize: 13 }}>
                {T.dev.filters[x]} {board.counts[x]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {orphans && <Text style={{ marginHorizontal: 8, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: c.badge, color: c.muted, fontSize: 12 }}>{T.dev.orphansHint}</Text>}
      {list?.diagnostics
        .filter((d) => d.severity !== "info")
        .map((d, k) => (
          <Text key={k} selectable style={{ marginHorizontal: 8, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: c.badge, color: d.severity === "error" ? c.danger : c.warn, fontSize: 12 }}>
            {d.message}
          </Text>
        ))}
      {/* Seiten je Reiter; Wischen wechselt */}
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setTab(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flex: 1 }}
        testID="dev-pager"
      >
        {COLUMNS.map((col) => {
          const items = col === "done" && !allDone ? cols.done.slice(0, DEV_DONE_LIMIT) : cols[col];
          return (
            <ScrollView key={col} style={{ width }} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 2, paddingBottom: insets.bottom + 20 + 56 + 24, gap: 8 }} testID={`dev-col-${col}`}>
              {items.map((v) => (
                <Card key={v.task.ref} view={v} today={today} phase={completion.phase(v.task.ref)} onToggle={() => toggle(v)} onOpen={() => nav.navigate("Detail", { ref: v.task.ref })} onMenu={() => setItemMenu(v)} />
              ))}
              {!items.length && (
                <Text style={{ color: c.muted, fontSize: 14, textAlign: "center", marginTop: 32 }} testID={`dev-empty-${col}`}>
                  {total ? "Keine Einträge." : T.dev.emptyList}
                </Text>
              )}
              {col === "done" && cols.done.length > DEV_DONE_LIMIT && (
                <Pressable onPress={() => setAllDone((a) => !a)} testID="dev-all-done" style={{ alignSelf: "center", paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ color: c.primary, fontSize: 14, fontWeight: "500" }}>{allDone ? T.dev.fewerDone : T.dev.allDone(cols.done.length)}</Text>
                </Pressable>
              )}
            </ScrollView>
          );
        })}
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
        open={!!im}
        onClose={() => setItemMenu(null)}
        title={im?.task.fields.title}
        items={[
          { label: "Öffnen", onPress: () => im && nav.navigate("Detail", { ref: im.task.ref }) },
          ...COLUMNS.map((col) => ({
            label: `${T.fields.status}: ${T.dev.columns[col]}`,
            checked: imCol === col,
            disabled: !!im?.readOnly || imCol === col,
            testID: `dev-move-${col}`,
            onPress: () => im && move(im, col),
          })),
          ...(["bug", "feature", "idea", null] as const).map((t) => ({
            label: `${T.dev.typeMenu}: ${t ? T.dev.typeLabels[t] : T.dev.noType}`,
            checked: !!im && im.task.fields.devType === t,
            disabled: !!im?.readOnly || (!!im && im.task.fields.devType === t),
            testID: `dev-set-type-${t ?? "none"}`,
            onPress: () => im && setType(im, t),
          })),
          {
            label: T.lists.deleteItem,
            danger: true,
            disabled: im?.readOnly,
            testID: "delete-dev-item",
            onPress: () => im && void repo.moveToTrash(im.task.ref).then((o) => notify(o, "Eintrag gelöscht")),
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
            onPress: () => void trashDoneDevItems(repo, state.index, list).then((o) => notify(o, `${T.dev.removeDone}: ${doneTotal}`)),
            disabled: !doneTotal,
            testID: "dev-remove-done",
          },
          list && { label: T.dev.deleteList, danger: true, disabled: ro, testID: "delete-dev-list", onPress: confirmDelete },
        ]}
      />
    </View>
  );
}

function Card({ view, today, phase, onToggle, onOpen, onMenu }: { view: TaskView; today: string; phase?: CompletionPhase; onToggle(): void; onOpen(): void; onMenu(): void }) {
  const c = useTheme();
  const f = view.task.fields;
  const isDone = f.status === "done";
  // Während des Ablaufs zeigt der Haken den Zielzustand.
  const checked = isDone !== (phase !== undefined);
  const half = f.status === "in-progress" && phase === undefined;
  const days = ageDays(f.dateCreated, today);
  // Ein vorläufiger Titel ist der Anfang der Notiz: Der Auszug wiederholte ihn nur.
  const plain = notePlainText(view.task.body);
  const excerpt = plain === f.title ? "" : plain;
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 12, opacity: isDone ? 0.75 : 1 }} testID={`dev-item-${f.title}`}>
      <Pressable onPress={onOpen} onLongPress={onMenu} delayLongPress={500} android_ripple={{ color: c.surfaceHigh }} style={{ paddingTop: 10, paddingBottom: 12, paddingRight: 14 }} testID={`text-${f.title}`}>
        {(f.devType || days !== null) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 14, marginBottom: 6 }}>
            {f.devType && <DevTypeChip type={f.devType} />}
            <View style={{ flex: 1 }} />
            {days !== null && <Text style={{ color: c.muted, fontSize: 12 }}>{T.dev.age(days)}</Text>}
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Pressable
            onPress={view.readOnly ? undefined : onToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: half ? "mixed" : checked, disabled: view.readOnly }}
            accessibilityLabel={f.title}
            testID={`check-${f.title}`}
            hitSlop={8}
            style={{ paddingLeft: 14, paddingRight: 12, paddingTop: 1 }}
          >
            <CheckCircle checked={checked} half={half} phase={phase} id={view.task.ref} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: isDone || f.titlePending ? c.muted : c.fg, fontSize: 16, lineHeight: 22, fontWeight: f.titlePending ? "400" : "600", textDecorationLine: isDone ? "line-through" : "none" }}>{f.title}</Text>
            {f.titlePending && (
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }} testID={`pending-${f.title}`}>
                {T.dev.titlePending}
              </Text>
            )}
            {!!excerpt && (
              <Text numberOfLines={2} style={{ color: c.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }} testID={`note-${f.title}`}>
                {excerpt}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </View>
  );
}
