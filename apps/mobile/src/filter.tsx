// Filter und Sortierung (4.3), gemeinsam für alle Aufgabenansichten; serialisierbares Filtermodell aus dem Kern.
// Dazu Sortierung und Filter der Listenübersicht (4.6) und von Programmieren (4.8) mit eigenen Blättern.
import { createContext, use, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import {
  DEFAULT_DEV_ITEM_OPTIONS,
  DEFAULT_LIST_OPTIONS,
  DEV_ITEM_DEFAULT_DESC,
  DEV_ITEM_SORT_LABELS,
  LIST_DEFAULT_DESC,
  LIST_FILTER_LABELS,
  LIST_SORT_LABELS,
  SORT_LABELS,
  type DevItemOptions,
  type DevItemSort,
  type Filter,
  type ListFilter,
  type ListOptions,
  type ListSort,
  type SortChoice,
  type Temporal,
} from "@markdoist/core";
import { pickDate } from "./components/actions-sheet";
import { useTheme } from "./theme";

interface FilterState {
  filter: Filter;
  setFilter(f: Filter): void;
  sort: SortChoice;
  setSort(s: SortChoice): void;
  open: boolean;
  setOpen(o: boolean): void;
  /** Eingang: neueste zuerst (Standard) oder älteste zuerst (4.1) */
  inboxNewest: boolean;
  setInboxNewest(v: boolean): void;
  /** Listenübersicht (4.6): Sortierung und Filter, eigenes Blatt */
  listOpts: ListOptions;
  setListOpts(o: ListOptions): void;
  listsOpen: boolean;
  setListsOpen(o: boolean): void;
  /** Programmieren (4.8): Übersicht wie Listen, Einträge einer Liste nach eigener Sortierung */
  devOpts: ListOptions;
  setDevOpts(o: ListOptions): void;
  devOpen: boolean;
  setDevOpen(o: boolean): void;
  devItemOpts: DevItemOptions;
  setDevItemOpts(o: DevItemOptions): void;
  devItemsOpen: boolean;
  setDevItemsOpen(o: boolean): void;
}

const Ctx = createContext<FilterState | null>(null);
export function useFilter(): FilterState {
  const v = use(Ctx);
  if (!v) throw new Error("FilterProvider fehlt");
  return v;
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<Filter>({});
  const [sort, setSort] = useState<SortChoice>("default");
  const [open, setOpen] = useState(false);
  const [inboxNewest, setInboxNewest] = useState(true);
  const [listOpts, setListOpts] = useState<ListOptions>(DEFAULT_LIST_OPTIONS);
  const [listsOpen, setListsOpen] = useState(false);
  const [devOpts, setDevOpts] = useState<ListOptions>(DEFAULT_LIST_OPTIONS);
  const [devOpen, setDevOpen] = useState(false);
  const [devItemOpts, setDevItemOpts] = useState<DevItemOptions>(DEFAULT_DEV_ITEM_OPTIONS);
  const [devItemsOpen, setDevItemsOpen] = useState(false);
  return (
    <Ctx
      value={{
        filter,
        setFilter,
        sort,
        setSort,
        open,
        setOpen,
        inboxNewest,
        setInboxNewest,
        listOpts,
        setListOpts,
        listsOpen,
        setListsOpen,
        devOpts,
        setDevOpts,
        devOpen,
        setDevOpen,
        devItemOpts,
        setDevItemOpts,
        devItemsOpen,
        setDevItemsOpen,
      }}
    >
      {children}
    </Ctx>
  );
}

export function filterActive(f: Filter, s: SortChoice, inboxNewest = true): boolean {
  return Object.keys(f).length > 0 || s !== "default" || !inboxNewest;
}

export function listOptionsActive(o: ListOptions): boolean {
  return o.sort !== DEFAULT_LIST_OPTIONS.sort || o.desc !== LIST_DEFAULT_DESC[o.sort] || o.filter !== DEFAULT_LIST_OPTIONS.filter;
}

export function devItemOptionsActive(o: DevItemOptions): boolean {
  return o.sort !== DEFAULT_DEV_ITEM_OPTIONS.sort || o.desc !== DEV_ITEM_DEFAULT_DESC[o.sort];
}

type Opt<V> = [V, string];

/** Zeile mit Auswahlchips (Einfachauswahl) */
function ChipRow<V>({ label, value, opts, onChange, testID }: { label: string; value: V; opts: Opt<V>[]; onChange(v: V): void; testID: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {opts.map(([v, l]) => {
          const active = JSON.stringify(v) === JSON.stringify(value);
          return (
            <Pressable
              key={l}
              onPress={() => onChange(v)}
              testID={`${testID}-${l}`}
              style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: active ? c.primary : c.outline, backgroundColor: active ? c.primaryContainer : "transparent" }}
            >
              <Text style={{ color: c.fg }}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Blatt von unten mit fester Fußzeile (Zurücksetzen, Fertig) */
function OptionsSheet({ onClose, onReset, testID, resetTestID, closeTestID, children }: { onClose(): void; onReset(): void; testID: string; resetTestID: string; closeTestID: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85%" }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} testID={testID}>
            {children}
          </ScrollView>
          {/* Feste Fußzeile: bleibt sichtbar, auch wenn die Optionen scrollen */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.outline }}>
            <Pressable onPress={onReset} testID={resetTestID}>
              <Text style={{ color: c.danger }}>Zurücksetzen</Text>
            </Pressable>
            <Pressable onPress={onClose} testID={closeTestID}>
              <Text style={{ color: c.primary, fontWeight: "600" }}>Fertig</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Sortierung und Filter der Listenübersicht (4.6) bzw. der Programmier-Übersicht (4.8, `dev`) */
export function ListOptionsSheet({ dev }: { dev?: boolean }) {
  const f = useFilter();
  const [o, setListOpts, open, setOpen] = dev ? [f.devOpts, f.setDevOpts, f.devOpen, f.setDevOpen] : [f.listOpts, f.setListOpts, f.listsOpen, f.setListsOpen];
  if (!open) return null;
  return (
    <OptionsSheet onClose={() => setOpen(false)} onReset={() => setListOpts(DEFAULT_LIST_OPTIONS)} testID="list-options-sheet" resetTestID="list-options-reset" closeTestID="list-options-close">
      <ChipRow
        label="Sortierung"
        value={o.sort}
        opts={(Object.keys(LIST_SORT_LABELS) as ListSort[]).map((k) => [k, LIST_SORT_LABELS[k]] as Opt<ListSort>)}
        onChange={(s) => setListOpts({ ...o, sort: s, desc: LIST_DEFAULT_DESC[s] })}
        testID="list-sort"
      />
      <ChipRow label="Richtung" value={o.desc} opts={[[false, "aufsteigend"], [true, "absteigend"]]} onChange={(desc) => setListOpts({ ...o, desc })} testID="list-dir" />
      <ChipRow
        label="Einträge"
        value={o.filter}
        opts={(Object.keys(LIST_FILTER_LABELS) as ListFilter[]).map((k) => [k, LIST_FILTER_LABELS[k]] as Opt<ListFilter>)}
        onChange={(filter) => setListOpts({ ...o, filter })}
        testID="list-filter"
      />
    </OptionsSheet>
  );
}

/** Sortierung der Einträge einer Programmier-Liste (4.8) */
export function DevItemOptionsSheet() {
  const { devItemOpts: o, setDevItemOpts, devItemsOpen, setDevItemsOpen } = useFilter();
  if (!devItemsOpen) return null;
  return (
    <OptionsSheet onClose={() => setDevItemsOpen(false)} onReset={() => setDevItemOpts(DEFAULT_DEV_ITEM_OPTIONS)} testID="dev-item-options-sheet" resetTestID="dev-item-options-reset" closeTestID="dev-item-options-close">
      <ChipRow
        label="Sortierung"
        value={o.sort}
        opts={(Object.keys(DEV_ITEM_SORT_LABELS) as DevItemSort[]).map((k) => [k, DEV_ITEM_SORT_LABELS[k]] as Opt<DevItemSort>)}
        onChange={(sort) => setDevItemOpts({ sort, desc: DEV_ITEM_DEFAULT_DESC[sort] })}
        testID="dev-item-sort"
      />
      <ChipRow label="Richtung" value={o.desc} opts={[[false, "aufsteigend"], [true, "absteigend"]]} onChange={(desc) => setDevItemOpts({ ...o, desc })} testID="dev-item-dir" />
    </OptionsSheet>
  );
}

export function FilterSheet({ today }: { today: Temporal.PlainDate }) {
  const { filter, setFilter, sort, setSort, open, setOpen, inboxNewest, setInboxNewest } = useFilter();
  const c = useTheme();
  if (!open) return null;
  const set = <K extends keyof Filter>(k: K, v: Filter[K] | "any") => {
    const n = { ...filter };
    if (v === "any" || v === undefined) delete n[k];
    else n[k] = v as Filter[K];
    setFilter(n);
  };
  const row = <V,>(label: string, value: V, opts: Opt<V>[], on: (v: V) => void, testID: string) => (
    <ChipRow label={label} value={value} opts={opts} onChange={on} testID={testID} />
  );
  // Mehrfachauswahl: ODER innerhalb des Merkmals (4.3)
  const multiRow = <V extends string>(label: string, value: V[], opts: Opt<V>[], on: (v: V[]) => void, testID: string) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label} (mehrere möglich)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {opts.map(([v, l]) => {
          const active = value.includes(v);
          return (
            <Pressable
              key={v}
              onPress={() => on(active ? value.filter((x) => x !== v) : [...value, v])}
              testID={`${testID}-${l}`}
              accessibilityState={{ checked: active }}
              accessibilityRole="checkbox"
              style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: active ? c.primary : c.outline, backgroundColor: active ? c.primaryContainer : "transparent" }}
            >
              <Text style={{ color: c.fg }}>{active ? "✓ " : ""}{l}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
  const rangeOf = (k: "due" | "scheduled") => (typeof filter[k] === "object" ? (filter[k] as { from: string; to: string }) : null);
  const rangeRow = (k: "due" | "scheduled") => {
    const r = rangeOf(k);
    if (!r) return null;
    const fmt = (d: string) => d.split("-").reverse().join(".");
    return (
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable onPress={() => pickDate(r.from, (d) => set(k, { ...r, from: d }))}>
          <Text style={{ color: c.primary }}>von {fmt(r.from)}</Text>
        </Pressable>
        <Pressable onPress={() => pickDate(r.to, (d) => set(k, { ...r, to: d }))}>
          <Text style={{ color: c.primary }}>bis {fmt(r.to)}</Text>
        </Pressable>
      </View>
    );
  };
  const defaultRange = { from: today.toString(), to: today.add({ days: 30 }).toString() };
  const dueValue = typeof filter.due === "object" ? "range" : (filter.due ?? "any");
  const schValue = typeof filter.scheduled === "object" ? "range" : (filter.scheduled ?? "any");
  return (
    <OptionsSheet
      onClose={() => setOpen(false)}
      onReset={() => {
        setFilter({});
        setSort("default");
        setInboxNewest(true);
      }}
      testID="filter-sheet"
      resetTestID="filter-reset"
      closeTestID="filter-close"
    >
      {row("Sortierung", sort, (Object.keys(SORT_LABELS) as SortChoice[]).map((k) => [k, SORT_LABELS[k]] as Opt<SortChoice>), setSort, "sort")}
      {row("Eingang sortieren", inboxNewest, [[true, "neueste zuerst"], [false, "älteste zuerst"]] as Opt<boolean>[], setInboxNewest, "inbox-sort")}
      {multiRow("Status", filter.status ?? [], [["open", "offen"], ["in-progress", "in Arbeit"], ["done", "erledigt"]], (v) => set("status", v.length ? v : "any"), "status")}
      {multiRow("Priorität", filter.priority ?? [], [["high", "hoch"], ["normal", "normal"], ["low", "niedrig"], ["none", "keine"]], (v) => set("priority", v.length ? v : "any"), "priority")}
      {row("Eingang", filter.inbox ?? "any", [["any", "egal"], ["yes", "ja"], ["no", "nein"]] as Opt<string>[], (v) => set("inbox", v as never), "inbox")}
      {row("Frist", dueValue, [["any", "egal"], ["none", "keine"], ["overdue", "überfällig"], ["today", "heute"], ["next7", "7 Tage"], ["range", "Zeitraum"]] as Opt<string>[], (v) => set("due", (v === "range" ? defaultRange : v) as never), "due")}
      {rangeRow("due")}
      {row("Geplant", schValue, [["any", "egal"], ["none", "keine"], ["earlier", "früher eingeplant"], ["today", "heute"], ["next7", "7 Tage"], ["range", "Zeitraum"]] as Opt<string>[], (v) => set("scheduled", (v === "range" ? defaultRange : v) as never), "scheduled")}
      {rangeRow("scheduled")}
      {row("Wiederholung", filter.recurrence ?? "any", [["any", "egal"], ["none", "keine"], ["calendar", "Kalender"], ["completion", "ab Erledigung"], ["invalid", "fehlerhaft"]] as Opt<string>[], (v) => set("recurrence", v as never), "recurrence")}
    </OptionsSheet>
  );
}
