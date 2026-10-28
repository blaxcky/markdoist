// Müllabfuhr (4.7): Übersicht je Abfuhrart hinter „Mehr“ und Ansicht einer Abfuhrart.
// Importiert wird am Desktop; hier werden die Termine angezeigt, abgehakt und übersprungen.
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { describeOccurrence, describeSeries, Temporal, wasteView, type TaskView } from "@markdoist/core";
import { ListHeader } from "../components/list-header";
import { TaskRow } from "../components/task-row";
import { ActionsSheet } from "../components/actions-sheet";
import { Menu } from "../components/menu";
import { BinIcon, ChevronIcon } from "../components/icons";
import { useCompletionFlow } from "../completion";
import { systemClock, useRepo, useRepoState } from "../repo";
import { useNotify, useSnackbarInset } from "../notify";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export function WasteScreen() {
  const repo = useRepo();
  const state = useRepoState();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [pulling, setPulling] = useState(false);
  useSnackbarInset(useBottomTabBarHeight() + 20);
  const entries = useMemo(() => wasteView(state.index), [state.index]);
  const subtitle = entries.length ? (entries.length === 1 ? "1 Abfuhrart" : `${entries.length} Abfuhrarten`) : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ListHeader title={T.views.waste} subtitle={subtitle} filter={false} />
      <FlashList
        data={entries}
        keyExtractor={(e) => e.view.task.ref}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}
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
              {T.empty.wasteMobile}
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          const first = index === 0;
          const last = index === entries.length - 1;
          const title = item.view.task.fields.title;
          return (
            <Pressable
              onPress={() => nav.navigate("WasteType", { ref: item.view.task.ref })}
              android_ripple={{ color: c.surfaceHigh }}
              testID={`waste-${title}`}
              accessibilityRole="button"
              style={{
                marginHorizontal: 8,
                marginBottom: last ? 0 : 2,
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: c.surface,
                borderTopLeftRadius: first ? 12 : 0,
                borderTopRightRadius: first ? 12 : 0,
                borderBottomLeftRadius: last ? 12 : 0,
                borderBottomRightRadius: last ? 12 : 0,
              }}
            >
              <BinIcon color={c.muted} size={18} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ color: c.fg, fontSize: 16, lineHeight: 22 }}>
                  {title}
                </Text>
                <Text style={{ color: c.muted, fontSize: 13, marginTop: 2, fontVariant: ["tabular-nums"] }}>
                  {item.next ? `${describeOccurrence(item.next)} · ${T.waste.remaining(item.remaining)}` : T.waste.noMore}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

type DateState = "erledigt" | "übersprungen" | "versäumt";

/** Eine Abfuhrart: aktuelles Vorkommen als Aufgabenzeile, darunter weitere und vergangene Termine. */
export function WasteTypeScreen() {
  const { ref } = useRoute<RouteProp<RootStack, "WasteType">>().params;
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const [menu, setMenu] = useState<string | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [actions, setActions] = useState<TaskView | null>(null);
  useSnackbarInset(20);
  const idx = state.index;
  const tz = systemClock().timeZone;
  const view = idx.tasks.find((v) => v.task.ref === ref) ?? null;
  const s = view?.series ?? null;
  const active = !!view && view.task.fields.status !== "done";
  const live = useMemo(() => (view && active ? [view] : []), [view, active]);
  const completion = useCompletionFlow({ repo, notify, live, refs: live.map((v) => v.task.ref) });
  const title = view?.task.fields.title;
  useEffect(() => {
    if (title) nav.setOptions({ title });
  }, [nav, title]);
  if (!view) return null;
  const k = s?.instance ?? null;
  const ended = !s || s.phase === "ended";
  const cmp = Temporal.PlainDate.compare;
  const dates = s?.dates ?? [];
  const upcoming = ended || !k ? [] : dates.filter((d) => cmp(d, k) > 0 && !s!.C.has(d.toString()));
  const past = dates
    .filter((d) => (ended || !k ? cmp(d, idx.today) <= 0 : cmp(d, k) < 0))
    .map((d): [Temporal.PlainDate, DateState] => [d, s!.C.has(d.toString()) ? "erledigt" : s!.S.has(d.toString()) ? "übersprungen" : "versäumt"])
    .reverse();
  const canEdit = !view.readOnly && s?.phase === "active";
  const lead = s?.offsetDays === null || s?.offsetDays === undefined ? null : -s.offsetDays;
  const setException = (date: string, skipped: boolean) => {
    if (!s) return;
    const label = skipped ? "Termin wird übersprungen" : "Termin wieder aufgenommen";
    void repo.perform(ref, { type: "setException", revision: s.revisionKey, date, skipped }, label).then((o) => notify(o, label));
  };
  const heading = (text: string, count: number) => (
    <Text style={{ color: c.fg, fontWeight: "600", fontSize: 15, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 }} accessibilityRole="header">
      {text} <Text style={{ color: c.muted, fontWeight: "400", fontVariant: ["tabular-nums"] }}>{count}</Text>
    </Text>
  );
  const card = (i: number, n: number) => ({
    marginHorizontal: 8,
    marginBottom: i === n - 1 ? 0 : 2,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: c.surface,
    borderTopLeftRadius: i === 0 ? 12 : 0,
    borderTopRightRadius: i === 0 ? 12 : 0,
    borderBottomLeftRadius: i === n - 1 ? 12 : 0,
    borderBottomRightRadius: i === n - 1 ? 12 : 0,
  });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8, gap: 4 }}>
          <Text style={{ color: c.muted, fontSize: 13 }} testID="waste-desc">
            {s ? (describeSeries(s) ?? "") : "Keine Serie"}
          </Text>
          {s?.dates && !view.readOnly && (
            <Pressable onPress={() => nav.navigate("Recurrence", { ref })} hitSlop={8} testID="waste-lead">
              <Text style={{ color: c.primary, fontSize: 13, fontWeight: "500" }}>
                {lead === null ? "ohne Vorlauf" : `geplant ${lead} ${lead === 1 ? "Tag" : "Tage"} vorher`} · ändern
              </Text>
            </Pressable>
          )}
        </View>
        {completion.shown.map((v) => (
          <TaskRow
            key={v.task.ref}
            view={v}
            today={idx.today}
            tz={tz}
            scheduledHint={!!v.scheduled}
            showInbox={false}
            onOpen={() => nav.navigate("Detail", { ref: v.task.ref })}
            phase={completion.phase(v.task.ref)}
            onLeft={() => completion.left(v.task.ref)}
            onToggle={() => completion.start(v)}
            onActions={() => setActions(v)}
          />
        ))}
        {heading(T.waste.upcoming, upcoming.length)}
        {upcoming.map((d, i) => {
          const key = d.toString();
          const skipped = s!.S.has(key);
          return (
            <Pressable
              key={key}
              onLongPress={canEdit ? () => setMenu(key) : undefined}
              android_ripple={canEdit ? { color: c.surfaceHigh } : undefined}
              testID={`waste-date-${key}`}
              accessibilityHint={canEdit ? "Lange drücken zum Überspringen" : undefined}
              style={card(i, upcoming.length)}
            >
              <Text style={{ flex: 1, color: skipped ? c.muted : c.fg, fontSize: 16, textDecorationLine: skipped ? "line-through" : "none" }}>{describeOccurrence(d)}</Text>
              {skipped && <Text style={{ color: c.muted, fontSize: 13 }}>übersprungen</Text>}
            </Pressable>
          );
        })}
        {!upcoming.length && <Text style={{ color: c.muted, paddingHorizontal: 18 }}>{ended ? T.waste.noMore : "Danach keine Termine mehr."}</Text>}
        {past.length > 0 && (
          <>
            <Pressable onPress={() => setPastOpen((o) => !o)} testID="waste-past" style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10 }}>
              <ChevronIcon color={c.muted} size={14} dir={pastOpen ? "down" : "right"} />
              <Text style={{ color: c.fg, fontWeight: "600", fontSize: 15 }}>
                {T.waste.past} <Text style={{ color: c.muted, fontWeight: "400" }}>{past.length}</Text>
              </Text>
            </Pressable>
            {pastOpen &&
              past.map(([d, st], i) => (
                <View key={d.toString()} style={card(i, past.length)}>
                  <Text style={{ flex: 1, color: c.muted, fontSize: 15, textDecorationLine: st === "übersprungen" ? "line-through" : "none" }}>{describeOccurrence(d)}</Text>
                  <Text style={{ color: st === "versäumt" ? c.danger : c.muted, fontSize: 13 }}>{st}</Text>
                </View>
              ))}
          </>
        )}
      </ScrollView>
      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        title={menu ? describeOccurrence(Temporal.PlainDate.from(menu)) : undefined}
        items={
          menu
            ? [
                s?.S.has(menu)
                  ? { label: T.waste.unskip, testID: "waste-unskip", onPress: () => setException(menu, false) }
                  : { label: T.waste.skip, testID: "waste-skip", onPress: () => setException(menu, true) },
              ]
            : []
        }
      />
      <ActionsSheet view={actions} today={idx.today} onClose={() => setActions(null)} />
    </View>
  );
}
