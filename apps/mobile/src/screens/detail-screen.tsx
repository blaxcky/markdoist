// Detailansicht Android (4.4): Felder, Serie, Notiz mit Autosave und WebView-Vorschau.
// Gestaltung nach Vorlage: Blatt über der Liste mit Titelkarte, Terminzeilen und Eigenschafts-Chips.
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { diffLines } from "diff";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { previewAction, renderMarkdown, splitDateValue, T, type Outcome } from "@markdoist/app";
import {
  describeOccurrence,
  describeRule,
  formatGermanDate,
  parseKey,
  Temporal,
  upcomingForExceptions,
  type Priority,
  type TaskAction,
} from "@markdoist/core";
import { pickDate } from "../components/actions-sheet";
import { systemClock, useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import { prioColor, useTheme, type Theme } from "../theme";
import { dateLabel, toneColor } from "../format";
import { Menu } from "../components/menu";
import { CalendarIcon, CheckCircleIcon, ClockIcon, DotsIcon, FlagIcon, Glyph, InboxIcon, LinesIcon, PlusIcon } from "../components/icons";
import type { RootStack } from "../navigation";

type SaveState = "idle" | "pending" | "draft" | "saved" | "failed" | "conflict";

function Chip({ label, active, onPress, c, testID, disabled }: { label: string; active: boolean; onPress(): void; c: Theme; testID?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      testID={testID}
      accessibilityState={{ selected: active, disabled }}
      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: active ? c.primary : c.outline, backgroundColor: active ? c.primaryContainer : c.surface, opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ color: c.fg }}>{label}</Text>
    </Pressable>
  );
}

/** Eigenschafts-Chip im Stil der Vorlage (grauer Grund, Symbol links). */
function PropChip({ label, icon, onPress, c, testID, disabled, active }: { label: string; icon: ReactNode; onPress(): void; c: Theme; testID?: string; disabled?: boolean; active?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: active ? c.primaryContainer : c.surfaceHigh, opacity: disabled ? 0.5 : 1 }}
    >
      {icon}
      <Text style={{ color: c.fg, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function SmallChip({ label, onPress, c, disabled }: { label: string; onPress(): void; c: Theme; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} hitSlop={6} style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: c.surfaceHigh, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: c.fg, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** Blatt von unten über der Liste; Tippen auf den abgedunkelten Bereich schließt. */
function Sheet({ children, onClose }: { children: ReactNode; onClose(): void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.backdrop }}>
      <Pressable style={{ flex: 1, minHeight: insets.top + 24 }} onPress={onClose} accessibilityLabel="Schließen" />
      <Animated.View entering={SlideInDown.duration(220)} style={{ flexShrink: 1, backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 }}>
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.outline, marginBottom: 2 }} />
        {children}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function previewHtml(body: string, c: Theme): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;font-size:15px;color:${c.fg};background:${c.surface};margin:12px 16px;line-height:1.5}
a{color:${c.primary}}pre,code{background:${c.badge};border-radius:4px}pre{padding:8px;overflow:auto}
li.task-item{list-style:none;margin-left:-22px}input.md-check{width:20px;height:20px;vertical-align:-4px;margin-right:6px}</style></head>
<body>${renderMarkdown(body)}<script>
document.addEventListener('click',function(e){var t=e.target;
if(t.classList&&t.classList.contains('md-check')){e.preventDefault();window.ReactNativeWebView.postMessage(JSON.stringify({check:Number(t.dataset.line)}));}
else if(t.tagName==='A'){e.preventDefault();window.ReactNativeWebView.postMessage(JSON.stringify({link:t.href}));}},true);
</script></body></html>`;
}

export function DetailScreen() {
  const route = useRoute<RouteProp<RootStack, "Detail">>();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const ref = route.params.ref;
  const view = state.index.tasks.find((v) => v.task.ref === ref) ?? null;
  const draft = state.drafts.find((d) => d.ref === ref)?.text ?? null;
  const [title, setTitle] = useState(view?.task.fields.title ?? "");
  const [body, setBody] = useState(draft ?? view?.task.body ?? "");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const draftConflict = !!state.drafts.find((d) => d.ref === ref)?.conflictHash;
  const [save, setSave] = useState<SaveState>(draftConflict ? "conflict" : draft !== null ? "draft" : "idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const html = useMemo(() => (tab === "preview" ? previewHtml(body, c) : ""), [tab, body, c]);
  const [menu, setMenu] = useState<"priority" | "inbox" | "more" | null>(null);
  const [showNote, setShowNote] = useState(false);
  const editor = useRef<ComponentRef<typeof TextInput>>(null);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const row = { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 12 } as const;
  const card = { backgroundColor: c.surface, borderRadius: 12, padding: 14 } as const;

  useEffect(() => {
    if (view && !pending.current) setBody(draft ?? view.task.body);
  }, [view?.task.hash]);  
  useEffect(() => {
    if (view) setTitle(view.task.fields.title);
  }, [view?.task.fields.title]);  

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current) return;
    pending.current = false;
    const o = await repo.commitDraft(ref);
    // Während des Schreibens weitergetippt: Der jüngere Text ist erst Entwurf, nicht gespeichert (R1).
    if (o.status === "ok" || o.status === "noop") setSave((x) => (pending.current ? x : "saved"));
    else {
      setSave(o.status === "conflict" ? "conflict" : "failed");
      notify(o, "Notiz");
    }
  };
  useEffect(() => {
    const unsub = nav.addListener("beforeRemove", () => void flush());
    return unsub;
  }); // beim Verlassen speichern

  // Extern umbenannt: Detail über die ID nachführen (7.1).
  const moved = !view ? repo.resolveRef(ref) : null;
  useEffect(() => {
    if (moved && moved !== ref) nav.setParams({ ref: moved });
  }, [moved, ref, nav]);

  if (!view) {
    return (
      <Sheet onClose={() => nav.goBack()}>
        <View style={{ padding: 24, paddingBottom: insets.bottom + 32, gap: 16 }}>
          <Text style={{ color: c.muted }}>Die Aufgabe ist nicht mehr vorhanden.</Text>
          {draft !== null && (
            <Pressable onPress={() => void repo.saveDraftAsNew(ref, "Wiederhergestellter Entwurf").then((o) => notify(o, "Als neue Datei gespeichert"))}>
              <Text style={{ color: c.primary }}>Entwurf als neue Datei speichern</Text>
            </Pressable>
          )}
        </View>
      </Sheet>
    );
  }

  const t = view.task;
  const f = t.fields;
  const ro = view.readOnly;
  const s = view.series;
  const K = s?.instance?.toString() ?? "";
  const act = (a: TaskAction, label: string) => void repo.perform(ref, a, label).then((o: Outcome) => notify(o, label));
  // Vorschau vor dem Abschluss (5.2, 5.4)
  const clock = systemClock();
  const complete = s && s.phase === "active" ? previewAction(t, { type: "completeOccurrence", revision: s.revisionKey, instance: K }, clock) : null;
  const reopen = s && s.phase === "ended" ? previewAction(t, { type: "reopenSeries", revision: s.revisionKey }, clock) : null;
  const previewLinesFor = (complete ?? reopen)?.lines ?? [];
  const upcoming = s ? upcomingForExceptions(s) : [];
  const extraSkipped = s
    ? [...s.S].filter((d) => s.instance && d > s.instance.toString() && !upcoming.some((u) => u.date.toString() === d) && parseKey(d)).sort()
    : [];

  const onBody = (text: string) => {
    setBody(text);
    pending.current = true;
    setSave("pending");
    void repo.saveDraft(ref, text).then(() => setSave((x) => (x === "pending" ? "draft" : x)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1500);
  };

  const tz = systemClock().timeZone;
  const dateParts = (field: "due" | "scheduled") => {
    const raw = typeof t.data[field] === "string" ? (t.data[field] as string) : null;
    // Werte mit Offset in Ortszeit anzeigen (3.3); erst eine Bearbeitung schreibt lokal.
    const { date, time } = splitDateValue(raw, tz);
    const set = (d: string, tm: string) => act({ type: "setDate", field, value: d ? (tm ? `${d}T${tm}` : d) : null }, field === "due" ? "Frist geändert" : "Planung geändert");
    return { raw, date, time, set };
  };
  const pickTime = (time: string, onPick: (tm: string) => void) => {
    const [h, mi] = time.split(":").map(Number);
    DateTimePickerAndroid.open({ value: new Date(2000, 0, 1, h, mi), mode: "time", is24Hour: true, onChange: (e, d) => e.type === "set" && d && onPick(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`) });
  };

  // Gesetzte Termine als eigene Zeile (Symbol, Datum, Uhrzeit, Entfernen); fehlende erscheinen als Chip.
  const dateRow = (field: "due" | "scheduled") => {
    const { raw, date, time, set } = dateParts(field);
    if (!date && !(raw && !f[field])) return null;
    const v = field === "due" ? view.due : view.scheduled;
    const tone = v ? dateLabel(v, state.index.today, tz, field === "due" && view.overdue).tone : "later";
    const color = field === "due" ? toneColor(c, tone) : c.muted;
    return (
      <View style={[row, { gap: 14 }]}>
        <Pressable onPress={ro ? undefined : () => pickDate(date || null, (d) => set(d, time))} testID={`field-${field}`} accessibilityLabel={T.fields[field]} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14 }}>
          {field === "due" ? <CalendarIcon color={color} size={18} /> : <ClockIcon color={color} size={18} />}
          <View style={{ flex: 1 }}>
            <Text style={{ color: date ? c.fg : c.warn, fontSize: 16 }}>{date ? formatGermanDate(Temporal.PlainDate.from(date)) : `ungültig: ${raw}`}</Text>
            <Text style={{ color: field === "due" && tone === "overdue" ? c.danger : c.muted, fontSize: 12 }}>
              {T.fields[field]}
              {field === "due" && tone === "overdue" ? ` · ${T.badges.overdue}` : ""}
              {v && s && s.field === field ? " · ↻" : ""}
            </Text>
          </View>
        </Pressable>
        {date && (time ? (
          <SmallChip c={c} disabled={ro} label={time} onPress={() => pickTime(time, (tm) => set(date, tm))} />
        ) : (
          <SmallChip c={c} disabled={ro} label="+ Uhrzeit" onPress={() => set(date, "09:00")} />
        ))}
        {!ro && (
          <Pressable onPress={() => set("", "")} testID={`clear-${field}`} hitSlop={10} accessibilityLabel={`${T.fields[field]} entfernen`}>
            <Text style={{ color: c.muted, fontSize: 18 }}>✕</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const btn = (label: string, onPress: () => void, testID?: string, primary = false, danger = false) => (
    <Pressable onPress={ro ? undefined : onPress} testID={testID} style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8, backgroundColor: primary ? c.primary : c.surfaceHigh, opacity: ro ? 0.5 : 1 }}>
      <Text style={{ color: primary ? c.onPrimary : danger ? c.danger : c.fg, fontWeight: primary ? "600" : "400" }}>{label}</Text>
    </Pressable>
  );

  const history = (() => {
    const out: { label: string; items: string[] }[] = [];
    if (s) out.push({ label: `Aktiver Abschnitt (${s.rule ? (describeRule(s.rule, s.anchor) ?? s.raw) : s.raw})`, items: [...[...s.C].map((d) => `${d}|erledigt`), ...[...s.S].map((d) => `${d}|übersprungen`)].sort().reverse() });
    const arch = t.data.recurrence_archive;
    if (Array.isArray(arch)) {
      for (const a of arch) {
        if (!a || typeof a !== "object" || Array.isArray(a)) continue;
        const r = a as Record<string, unknown>;
        const list = (k: string) => (Array.isArray(r[k]) ? [...new Set((r[k] as unknown[]).map(String))] : []);
        out.push({ label: `Archiv (${String(r.recurrence)}, ${r.closed_reason === "removed" ? "entfernt" : "Regel geändert"})`, items: [...list("complete_instances").map((d) => `${d}|erledigt`), ...list("skipped_instances").map((d) => `${d}|übersprungen`)].sort().reverse() });
      }
    }
    return out.filter((h) => h.items.length);
  })();

  const done = f.status === "done";
  // Runder Haken: ohne Serie erledigen/wiederöffnen, bei aktiver Serie das Vorkommen erledigen (Entscheidung 18.10.2026).
  const onCheck = s
    ? s.phase === "active"
      ? () => act({ type: "completeOccurrence", revision: s.revisionKey, instance: K }, "Vorkommen erledigt")
      : undefined
    : () => act(done ? { type: "reopen" } : { type: "complete" }, done ? "Wiederöffnet" : "Erledigt");
  const ring = prioColor(c, f.priority);
  const noteVisible = showNote || !!body.trim() || save === "failed" || save === "conflict";
  const due = dateParts("due");
  const sch = dateParts("scheduled");
  const addChecklistItem = () => {
    const sep = body && !body.endsWith("\n") ? "\n" : "";
    onBody(`${body}${sep}- [ ] `);
    setShowNote(true);
    setTab("edit");
    setTimeout(() => editor.current?.focus(), 50);
  };

  return (
    <Sheet onClose={() => nav.goBack()}>
      {/* Kopf des Blatts: Eingang/Einsortiert links, ⋮-Menü rechts */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 4, paddingBottom: 6 }}>
        <Pressable onPress={ro ? undefined : () => setMenu("inbox")} testID="field-inbox" accessibilityLabel={`${T.fields.inbox}: ${f.inbox ? "ja" : "nein"}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 6 }}>
          <InboxIcon color={f.inbox ? c.primary : c.muted} size={15} />
          <Text style={{ color: c.fg, fontSize: 15 }}>{f.inbox ? T.views.inbox : "Einsortiert"}</Text>
          <Text style={{ color: c.muted, fontSize: 18, marginTop: -2 }}>›</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setMenu("more")} testID="detail-menu" accessibilityLabel="Weitere Aktionen" hitSlop={6} style={{ width: 44, height: 40, alignItems: "center", justifyContent: "center" }}>
          <DotsIcon color={c.fg} size={18} />
        </Pressable>
      </View>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 24, gap: 10, minHeight: height * 0.5 }} keyboardShouldPersistTaps="handled" testID="detail">
        <View style={{ gap: 2 }}>
          <View style={[row, { alignItems: "flex-start", gap: 14, borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingVertical: 14 }]}>
            <Pressable
              onPress={ro ? undefined : onCheck}
              hitSlop={10}
              testID={s ? undefined : "toggle-done"}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done, disabled: ro || !onCheck }}
              accessibilityLabel={s ? "Vorkommen erledigen" : done ? T.actions.reopen : T.actions.complete}
              style={{ width: 24, height: 24, borderRadius: 12, borderWidth: f.priority === "none" ? 1.3 : 2, borderColor: done ? c.p4 : ring, backgroundColor: done ? c.p4 : f.priority === "none" ? "transparent" : `${ring}1A`, alignItems: "center", justifyContent: "center", marginTop: 3, opacity: onCheck ? 1 : 0.5 }}
            >
              {done && <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>✓</Text>}
            </Pressable>
            <TextInput
              value={title}
              editable={!ro}
              onChangeText={setTitle}
              onEndEditing={() => title.trim() && title !== f.title && act({ type: "setTitle", title }, "Titel geändert")}
              style={{ flex: 1, fontSize: 19, lineHeight: 26, fontWeight: "500", color: done ? c.muted : c.fg, padding: 0, textDecorationLine: done ? "line-through" : "none" }}
              multiline
              cursorColor={c.primary}
              testID="field-title"
              accessibilityLabel={T.fields.title}
            />
          </View>
          {view.diagnostics.map((d, i) => (
            <Text key={i} selectable style={[row, { color: d.severity === "error" ? c.danger : d.severity === "info" ? c.muted : c.warn }]}>
              {d.message}
            </Text>
          ))}
          {dateRow("due")}
          {dateRow("scheduled")}
          {s && (
            <Pressable onPress={ro ? undefined : () => nav.navigate("Recurrence", { ref })} style={[row, { gap: 14 }]} accessibilityLabel="Regel bearbeiten">
              <View style={{ width: 18, alignItems: "center" }}>
                <Glyph color={c.muted} size={18}>↻</Glyph>
              </View>
              <Text style={{ flex: 1, color: c.fg, fontSize: 16 }} testID="series-desc">
                {s.rule ? describeRule(s.rule, s.anchor) ?? s.raw : s.raw}
              </Text>
            </Pressable>
          )}
          {/* Fehlende Eigenschaften als Chips wie in der Vorlage */}
          <View style={[row, { flexWrap: "wrap", gap: 8, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }]}>
            {!noteVisible && <PropChip c={c} icon={<LinesIcon color={c.muted} size={14} />} label="Beschreibung" onPress={() => { setShowNote(true); setTimeout(() => editor.current?.focus(), 50); }} testID="show-note" />}
            <PropChip
              c={c}
              disabled={ro}
              icon={<FlagIcon color={f.priority === "none" ? c.muted : ring} size={14} />}
              label={f.priority === "none" ? T.fields.priority : `${T.fields.priority} ${T.priority[f.priority].toLowerCase()}`}
              onPress={() => setMenu("priority")}
              testID="field-priority"
            />
            {!due.date && !due.raw && <PropChip c={c} disabled={ro} icon={<CalendarIcon color={c.muted} size={14} />} label={T.fields.due} onPress={() => pickDate(null, (d) => due.set(d, ""))} testID="field-due" />}
            {!sch.date && !sch.raw && <PropChip c={c} disabled={ro} icon={<ClockIcon color={c.muted} size={14} />} label={T.fields.scheduled} onPress={() => pickDate(null, (d) => sch.set(d, ""))} testID="field-scheduled" />}
            {!s && <PropChip c={c} disabled={ro} icon={<Glyph color={c.muted} size={18}>↻</Glyph>} label="Wiederholung" onPress={() => nav.navigate("Recurrence", { ref })} testID="edit-recurrence" />}
            {f.status === "in-progress" && <PropChip c={c} disabled={ro} active icon={<Glyph color={c.p3} size={14}>▶</Glyph>} label={T.status["in-progress"]} onPress={() => act({ type: "setStatus", status: "open" }, "Status geändert")} testID="status-open" />}
          </View>
        </View>

        {s && (
          <View style={[card, { gap: 10 }]}>
            {s.instance && (
              <Text style={{ color: c.fg }}>
                Aktuelles Vorkommen: {describeOccurrence(s.instance)}
                {s.phase === "clarify" && s.proposal ? ` – Vorschlag: ${describeOccurrence(s.proposal)}` : ""}
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {s.phase === "active" && btn("Vorkommen erledigen", () => act({ type: "completeOccurrence", revision: s.revisionKey, instance: K }, "Vorkommen erledigt"), "series-complete", true)}
              {s.phase === "active" && btn(T.actions.skip, () => act({ type: "skipOccurrence", revision: s.revisionKey, instance: K }, "Übersprungen"), "series-skip")}
              {s.phase === "active" && btn("Erledigen und Serie beenden", () => act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: true }, "Serie beendet"), "series-end-complete")}
              {s.phase === "active" && btn("Serie ohne Erledigung beenden", () => act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: false }, "Serie beendet"), "series-end")}
              {s.phase === "ended" && reopen?.preview.result === "change" && btn("Serie wiederöffnen", () => act({ type: "reopenSeries", revision: s.revisionKey }, "Serie wiederöffnet"), "series-reopen")}
              {s.phase === "ended" && reopen?.preview.result === "blocked" && btn("Serie mit neuer Regel fortsetzen", () => nav.navigate("Recurrence", { ref, continueSeries: true }), "series-continue")}
              {btn("Regel bearbeiten", () => nav.navigate("Recurrence", { ref }), "edit-recurrence")}
              {btn("Wiederholung entfernen", () => act({ type: "removeRecurrence", revision: s.revisionKey }, "Wiederholung entfernt"))}
            </View>
            {previewLinesFor.length > 0 && (
              <View testID={s.phase === "ended" ? "reopen-preview" : "complete-preview"}>
                <Text style={{ color: c.muted, fontSize: 13 }}>{s.phase === "ended" ? "Beim Wiederöffnen:" : "Beim Erledigen:"}</Text>
                {previewLinesFor.map((l) => (
                  <Text key={l} style={{ color: c.muted, fontSize: 13 }}>• {l}</Text>
                ))}
              </View>
            )}
            {s.phase === "active" && s.anchor === "calendar" && (
              <View style={{ gap: 6 }} testID="exceptions">
                <Text style={{ color: c.muted, fontSize: 13 }}>Ausnahmen – nächste Termine (antippen zum Überspringen)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[...upcoming, ...extraSkipped.map((d) => ({ date: parseKey(d)!, skipped: true }))].map((u) => (
                    <Chip
                      key={u.date.toString()}
                      c={c}
                      disabled={ro}
                      active={u.skipped}
                      testID={`exception-${u.date}`}
                      label={`${u.skipped ? "✕ " : ""}${describeOccurrence(u.date).slice(0, 9)}`}
                      onPress={() =>
                        act(
                          { type: "setException", revision: s.revisionKey, date: u.date.toString(), skipped: !u.skipped },
                          u.skipped ? "Ausnahme entfernt" : "Termin wird übersprungen",
                        )
                      }
                    />
                  ))}
                  <Chip
                    c={c}
                    disabled={ro}
                    active={false}
                    testID="exception-add"
                    label="Weiteren Termin …"
                    onPress={() => pickDate(null, (d) => act({ type: "setException", revision: s.revisionKey, date: d, skipped: true }, "Termin wird übersprungen"))}
                  />
                </View>
              </View>
            )}
            {history.map((h, i) => (
              <View key={i}>
                <Text style={{ color: c.muted, fontSize: 13 }}>{h.label}</Text>
                {h.items.map((it) => {
                  const [d, what] = it.split("|");
                  const pd = parseKey(d);
                  return <Text key={it} style={{ color: c.fg, fontSize: 13 }}>Vorkommen {pd ? describeOccurrence(pd) : d} – {what}</Text>;
                })}
              </View>
            ))}
          </View>
        )}

        {noteVisible && (
          <View style={[card, { paddingHorizontal: 0, paddingTop: 4, paddingBottom: 4, gap: 0 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: c.outline }}>
              <LinesIcon color={c.muted} size={13} />
              {(["edit", "preview"] as const).map((x) => (
                <Pressable
                  key={x}
                  onPress={() => {
                    if (x === "preview") void flush();
                    setTab(x);
                  }}
                  testID={x === "preview" ? "tab-preview" : "tab-edit"}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === x }}
                  style={{ paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: tab === x ? c.primary : "transparent", marginBottom: -1 }}
                >
                  <Text style={{ color: tab === x ? c.fg : c.muted, fontWeight: tab === x ? "600" : "400" }}>{x === "edit" ? "Beschreibung" : "Vorschau"}</Text>
                </Pressable>
              ))}
              <Text style={{ marginLeft: "auto", paddingRight: 6, color: save === "failed" || save === "conflict" ? c.danger : c.muted, fontSize: 12 }} testID="save-state">
                {{ idle: "", pending: T.save.pending, draft: T.save.draft, saved: T.save.saved, failed: T.save.failed, conflict: T.save.conflict }[save]}
              </Text>
            </View>
            {tab === "edit" ? (
              <TextInput
                ref={editor}
                value={body}
                editable={!ro}
                onChangeText={onBody}
                onBlur={() => void flush()}
                multiline
                placeholder="Notiz (Markdown)"
                placeholderTextColor={c.muted}
                cursorColor={c.primary}
                style={{ minHeight: 160, textAlignVertical: "top", color: c.fg, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, lineHeight: 22 }}
                testID="editor"
              />
            ) : (
              <View style={{ height: 360, overflow: "hidden", borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
                <PreviewWeb html={html} onCheck={(line) => !ro && void flush().then(() => act({ type: "toggleCheckbox", line }, "Checkbox"))} />
              </View>
            )}
          </View>
        )}

        {save === "failed" && (
          <View style={[card, { gap: 8 }]} testID="save-failed">
            <Text selectable style={{ color: c.danger }}>Speichern fehlgeschlagen. Dein Entwurf ist lokal gesichert.</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip c={c} active={false} testID="retry-save" label="Erneut speichern" onPress={() => void repo.retryDraft(ref).then((o) => {
                notify(o, "Notiz");
                if (o.status === "ok" || o.status === "noop") { pending.current = false; setSave("saved"); }
              })} />
              <Chip c={c} active={false} testID="save-as-new" label="Als neue Datei speichern" onPress={() => void repo.saveDraftAsNew(ref).then((o) => notify(o, "Als neue Datei gespeichert"))} />
            </View>
          </View>
        )}
        {save === "conflict" && (
          <View style={[card, { gap: 8 }]} testID="draft-conflict">
            <Text selectable style={{ color: c.warn }}>Die Datei wurde extern geändert. Dein Entwurf ist lokal gesichert.</Text>
            {/* Datei-Version und eigener Entwurf bleiben sichtbar (7.3) */}
            <Text style={{ color: c.muted, fontSize: 12 }}>Unterschied Datei-Version → mein Entwurf</Text>
            <View style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 6, padding: 6 }}>
              {diffLines(t.body, body).map((part, j) => (
                <Text key={j} selectable style={{ fontFamily: "monospace", fontSize: 12, color: c.fg, backgroundColor: part.added ? "rgba(46,125,50,0.2)" : part.removed ? "rgba(198,40,40,0.2)" : "transparent" }}>
                  {part.value}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["mine", "file", "both"] as const).map((ch) => (
                <Chip
                  key={ch}
                  c={c}
                  active={false}
                  testID={`resolve-${ch}`}
                  label={{ mine: "Meine Version", file: "Datei-Version", both: "Beide behalten" }[ch]}
                  onPress={() =>
                    void repo.resolveDraftConflict(ref, ch).then((o) => {
                      notify(o, "Konflikt gelöst");
                      if (o.status === "ok" || o.status === "noop") {
                        pending.current = false;
                        setSave("saved");
                      }
                    })
                  }
                />
              ))}
            </View>
          </View>
        )}

        {!ro && (
          <Pressable onPress={addChecklistItem} testID="add-checklist" android_ripple={{ color: c.surfaceHigh }} style={[card, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 13 }]}>
            <PlusIcon color={c.primary} size={13} />
            <Text style={{ color: c.primary, fontSize: 15 }}>Checklistenpunkt hinzufügen</Text>
          </Pressable>
        )}
      </ScrollView>

      <Menu
        open={menu === "priority"}
        onClose={() => setMenu(null)}
        title={T.fields.priority}
        items={(["high", "normal", "low", "none"] as Priority[]).map((x) => ({
          label: T.priority[x],
          checked: f.priority === x,
          testID: `priority-${x}`,
          icon: <FlagIcon color={prioColor(c, x)} size={16} />,
          onPress: () => act({ type: "setPriority", priority: x }, "Priorität geändert"),
        }))}
      />
      <Menu
        open={menu === "inbox"}
        onClose={() => setMenu(null)}
        title={T.fields.inbox}
        items={[
          { label: "Im Eingang", checked: f.inbox, testID: "inbox-yes", icon: <InboxIcon color={c.muted} size={16} />, onPress: () => !f.inbox && act({ type: "setInbox", inbox: true }, "Zurück in den Eingang") },
          { label: "Einsortiert", checked: !f.inbox, testID: "inbox-no", icon: <CheckCircleIcon color={c.muted} size={16} />, onPress: () => f.inbox && act({ type: "setInbox", inbox: false }, "Einsortiert") },
        ]}
      />
      <Menu
        open={menu === "more"}
        onClose={() => setMenu(null)}
        title={f.title}
        items={[
          // Bei Serien kein „Erledigt“: Erledigen und Beenden nur über die Serienknöpfe (Entscheidung 18.10.2026).
          !ro && f.status !== "in-progress" && !done && { label: `Status: ${T.status["in-progress"]}`, testID: "status-in-progress", icon: <Glyph color={c.p3} size={14}>▶</Glyph>, onPress: () => act({ type: "setStatus", status: "in-progress" }, "Status geändert") },
          !ro && f.status === "in-progress" && { label: `Status: ${T.status.open}`, testID: "status-open-menu", icon: <Glyph color={c.muted} size={14}>○</Glyph>, onPress: () => act({ type: "setStatus", status: "open" }, "Status geändert") },
          !ro && { label: s ? "Regel bearbeiten" : "Wiederholung …", icon: <Glyph color={c.muted} size={16}>↻</Glyph>, onPress: () => nav.navigate("Recurrence", { ref }) },
          !ro && { label: T.actions.renameToTitle, icon: <Glyph color={c.muted} size={15}>✎</Glyph>, onPress: () => void repo.renameToTitle(ref).then((o) => notify(o, "Umbenannt")) },
          !ro && {
            label: T.actions.delete,
            danger: true,
            testID: "delete",
            icon: <Glyph color={c.danger} size={16}>🗑</Glyph>,
            onPress: () => void repo.moveToTrash(ref).then((o) => { notify(o, "Gelöscht"); if (o.status === "ok") nav.goBack(); }),
          },
        ]}
      />
    </Sheet>
  );
}

function PreviewWeb({ html, onCheck }: { html: string; onCheck(line: number): void }) {
  return (
    <WebView
      originWhitelist={["about:blank"]}
      source={{ html }}
      javaScriptEnabled
      testID="preview"
      onMessage={(e) => {
        try {
          const m = JSON.parse(e.nativeEvent.data) as { check?: number; link?: string };
          if (typeof m.check === "number") onCheck(m.check);
          else if (m.link && /^https?:\/\//i.test(m.link)) void Linking.openURL(m.link);
        } catch {
          /* ignorieren */
        }
      }}
      onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
    />
  );
}
