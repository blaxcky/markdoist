// Geöffnete Liste (4.6): offene Einträge oben, abgehakte im einklappbaren Bereich „Abgehakt“.
// Unten eine Eingabezeile, die nach jedem Eintrag offen bleibt. Ziehen am Griff ändert die Reihenfolge.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@markdoist/app";
import { findCheckboxes, type Checkbox, type TaskAction } from "@markdoist/core";
import { Menu } from "../components/menu";
import { ChevronIcon, DotsIcon, GripIcon, PlusIcon } from "../components/icons";
import { useRepo, useRepoState } from "../repo";
import { useNotify, useSnackbarInset } from "../notify";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export function ChecklistScreen() {
  const { ref } = useRoute<RouteProp<RootStack, "Checklist">>().params;
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const view = state.index.tasks.find((v) => v.task.ref === ref && v.task.fields.isList);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(view?.task.fields.title ?? "");
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [itemMenu, setItemMenu] = useState<Checkbox | null>(null);
  /** Lage der offenen Einträge (Zeile → y, Höhe) für das Ziehen */
  const layouts = useRef(new Map<number, { y: number; h: number }>());
  useSnackbarInset(64 + insets.bottom + 12);

  const ro = view?.readOnly ?? true;
  const items = view ? findCheckboxes(view.task.body) : [];
  const open = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  // Liste gelöscht oder verschoben: zurück zur Übersicht.
  useEffect(() => {
    if (!view && !state.loading) nav.goBack();
  }, [view, state.loading, nav]);

  useLayoutEffect(() => {
    nav.setOptions({
      title: view?.task.fields.title ?? T.views.lists,
      headerRight: () => (
        <Pressable onPress={() => setMenu(true)} hitSlop={8} testID="list-menu" accessibilityLabel="Listenaktionen" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <DotsIcon color={c.fg} size={18} />
        </Pressable>
      ),
    });
  }, [nav, view?.task.fields.title, c.fg]);

  if (!view) return null;

  /** Schreibt eine Aktion; gemeldet wird nur mit Text oder bei Fehlern (Abhaken und Tippen bleiben still). */
  const act = (action: TaskAction, label?: string) =>
    repo.perform(ref, action, label ?? T.lists.editItem).then((o) => {
      if (o.status !== "ok" || label) notify(o, label);
      return o;
    });

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void act({ type: "addItem", text: t }).then((o) => o.status !== "ok" && setText((cur) => cur || t));
  };

  /** Ziehen beendet: Ziel aus der Mitte des gezogenen Eintrags bestimmen. */
  const drop = (item: Checkbox, dy: number) => {
    const from = layouts.current.get(item.line);
    if (!from) return;
    const center = from.y + from.h / 2 + dy;
    const others = open.filter((o) => o.depth === 0 && o.line !== item.line);
    const target = others.find((o) => {
      const l = layouts.current.get(o.line);
      return l && center < l.y + l.h / 2;
    });
    const idx = open.indexOf(item);
    const next = open.slice(idx + 1).find((o) => o.depth === 0);
    // Gleicher Platz wie vorher: nichts schreiben.
    if ((target && target === next) || (!target && !next)) return;
    void act({ type: "moveItem", line: item.line, before: target ? target.line : null, expect: item.text, expectBefore: target?.text });
  };

  const row = (item: Checkbox, i: number, list: Checkbox[]) => (
    <ItemRow
      key={`${item.line}:${item.text}`}
      item={item}
      first={i === 0}
      last={i === list.length - 1}
      readOnly={ro}
      draggable={!ro && !item.checked && item.depth === 0}
      editing={editing === item.line}
      onLayout={(y, h) => layouts.current.set(item.line, { y, h })}
      onToggle={() => void act({ type: "toggleCheckbox", line: item.line, expect: item.text })}
      onStartEdit={() => setEditing(item.line)}
      onMenu={() => setItemMenu(item)}
      onEndEdit={(t) => {
        setEditing(null);
        const v = t.trim();
        if (!v) void act({ type: "removeItem", line: item.line, expect: item.text }, "Eintrag gelöscht");
        else if (v !== item.text) void act({ type: "editItem", line: item.line, text: v, expect: item.text });
      }}
      onDrop={(dy) => drop(item, dy)}
    />
  );

  const itemLines = new Set(items.flatMap((ci) => Array.from({ length: ci.end - ci.line }, (_, k) => ci.line + k)));
  const otherContent = view.task.body.split("\n").some((l, k) => !itemLines.has(k) && l.trim() !== "");

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}>
        {renaming ? (
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            onBlur={() => {
              setRenaming(false);
              if (title.trim() && title.trim() !== view.task.fields.title) void act({ type: "setTitle", title }, "Umbenannt");
              else setTitle(view.task.fields.title);
            }}
            returnKeyType="done"
            style={{ marginHorizontal: 18, marginBottom: 8, color: c.fg, fontSize: 20, fontWeight: "600", borderBottomWidth: 1, borderColor: c.primary, paddingVertical: 4 }}
            testID="list-title-input"
          />
        ) : null}
        <Text style={{ color: c.muted, fontSize: 13, marginHorizontal: 18, marginBottom: 8 }} testID="list-count">
          {items.length ? `${checked.length} von ${items.length} abgehakt` : T.lists.emptyList}
        </Text>
        {view.diagnostics
          .filter((d) => d.severity !== "info")
          .map((d, k) => (
            <Text key={k} selectable style={{ marginHorizontal: 8, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: c.badge, color: d.severity === "error" ? c.danger : c.warn, fontSize: 12 }}>
              {d.message}
            </Text>
          ))}
        {open.map(row)}
        {checked.length > 0 && (
          <>
            <Pressable
              onPress={() => setCollapsed((x) => !x)}
              testID="checked-toggle"
              accessibilityRole="button"
              accessibilityState={{ expanded: !collapsed }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 10 }}
            >
              <ChevronIcon color={c.muted} size={12} dir={collapsed ? "right" : "down"} />
              <Text style={{ color: c.fg, fontWeight: "600", fontSize: 15 }}>
                {T.lists.checked} <Text style={{ color: c.muted, fontWeight: "400", fontVariant: ["tabular-nums"] }}>{checked.length}</Text>
              </Text>
            </Pressable>
            {!collapsed && checked.map(row)}
          </>
        )}
        {otherContent && <Text style={{ color: c.muted, fontSize: 12, marginHorizontal: 18, marginTop: 16 }}>{T.lists.otherContent}</Text>}
      </ScrollView>
      {!ro && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 + insets.bottom, backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.outline }}>
          <PlusIcon color={c.primary} size={16} />
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={add}
            submitBehavior="submit"
            returnKeyType="done"
            placeholder={T.lists.addItem}
            placeholderTextColor={c.muted}
            style={{ flex: 1, color: c.fg, fontSize: 16, paddingVertical: 10 }}
            testID="add-item"
          />
          {text.trim() !== "" && (
            <Pressable onPress={add} testID="add-item-send" accessibilityLabel={T.lists.addItem} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.onPrimary, fontSize: 18, fontWeight: "700" }}>↑</Text>
            </Pressable>
          )}
        </View>
      )}
      <Menu
        open={!!itemMenu}
        onClose={() => setItemMenu(null)}
        title={itemMenu?.text}
        items={[
          { label: T.lists.editItem, onPress: () => itemMenu && setEditing(itemMenu.line), disabled: ro },
          { label: T.lists.deleteItem, danger: true, disabled: ro, testID: "delete-item", onPress: () => itemMenu && void act({ type: "removeItem", line: itemMenu.line, expect: itemMenu.text }, "Eintrag gelöscht") },
        ]}
      />
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        title={view.task.fields.title}
        items={[
          { label: T.lists.rename, onPress: () => (setTitle(view.task.fields.title), setRenaming(true)), disabled: ro, testID: "rename-list" },
          { label: T.lists.removeChecked, onPress: () => void act({ type: "removeCheckedItems" }, `${T.lists.removeChecked}: ${checked.length}`), disabled: ro || !checked.length, testID: "remove-checked" },
          { label: T.lists.resetAll, onPress: () => void act({ type: "resetItems" }, T.lists.resetAll), disabled: ro || !checked.length, testID: "reset-items" },
          { label: T.lists.editMarkdown, onPress: () => nav.navigate("Detail", { ref }), testID: "edit-markdown" },
          {
            label: T.lists.deleteList,
            danger: true,
            disabled: ro,
            testID: "delete-list",
            onPress: () =>
              void repo.moveToTrash(ref).then((o) => {
                notify(o, "Liste gelöscht");
                if (o.status === "ok") nav.goBack();
              }),
          },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

function ItemRow({
  item,
  first,
  last,
  readOnly,
  draggable,
  editing,
  onLayout,
  onToggle,
  onStartEdit,
  onMenu,
  onEndEdit,
  onDrop,
}: {
  item: Checkbox;
  first: boolean;
  last: boolean;
  readOnly: boolean;
  draggable: boolean;
  editing: boolean;
  onLayout(y: number, h: number): void;
  onToggle(): void;
  onStartEdit(): void;
  onMenu(): void;
  onEndEdit(text: string): void;
  onDrop(dy: number): void;
}) {
  const c = useTheme();
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  // Ziehen am Griff: Die Zeile folgt dem Finger auf dem UI-Thread; erst beim Loslassen wird geschrieben.
  const pan = usePanGesture({
    enabled: draggable,
    minDistance: 2,
    onActivate: () => {
      "worklet";
      lifted.set(1);
    },
    onUpdate: (e) => {
      "worklet";
      dy.set(e.translationY);
    },
    onDeactivate: (e) => {
      "worklet";
      scheduleOnRN(onDrop, e.translationY);
    },
    onFinalize: () => {
      "worklet";
      dy.set(0);
      lifted.set(0);
    },
  });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.get() }],
    zIndex: lifted.get() ? 10 : 0,
    boxShadow: lifted.get() ? "0 4px 12px rgba(0,0,0,0.22)" : "0 0 0 rgba(0,0,0,0)",
  }));
  const radius = { borderTopLeftRadius: first ? 12 : 0, borderTopRightRadius: first ? 12 : 0, borderBottomLeftRadius: last ? 12 : 0, borderBottomRightRadius: last ? 12 : 0 };
  return (
    <Animated.View
      onLayout={(e) => onLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={[{ marginHorizontal: 8, marginBottom: last ? 0 : 2, flexDirection: "row", alignItems: "center", backgroundColor: c.surface, ...radius }, style]}
      testID={`item-${item.text}`}
    >
      <Pressable
        onPress={readOnly ? undefined : onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked, disabled: readOnly }}
        accessibilityLabel={item.text}
        testID={`check-${item.text}`}
        style={{ paddingLeft: 16 + item.depth * 24, paddingRight: 14, paddingVertical: 12 }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.2, borderColor: c.p4, backgroundColor: item.checked ? c.p4 : "transparent", alignItems: "center", justifyContent: "center" }}>
          {item.checked && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
        </View>
      </Pressable>
      {editing ? (
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          onBlur={() => onEndEdit(text)}
          onSubmitEditing={() => onEndEdit(text)}
          returnKeyType="done"
          style={{ flex: 1, color: c.fg, fontSize: 16, paddingVertical: 10, paddingRight: 14 }}
          testID="item-input"
        />
      ) : (
        <Pressable onPress={readOnly ? undefined : onStartEdit} onLongPress={readOnly ? undefined : onMenu} delayLongPress={500} style={{ flex: 1, paddingVertical: 12, paddingRight: draggable ? 4 : 14 }} testID={`text-${item.text}`}>
          <Text style={{ color: item.checked ? c.muted : c.fg, fontSize: 16, lineHeight: 22, textDecorationLine: item.checked ? "line-through" : "none" }}>{item.text}</Text>
        </Pressable>
      )}
      {draggable && !editing && (
        <GestureDetector gesture={pan}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 14 }} accessibilityLabel={T.lists.dragHandle} testID={`grip-${item.text}`}>
            <GripIcon color={c.muted} size={16} />
          </View>
        </GestureDetector>
      )}
    </Animated.View>
  );
}
