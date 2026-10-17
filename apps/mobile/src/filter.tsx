// Filter und Sortierung (4.3), gemeinsam für alle Listen; serialisierbares Filtermodell aus dem Kern.
import { createContext, use, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SORT_LABELS, type Filter, type SortChoice, type Temporal } from "@markdoist/core";
import { pickDate } from "./components/actions-sheet";
import { useTheme } from "./theme";

interface FilterState {
  filter: Filter;
  setFilter(f: Filter): void;
  sort: SortChoice;
  setSort(s: SortChoice): void;
  open: boolean;
  setOpen(o: boolean): void;
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
  return <Ctx value={{ filter, setFilter, sort, setSort, open, setOpen }}>{children}</Ctx>;
}

export function filterActive(f: Filter, s: SortChoice): boolean {
  return Object.keys(f).length > 0 || s !== "default";
}

type Opt<V> = [V, string];

export function FilterSheet({ today }: { today: Temporal.PlainDate }) {
  const { filter, setFilter, sort, setSort, open, setOpen } = useFilter();
  const c = useTheme();
  if (!open) return null;
  const set = <K extends keyof Filter>(k: K, v: Filter[K] | "any") => {
    const n = { ...filter };
    if (v === "any" || v === undefined) delete n[k];
    else n[k] = v as Filter[K];
    setFilter(n);
  };
  const row = <V,>(label: string, value: V, opts: Opt<V>[], on: (v: V) => void, testID: string) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {opts.map(([v, l]) => {
          const active = JSON.stringify(v) === JSON.stringify(value);
          return (
            <Pressable
              key={l}
              onPress={() => on(v)}
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
    <Modal transparent animationType="fade" visible onRequestClose={() => setOpen(false)}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85%" }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} testID="filter-sheet">
            {row("Sortierung", sort, (Object.keys(SORT_LABELS) as SortChoice[]).map((k) => [k, SORT_LABELS[k]] as Opt<SortChoice>), setSort, "sort")}
            {row("Status", filter.status?.[0] ?? "any", [["any", "egal"], ["open", "offen"], ["in-progress", "in Arbeit"], ["done", "erledigt"]] as Opt<string>[], (v) => set("status", v === "any" ? "any" : [v as never]), "status")}
            {row("Priorität", filter.priority?.[0] ?? "any", [["any", "egal"], ["high", "hoch"], ["normal", "normal"], ["low", "niedrig"], ["none", "keine"]] as Opt<string>[], (v) => set("priority", v === "any" ? "any" : [v as never]), "priority")}
            {row("Eingang", filter.inbox ?? "any", [["any", "egal"], ["yes", "ja"], ["no", "nein"]] as Opt<string>[], (v) => set("inbox", v as never), "inbox")}
            {row("Frist", dueValue, [["any", "egal"], ["none", "keine"], ["overdue", "überfällig"], ["today", "heute"], ["next7", "7 Tage"], ["range", "Zeitraum"]] as Opt<string>[], (v) => set("due", (v === "range" ? defaultRange : v) as never), "due")}
            {rangeRow("due")}
            {row("Geplant", schValue, [["any", "egal"], ["none", "keine"], ["earlier", "früher eingeplant"], ["today", "heute"], ["next7", "7 Tage"], ["range", "Zeitraum"]] as Opt<string>[], (v) => set("scheduled", (v === "range" ? defaultRange : v) as never), "scheduled")}
            {rangeRow("scheduled")}
            {row("Wiederholung", filter.recurrence ?? "any", [["any", "egal"], ["none", "keine"], ["calendar", "Kalender"], ["completion", "ab Erledigung"], ["invalid", "fehlerhaft"]] as Opt<string>[], (v) => set("recurrence", v as never), "recurrence")}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Pressable onPress={() => { setFilter({}); setSort("default"); }} testID="filter-reset">
                <Text style={{ color: c.danger }}>Zurücksetzen</Text>
              </Pressable>
              <Pressable onPress={() => setOpen(false)} testID="filter-close">
                <Text style={{ color: c.primary, fontWeight: "600" }}>Fertig</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
