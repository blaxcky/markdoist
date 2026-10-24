// Verlauf einer Serie: Kennzahlen, Monatskalender des aktiven Abschnitts, frühere Abschnitte aus dem Archiv.
import { ScrollView, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pastSkippedCount, seriesHistory, type HistoryMark, type HistoryMonth } from "@markdoist/app";
import { describeOccurrence, describeRule, parseKey, type Temporal } from "@markdoist/core";
import { useRepoState } from "../repo";
import { useTheme, type Theme } from "../theme";
import type { RootStack } from "../navigation";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function shortDate(d: Temporal.PlainDate, today: Temporal.PlainDate): string {
  return `${d.day}. ${MONTHS_SHORT[d.month - 1]}${d.year !== today.year ? ` ${d.year}` : ""}`;
}

function Stat({ c, value, label, color }: { c: Theme; value: string; label: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 2 }}>
      <Text style={{ color: color ?? c.fg, fontSize: 22, fontWeight: "600" }}>{value}</Text>
      <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function Month({ c, month: { year, month, cells }, mark }: { c: Theme; month: HistoryMonth; mark(d: Temporal.PlainDate): HistoryMark }) {
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 18, paddingTop: 12, paddingHorizontal: 10, paddingBottom: 10 }}>
      <Text style={{ color: c.fg, fontSize: 15, fontWeight: "600", marginLeft: 6, marginBottom: 8 }}>
        {MONTHS[month - 1]} {year}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={{ width: "14.2857%", textAlign: "center", color: c.muted, fontSize: 11, paddingBottom: 4 }}>
            {w}
          </Text>
        ))}
        {cells.map((d, i) => {
          const m = d ? mark(d) : null;
          const base = { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" } as const;
          const box =
            m === "done"
              ? { ...base, backgroundColor: c.doneContainer }
              : m === "skipped"
                ? { ...base, borderWidth: 1.5, borderStyle: "dashed" as const, borderColor: c.muted }
                : m === "current"
                  ? { ...base, borderWidth: 2, borderColor: c.primary }
                  : m === "upcoming"
                    ? { ...base, backgroundColor: c.bg }
                    : base;
          const color = m === "done" ? c.onDoneContainer : m === "current" ? c.primary : m === "upcoming" ? c.fg : c.muted;
          return (
            <View
              key={i}
              style={{ width: "14.2857%", height: 38, alignItems: "center", justifyContent: "center" }}
              accessible={!!m}
              accessibilityLabel={d && m ? `${describeOccurrence(d)}: ${{ done: "erledigt", skipped: "übersprungen", current: "aktuelles Vorkommen", upcoming: "geplant" }[m]}` : undefined}
            >
              {d && (
                <View style={box}>
                  <Text style={{ color, fontSize: 13, fontWeight: m === "done" || m === "current" ? "600" : "400", textDecorationLine: m === "skipped" ? "line-through" : "none", opacity: m ? 1 : 0.6 }}>{d.day}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function SeriesHistoryScreen() {
  const route = useRoute<RouteProp<RootStack, "SeriesHistory">>();
  const state = useRepoState();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const view = state.index.tasks.find((v) => v.task.ref === route.params.ref);
  const s = view?.series ?? null;
  const today = state.index.today;
  if (!view) return null;

  const archive = (Array.isArray(view.task.data.recurrence_archive) ? view.task.data.recurrence_archive : [])
    .filter((a) => !!a && typeof a === "object" && !Array.isArray(a))
    .map((a) => {
      const r = a as Record<string, unknown>;
      const list = (k: string) => (Array.isArray(r[k]) ? [...new Set((r[k] as unknown[]).map(String))].sort() : []);
      const done = list("complete_instances");
      const skipped = list("skipped_instances");
      const all = [...done, ...skipped].sort();
      return { rule: String(r.recurrence ?? "?"), removed: r.closed_reason === "removed", done: done.length, skipped: skipped.length, from: parseKey(all[0] ?? ""), to: parseKey(all[all.length - 1] ?? "") };
    })
    .reverse();

  const K = s?.instance ?? null;
  const pastSkipped = s ? pastSkippedCount(s) : 0;
  const plannedSkipped = s ? s.S.size - pastSkipped : 0;
  const { months, mark } = s ? seriesHistory(s) : { months: [], mark: () => null };
  const ruleText = s ? (s.rule ? (describeRule(s.rule, s.anchor) ?? s.raw) : s.raw) : null;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24, gap: 12 }} testID="series-history">
      <Text style={{ color: c.muted, fontSize: 13, paddingHorizontal: 4 }} numberOfLines={1}>
        {view.task.fields.title}
        {ruleText ? ` · ${ruleText}` : ""}
      </Text>
      {s && (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Stat c={c} value={String(s.C.size)} label="erledigt" color={c.onDoneContainer} />
            <Stat c={c} value={String(pastSkipped)} label="übersprungen" />
            {s.start ? <Stat c={c} value={shortDate(s.start.date, today)} label="Abschnitt seit" /> : <Stat c={c} value={String(plannedSkipped)} label="künftig ausgelassen" />}
          </View>
          {plannedSkipped > 0 && s.start && (
            <Text style={{ color: c.muted, fontSize: 13, paddingHorizontal: 4 }}>
              {plannedSkipped === 1 ? "1 künftiger Termin wird übersprungen" : `${plannedSkipped} künftige Termine werden übersprungen`}
            </Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.doneContainer, borderWidth: 1.5, borderColor: c.onDoneContainer }} />
              <Text style={{ color: c.muted, fontSize: 12 }}>erledigt</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.muted }} />
              <Text style={{ color: c.muted, fontSize: 12 }}>übersprungen</Text>
            </View>
            {K && s.phase !== "ended" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: c.primary }} />
                <Text style={{ color: c.muted, fontSize: 12 }}>aktuell</Text>
              </View>
            )}
          </View>
          {months.map((m) => (
            <Month key={`${m.year}-${m.month}`} c={c} month={m} mark={mark} />
          ))}
        </>
      )}
      {archive.length > 0 && (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={{ color: c.muted, fontSize: 13, fontWeight: "600", paddingHorizontal: 4 }}>Frühere Abschnitte</Text>
          <View style={{ backgroundColor: c.surface, borderRadius: 18, overflow: "hidden" }}>
            {archive.map((a, i) => (
              <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 2, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider }}>
                <Text style={{ color: c.fg, fontSize: 15 }} numberOfLines={1}>{a.rule}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>
                  {a.removed ? "Wiederholung entfernt" : "Regel geändert"}
                  {a.from && a.to ? ` · ${shortDate(a.from, today)} – ${shortDate(a.to, today)}` : ""}
                  {` · ${a.done} erledigt, ${a.skipped} übersprungen`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
      {!s && archive.length === 0 && <Text style={{ color: c.muted, padding: 8 }}>Kein Verlauf vorhanden.</Text>}
    </ScrollView>
  );
}
