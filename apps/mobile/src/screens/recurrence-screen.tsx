// Wiederholungseditor Android (Abschnitt 6, M6) auf Basis des gemeinsamen Formularmodells.
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { defaultForm, formFromSeries, needsMonthEndChoice, previewAction, previewForm, ruleFormAction, type RuleForm } from "@markdoist/app";
import { describeOccurrence, describeSeries, parseKey, remainingListDates, type TaskView, type Weekday } from "@markdoist/core";
import { pickDate } from "../components/actions-sheet";
import { systemClock, useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import { useTheme, type Theme } from "../theme";
import type { RootStack } from "../navigation";

const WD: [Weekday, string][] = [["MO", "Mo"], ["TU", "Di"], ["WE", "Mi"], ["TH", "Do"], ["FR", "Fr"], ["SA", "Sa"], ["SU", "So"]];

function Chips<V extends string | number>({ c, value, options, onChange, testID }: { c: Theme; value: V; options: [V, string][]; onChange(v: V): void; testID?: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(([v, l]) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} testID={testID ? `${testID}-${v}` : undefined} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: v === value ? c.primary : c.outline, backgroundColor: v === value ? c.primaryContainer : "transparent" }}>
          <Text style={{ color: c.fg }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function RecurrenceScreen() {
  const route = useRoute<RouteProp<RootStack, "Recurrence">>();
  const state = useRepoState();
  const view = state.index.tasks.find((v) => v.task.ref === route.params.ref);
  // Feste Terminliste (5.7): Termine kommen aus dem Import, änderbar ist nur der Vorlauf.
  if (view?.series?.dates) return <DateListLead key={view.task.ref} view={view} />;
  return <RuleEditor />;
}

function DateListLead({ view }: { view: TaskView }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const notify = useNotify();
  const c = useTheme();
  const s = view.series!;
  const [lead, setLead] = useState(s.offsetDays === null ? "" : String(-s.offsetDays));
  useEffect(() => {
    nav.setOptions({ title: "Termine und Vorlauf" });
  }, [nav]);
  const n = lead.trim() === "" ? null : Number(lead);
  const valid = n === null || (Number.isInteger(n) && n >= 0 && n <= 60);
  const next = remainingListDates(s).slice(0, 10);
  const save = () => {
    void repo
      .perform(view.task.ref, { type: "changeReference", revision: s.revisionKey, field: s.field, offsetDays: n === null ? null : -n }, "Vorlauf geändert")
      .then((o) => {
        notify(o, "Vorlauf geändert");
        if (o.status === "ok" || o.status === "noop") nav.goBack();
      });
  };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: c.fg, fontSize: 15, fontWeight: "600" }}>{describeSeries(s)}</Text>
      <Text style={{ color: c.muted, fontSize: 13 }}>Nächste Termine: {next.length ? next.map((d) => describeOccurrence(d)).join(" · ") : "keine"}</Text>
      <Text style={{ color: c.muted, fontSize: 13, marginTop: 8 }}>Vorlauf</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: c.fg }}>geplant</Text>
        <TextInput keyboardType="number-pad" value={lead} onChangeText={setLead} testID="datelist-lead" style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: c.fg, width: 70 }} />
        <Text style={{ color: c.fg, flex: 1 }}>Tage vor dem Termin</Text>
      </View>
      <Text style={{ color: c.muted, fontSize: 13 }}>Leer lassen, wenn die Termine nicht vorher in Heute stehen sollen. Neue Termine kommen mit dem Kalenderimport am Desktop.</Text>
      <Pressable onPress={valid ? save : undefined} disabled={!valid} testID="datelist-save" style={{ marginTop: 12, minHeight: 48, borderRadius: 24, backgroundColor: valid ? c.primary : c.surfaceHigh, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: valid ? c.onPrimary : c.muted, fontSize: 15, fontWeight: "600" }}>Speichern</Text>
      </Pressable>
    </ScrollView>
  );
}

function RuleEditor() {
  const route = useRoute<RouteProp<RootStack, "Recurrence">>();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const view = state.index.tasks.find((v) => v.task.ref === route.params.ref);
  const series = view?.series ?? null;
  const today = state.index.today;
  const continueSeries = route.params.continueSeries === true;
  const [f, setF] = useState<RuleForm>(() => {
    const form = series ? formFromSeries(series, today) : defaultForm(today, view?.task.fields.due ? "due" : view?.task.fields.scheduled ? "scheduled" : "due");
    if (continueSeries) form.restartCount = true;
    return form;
  });
  // Künftige Ausnahmen werden nur nach ausdrücklicher Auswahl übernommen (5.1).
  const futureExceptions = series ? [...series.S].filter((d) => d > today.toString()).sort() : [];
  const [carry, setCarry] = useState<string[]>([]);
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const preview = useMemo(() => previewForm(f, today, !!series), [f, today, series]);
  const action = useMemo(() => ruleFormAction(f, series, carry), [f, series, carry]);
  const effect = useMemo(() => (preview.ok && view ? previewAction(view.task, action, systemClock()) : null), [preview.ok, view, action]);
  useEffect(() => {
    if (continueSeries) nav.setOptions({ title: "Serie fortsetzen" });
  }, [continueSeries, nav]);
  if (!view) return null;
  const label = (t: string) => <Text style={{ color: c.muted, fontSize: 13, marginTop: 8 }}>{t}</Text>;
  const num = (value: number, on: (n: number) => void, testID?: string) => (
    <TextInput keyboardType="number-pad" value={String(value)} onChangeText={(t) => on(Math.max(1, parseInt(t, 10) || 1))} testID={testID} style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: c.fg, width: 70 }} />
  );
  const save = () => {
    if (effect?.preview.result === "noop") {
      nav.goBack();
      return;
    }
    void repo
      .perform(view.task.ref, action, series ? "Regel geändert" : "Wiederholung angelegt")
      .then((o) => {
        notify(o, series ? "Regel geändert" : "Wiederholung angelegt");
        if (o.status === "ok" || o.status === "noop") nav.goBack();
      });
  };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 6, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {label("Art")}
      <Chips c={c} value={f.anchor} options={[["calendar", "Kalender"], ["completion", "Ab Erledigung"]]} onChange={(v) => set("anchor", v)} testID="rec-anchor" />
      {label("Eingabe")}
      <Chips c={c} value={f.mode} options={[["simple", "Einfach"], ["advanced", "Erweitert (RRULE)"]]} onChange={(v) => set("mode", v)} />
      {f.mode === "simple" ? (
        <>
          {label(f.anchor === "completion" ? "Abstand nach Erledigung" : "Rhythmus")}
          <Chips
            c={c}
            value={f.freq}
            options={f.anchor === "completion" ? [["daily", "Tage"], ["weekly", "Wochen"], ["monthly", "Monate"], ["yearly", "Jahre"]] : [["daily", "täglich"], ["weekdays", "werktags"], ["weekly", "wöchentlich"], ["monthly", "monatlich"], ["yearly", "jährlich"]]}
            onChange={(v) => set("freq", v)}
            testID="rec-freq"
          />
          {f.freq !== "weekdays" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              <Text style={{ color: c.fg }}>{f.anchor === "completion" ? "Anzahl" : "alle"}</Text>
              {num(f.interval, (n) => set("interval", n), "rec-interval")}
            </View>
          )}
          {f.anchor === "calendar" && f.freq === "weekly" && (
            <>
              {label("Wochentage")}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {WD.map(([d, l]) => {
                  const on = f.weekdays.includes(d);
                  return (
                    <Pressable key={d} onPress={() => set("weekdays", on ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d])} style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.primary : c.surface }}>
                      <Text style={{ color: on ? c.onPrimary : c.fg }}>{l}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {f.anchor === "calendar" && f.freq === "monthly" && (
            <>
              {label("Monatlich")}
              <Chips c={c} value={f.monthlyMode} options={[["day", "am Tag"], ["last-day", "am letzten Tag"], ["nth-weekday", "am n-ten Wochentag"]]} onChange={(v) => set("monthlyMode", v)} />
              {f.monthlyMode === "day" && <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }}><Text style={{ color: c.fg }}>Tag</Text>{num(f.monthDay, (n) => set("monthDay", Math.min(31, n)))}</View>}
              {f.monthlyMode === "nth-weekday" && (
                <>
                  <Chips c={c} value={f.nth} options={[[1, "1."], [2, "2."], [3, "3."], [4, "4."], [-1, "letzten"]]} onChange={(v) => set("nth", v)} />
                  <Chips c={c} value={f.nthWeekday} options={WD} onChange={(v) => set("nthWeekday", v)} />
                </>
              )}
            </>
          )}
          {needsMonthEndChoice(f) && (
            <>
              {label("Monatsende")}
              <Chips c={c} value={f.monthEnd} options={[["skip", "Monate ohne diesen Tag auslassen"], ["last", "stattdessen am letzten Tag"]]} onChange={(v) => set("monthEnd", v)} />
            </>
          )}
          {label("Ende")}
          <Chips c={c} value={f.end} options={[["never", "nie"], ["until", "am Datum"], ["count", f.anchor === "completion" ? "nach n Erledigungen" : "nach n Terminen"]]} onChange={(v) => set("end", v)} testID="rec-end" />
          {f.end === "count" && <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }}><Text style={{ color: c.fg }}>Anzahl{series ? " ab dieser Änderung" : ""}</Text>{num(f.count, (n) => set("count", n), "rec-count")}</View>}
          {f.end === "until" && (
            <Pressable onPress={() => pickDate(f.until, (d) => set("until", d))} style={{ padding: 8 }}>
              <Text style={{ color: c.primary }}>bis {f.until.split("-").reverse().join(".")}</Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          {label("Regel (RRULE)")}
          <TextInput value={f.advanced} onChangeText={(t) => set("advanced", t)} autoCapitalize="characters" autoCorrect={false} testID="rec-advanced" style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 8, padding: 10, color: c.fg, fontFamily: "monospace" }} />
        </>
      )}
      {label("Start")}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Pressable onPress={() => pickDate(f.startDate, (d) => set("startDate", d))} style={{ padding: 8 }}>
          <Text style={{ color: c.primary }}>{f.startDate.split("-").reverse().join(".")}</Text>
        </Pressable>
        <Pressable onPress={() => set("startTime", f.startTime ? "" : "09:00")} style={{ padding: 8 }}>
          <Text style={{ color: c.primary }}>{f.startTime ? `${f.startTime} (Uhrzeit entfernen)` : "Uhrzeit hinzufügen"}</Text>
        </Pressable>
      </View>
      {label("Bezugsfeld")}
      <Chips c={c} value={f.field} options={[["due", "Frist"], ["scheduled", "Geplant"]]} onChange={(v) => set("field", v)} />
      {label(`Abstand für ${f.field === "due" ? "Geplant" : "Frist"} in Tagen (leer = keiner)`)}
      <TextInput keyboardType="numbers-and-punctuation" value={f.offset} onChangeText={(t) => set("offset", t)} style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: c.fg, width: 90 }} />
      {series && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
            <Switch value={f.restartCount} onValueChange={(v) => set("restartCount", v)} trackColor={{ true: c.primary }} testID="rec-restart" />
            <Text style={{ color: c.fg, flex: 1 }}>ab jetzt neu zählen („noch N-mal“)</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Switch value={f.resetChecklists} onValueChange={(v) => set("resetChecklists", v)} trackColor={{ true: c.primary }} />
            <Text style={{ color: c.fg, flex: 1 }}>Haken der Checklisten zurücksetzen</Text>
          </View>
          {futureExceptions.length > 0 && label("Ausnahmen weiterhin überspringen")}
          {futureExceptions.map((d) => (
            <View key={d} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Switch value={carry.includes(d)} onValueChange={(v) => setCarry((x) => (v ? [...x, d] : x.filter((y) => y !== d)))} trackColor={{ true: c.primary }} testID={`rec-carry-${d}`} />
              <Text style={{ color: c.fg, flex: 1 }}>{parseKey(d) ? describeOccurrence(parseKey(d)!) : d}</Text>
            </View>
          ))}
        </>
      )}
      <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 12, gap: 4, marginTop: 12 }} testID="rec-preview">
        {preview.ok ? (
          <>
            <Text style={{ color: c.fg, fontWeight: "600" }}>{preview.description ?? preview.rule}</Text>
            <Text style={{ color: c.fg }}>Nächste Termine: {preview.dates.map((d) => describeOccurrence(d)).join(" · ")}{preview.exhausted ? " (Ende)" : ""}</Text>
            {effect && (
              <View testID="rec-effect">
                {effect.lines.map((l) => (
                  <Text key={l} style={{ color: c.muted }}>• {l}</Text>
                ))}
              </View>
            )}
          </>
        ) : (
          <Text selectable style={{ color: c.danger }}>{preview.message}</Text>
        )}
      </View>
      <Pressable onPress={preview.ok && effect?.preview.result !== "blocked" ? save : undefined} testID="rec-save" style={{ marginTop: 12, alignSelf: "flex-end", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20, backgroundColor: c.primary, opacity: preview.ok && effect?.preview.result !== "blocked" ? 1 : 0.5 }}>
        <Text style={{ color: c.onPrimary, fontWeight: "600" }}>Speichern</Text>
      </Pressable>
    </ScrollView>
  );
}
