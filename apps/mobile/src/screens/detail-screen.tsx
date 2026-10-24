// Detailansicht Android (4.4): Felder, Serie, Notiz mit Autosave und WebView-Vorschau.
// Gestaltung: Blatt über der Liste; Eigenschaftskarte (Titel, Termine, Regel, fehlende Felder als Chips),
// Serienkarte mit Vorkommen-Streifen (Verlauf, aktuell, nächste Termine) und Beschreibungskarte.
// Seltene Serienaktionen liegen im Aktionsblatt (⋯), der volle Verlauf auf einem eigenen Screen.
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { diffLines } from "diff";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { pastSkippedCount, previewAction, renderMarkdown, seriesStrip, skippedBeyondStrip, splitDateValue, stripByMonth as byMonth, T, type Outcome, type StripCell } from "@markdoist/app";
import {
  describeOccurrence,
  describeRule,
  formatGermanDate,
  parseKey,
  Temporal,
  type Priority,
  type TaskAction,
} from "@markdoist/core";
import { pickDate } from "../components/actions-sheet";
import { systemClock, useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import { prioColor, useTheme, type Theme } from "../theme";
import { dateLabel, toneColor } from "../format";
import { Menu } from "../components/menu";
import { GroupedSheet } from "../components/series-sheet";
import {
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  DotsIcon,
  FlagIcon,
  Glyph,
  InboxIcon,
  LinesIcon,
  PlusIcon,
  RepeatIcon,
  SkipIcon,
  StopIcon,
} from "../components/icons";
import type { RootStack } from "../navigation";

type SaveState = "idle" | "pending" | "draft" | "saved" | "failed" | "conflict";

const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Umrandeter Chip für ein fehlendes Feld („+ Priorität“ usw.). */
function AddChip({ label, icon, onPress, c, testID, disabled, active }: { label: string; icon: ReactNode; onPress(): void; c: Theme; testID?: string; disabled?: boolean; active?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        height: 36,
        paddingLeft: 12,
        paddingRight: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: active ? c.primaryContainer : c.outline,
        backgroundColor: active ? c.primaryContainer : c.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      <Text style={{ color: c.fg, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Gefüllte Pillen-Schaltfläche (Überspringen, Wiederöffnen, Entwurf speichern …). */
function Pill({ label, icon, onPress, c, testID, disabled, primary }: { label: string; icon?: ReactNode; onPress(): void; c: Theme; testID?: string; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: primary ? c.primary : c.surfaceHigh, opacity: disabled ? 0.5 : 1 }}
    >
      {icon}
      <Text style={{ color: primary ? c.onPrimary : c.fg, fontSize: 14, fontWeight: "500" }}>{label}</Text>
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
      <Animated.View entering={SlideInDown.duration(220)} style={{ flexShrink: 1, backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10 }}>
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.outline, marginBottom: 4 }} />
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

/** Ein Vorkommen im Streifen: Kopfzeile (Wochentag oder Monat) über dem Tageskreis. */
function StripDay({ cell, label, c, ro, onToggle }: { cell: StripCell; label: string; c: Theme; ro: boolean; onToggle?(): void }) {
  const { kind, date } = cell;
  const current = kind === "current";
  const future = kind === "future" || kind === "future-skipped";
  const skipped = kind === "skipped" || kind === "future-skipped";
  const circle = { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" } as const;
  const occ = describeOccurrence(date);
  const a11y = current
    ? `Aktuelles Vorkommen: ${occ}`
    : kind === "done"
      ? `${occ}: erledigt`
      : kind === "skipped"
        ? `${occ}: übersprungen`
        : kind === "future-skipped"
          ? `${occ}: wird übersprungen, antippen zum Zurücknehmen`
          : `${occ}: antippen zum Überspringen`;
  const body = (
    <>
      <Text style={{ color: current ? c.primary : c.muted, fontSize: 11, fontWeight: current ? "700" : "400" }}>{label}</Text>
      {kind === "done" ? (
        <View style={[circle, { backgroundColor: c.doneContainer }]}>
          <CheckIcon color={c.onDoneContainer} size={16} />
        </View>
      ) : (
        <View
          style={[
            circle,
            current && { borderWidth: 2, borderColor: c.primary },
            skipped && { borderWidth: 1.5, borderStyle: "dashed", borderColor: c.muted },
            kind === "future" && { backgroundColor: c.bg },
          ]}
        >
          <Text style={{ color: current ? c.primary : skipped ? c.muted : c.fg, fontSize: 15, fontWeight: current ? "700" : "400", textDecorationLine: skipped ? "line-through" : "none" }}>{date.day}</Text>
        </View>
      )}
    </>
  );
  const box = { flex: 1, alignItems: "center", gap: 6, paddingTop: 6, paddingBottom: 8, minHeight: 70, borderRadius: 12 } as const;
  if (future && onToggle) {
    return (
      <Pressable onPress={ro ? undefined : onToggle} testID={`exception-${date}`} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: skipped, disabled: ro }} android_ripple={{ color: c.surfaceHigh, borderless: false }} style={box}>
        {body}
      </Pressable>
    );
  }
  return (
    <View style={box} accessible accessibilityLabel={a11y} testID={current ? "series-current" : undefined}>
      {body}
    </View>
  );
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
  const [menu, setMenu] = useState<"priority" | "inbox" | "more" | "series" | "due" | "scheduled" | null>(null);
  const [showNote, setShowNote] = useState(false);
  const editor = useRef<ComponentRef<typeof TextInput>>(null);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const card = { backgroundColor: c.surface, borderRadius: 18, overflow: "hidden" } as const;
  const divider = (inset = 54) => <View style={{ height: 1, backgroundColor: c.divider, marginLeft: inset }} />;

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
  // Streifen: bis zu drei nächste Termine (nur Kalenderserien), das aktuelle Vorkommen und davor der Verlauf.
  const strip = s ? seriesStrip(s) : [];
  const extraSkipped = s ? skippedBeyondStrip(s, strip) : [];

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

  // Gesetzter Termin als Zeile: Tippen wählt das Datum, rechts Uhrzeit und Entfernen (Auswahlblatt).
  const dateRow = (field: "due" | "scheduled") => {
    const { raw, date, time, set } = dateParts(field);
    if (!date && !(raw && !f[field])) return null;
    const v = field === "due" ? view.due : view.scheduled;
    const label = v ? dateLabel(v, state.index.today, tz, field === "due" && view.overdue) : null;
    const tone = label?.tone ?? "later";
    const color = field === "due" ? toneColor(c, tone) : c.muted;
    // „Heute“, „Morgen“, Wochentag als Zusatz; ferne Termine stehen schon vollständig im Datum.
    const rel = field === "due" && tone === "overdue" ? T.badges.overdue : label && tone !== "later" && tone !== "overdue" ? label.text.replace(/ \d\d:\d\d$/, "") : "";
    return (
      <>
        {divider()}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 8, minHeight: 58 }}>
          <Pressable onPress={ro ? undefined : () => pickDate(date || null, (d) => set(d, time))} testID={`field-${field}`} accessibilityLabel={T.fields[field]} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 }}>
            <View style={{ width: 22, alignItems: "center" }}>{field === "due" ? <CalendarIcon color={color} size={18} /> : <ClockIcon color={color} size={18} />}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: date ? c.fg : c.warn, fontSize: 16, fontWeight: "500" }}>{date ? formatGermanDate(Temporal.PlainDate.from(date)) : `ungültig: ${raw}`}</Text>
              <Text style={{ color: tone === "overdue" && field === "due" ? c.danger : c.muted, fontSize: 12, marginTop: 1 }}>
                {T.fields[field]}
                {rel ? ` · ${rel}` : ""}
              </Text>
            </View>
          </Pressable>
          {time ? (
            <Pressable onPress={ro ? undefined : () => setMenu(field)} testID={`time-${field}`} accessibilityLabel={`Uhrzeit ${time}, Optionen`} style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: c.bg, justifyContent: "center" }}>
              <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{time}</Text>
            </Pressable>
          ) : (
            !ro && (
              <Pressable onPress={() => setMenu(field)} testID={`time-${field}`} accessibilityLabel={`${T.fields[field]}: Uhrzeit und Entfernen`} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
                <ClockIcon color={c.muted} size={18} />
              </Pressable>
            )
          )}
        </View>
      </>
    );
  };
  const dateMenu = (field: "due" | "scheduled") => {
    const { date, time, set } = dateParts(field);
    return (
      <Menu
        open={menu === field}
        onClose={() => setMenu(null)}
        title={T.fields[field]}
        items={[
          !!date && { label: time ? "Uhrzeit ändern" : "Uhrzeit hinzufügen", icon: <ClockIcon color={c.muted} size={16} />, onPress: () => pickTime(time || "09:00", (tm) => set(date, tm)) },
          !!date && !!time && { label: "Uhrzeit entfernen", icon: <Glyph color={c.muted} size={16}>⌫</Glyph>, onPress: () => set(date, "") },
          { label: `${T.fields[field]} entfernen`, danger: true, testID: `clear-${field}`, icon: <Glyph color={c.danger} size={16}>✕</Glyph>, onPress: () => set("", "") },
        ]}
      />
    );
  };

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

  const stripByMonth = byMonth(strip);
  const toggleException = (d: Temporal.PlainDate, skipped: boolean) =>
    s && act({ type: "setException", revision: s.revisionKey, date: d.toString(), skipped: !skipped }, skipped ? "Ausnahme entfernt" : "Termin wird übersprungen");

  const preview = complete?.preview ?? null;
  const nextDate = preview?.result === "change" && !preview.ended ? preview.instance : null;
  // Zusatzhinweise der Vorschau ohne die Zeilen, die Streifen und Terminzeilen schon zeigen.
  const hidden = [`${T.preview.nextOccurrence}:`, `${T.preview.firstOccurrence}:`, `${T.fields.due}:`, `${T.fields.scheduled}:`];
  const notes = (complete?.lines ?? []).filter((l) => l !== T.preview.ends && !hidden.some((h) => l.startsWith(h)));
  const pastSkipped = s ? pastSkippedCount(s) : 0;
  const hasArchive = Array.isArray(t.data.recurrence_archive) && t.data.recurrence_archive.length > 0;
  const occ = s?.instance ? describeOccurrence(s.instance) : "";
  const ruleText = s ? (s.rule ? (describeRule(s.rule, s.anchor) ?? s.raw) : s.raw) : "";
  const phaseTitle = !s ? "" : s.phase === "ended" ? "Serie beendet" : s.phase === "clarify" ? "Serie · Fortschreibung klären" : s.phase === "active" ? "Serie" : "Serie · gesperrt";

  return (
    <Sheet onClose={() => nav.goBack()}>
      {/* Kopf des Blatts: Eingang/Einsortiert links, ⋮-Menü rechts */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 6, paddingTop: 4, paddingBottom: 8 }}>
        <Pressable
          onPress={ro ? undefined : () => setMenu("inbox")}
          testID="field-inbox"
          accessibilityLabel={`${T.fields.inbox}: ${f.inbox ? "ja" : "nein"}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingLeft: 12, paddingRight: 10, borderRadius: 20, backgroundColor: c.surfaceHigh }}
        >
          <InboxIcon color={f.inbox ? c.primary : c.muted} size={15} />
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{f.inbox ? T.views.inbox : "Einsortiert"}</Text>
          {!ro && <ChevronIcon color={c.muted} size={12} dir="down" />}
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setMenu("more")} testID="detail-menu" accessibilityLabel="Weitere Aktionen" style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
          <DotsIcon color={c.fg} size={18} />
        </Pressable>
      </View>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, gap: 12, minHeight: height * 0.5 }} keyboardShouldPersistTaps="handled" testID="detail">
        {/* Eigenschaftskarte */}
        <View style={card}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingLeft: 8, paddingRight: 16, paddingTop: 10, paddingBottom: 10 }}>
            <Pressable
              onPress={ro ? undefined : onCheck}
              testID={s ? (s.phase === "active" ? "series-complete" : undefined) : "toggle-done"}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done, disabled: ro || !onCheck }}
              accessibilityLabel={s ? `Vorkommen ${occ} erledigen` : done ? T.actions.reopen : T.actions.complete}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: f.priority === "none" ? 1.5 : 2, borderColor: done ? c.p4 : ring, backgroundColor: done ? c.p4 : f.priority === "none" ? "transparent" : `${ring}1A`, alignItems: "center", justifyContent: "center", opacity: onCheck ? 1 : 0.5 }}>
                {done && <CheckIcon color="#fff" size={14} weight={2} />}
              </View>
            </Pressable>
            <TextInput
              value={title}
              editable={!ro}
              onChangeText={setTitle}
              onEndEditing={() => title.trim() && title !== f.title && act({ type: "setTitle", title }, "Titel geändert")}
              style={{ flex: 1, fontSize: 20, lineHeight: 26, fontWeight: "500", color: done ? c.muted : c.fg, paddingTop: 9, paddingBottom: 4, paddingHorizontal: 0, textDecorationLine: done ? "line-through" : "none" }}
              multiline
              cursorColor={c.primary}
              testID="field-title"
              accessibilityLabel={T.fields.title}
            />
          </View>
          {view.diagnostics.map((d, i) => (
            <Text key={i} selectable style={{ color: d.severity === "error" ? c.danger : d.severity === "info" ? c.muted : c.warn, fontSize: 13, paddingLeft: 64, paddingRight: 16, paddingBottom: 10 }}>
              {d.message}
            </Text>
          ))}
          {dateRow("due")}
          {dateRow("scheduled")}
          {s && (
            <>
              {divider()}
              <Pressable onPress={ro ? undefined : () => nav.navigate("Recurrence", { ref })} accessibilityLabel="Regel bearbeiten" style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 16, paddingRight: 14, minHeight: 58 }}>
                <View style={{ width: 22, alignItems: "center" }}>
                  <RepeatIcon color={c.muted} size={17} />
                </View>
                <View style={{ flex: 1, paddingVertical: 8 }}>
                  <Text style={{ color: c.fg, fontSize: 16, fontWeight: "500" }} testID="series-desc">
                    {ruleText}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 12, marginTop: 1 }}>Wiederholung · {s.anchor === "calendar" ? "nach Kalender" : "ab Erledigung"}</Text>
                </View>
                {!ro && <ChevronIcon color={c.muted} size={14} />}
              </Pressable>
            </>
          )}
          {f.priority !== "none" && (
            <>
              {divider()}
              <Pressable onPress={ro ? undefined : () => setMenu("priority")} testID="field-priority" accessibilityLabel={`${T.fields.priority}: ${T.priority[f.priority]}`} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 16, paddingRight: 14, minHeight: 58 }}>
                <View style={{ width: 22, alignItems: "center" }}>
                  <FlagIcon color={ring} size={17} />
                </View>
                <View style={{ flex: 1, paddingVertical: 8 }}>
                  <Text style={{ color: c.fg, fontSize: 16, fontWeight: "500" }}>{T.priority[f.priority]}</Text>
                  <Text style={{ color: c.muted, fontSize: 12, marginTop: 1 }}>{T.fields.priority}</Text>
                </View>
              </Pressable>
            </>
          )}
          {/* Fehlende Eigenschaften als Chips */}
          {(() => {
            const chips = [
              f.status === "in-progress" && <AddChip key="status" c={c} disabled={ro} active icon={<Glyph color={c.p3} size={12}>▶</Glyph>} label={T.status["in-progress"]} onPress={() => act({ type: "setStatus", status: "open" }, "Status geändert")} testID="status-open" />,
              f.priority === "none" && <AddChip key="prio" c={c} disabled={ro} icon={<FlagIcon color={c.muted} size={14} />} label={T.fields.priority} onPress={() => setMenu("priority")} testID="field-priority" />,
              !due.date && !due.raw && <AddChip key="due" c={c} disabled={ro} icon={<CalendarIcon color={c.muted} size={14} />} label={T.fields.due} onPress={() => pickDate(null, (d) => due.set(d, ""))} testID="field-due" />,
              !sch.date && !sch.raw && <AddChip key="sch" c={c} disabled={ro} icon={<ClockIcon color={c.muted} size={14} />} label={T.fields.scheduled} onPress={() => pickDate(null, (d) => sch.set(d, ""))} testID="field-scheduled" />,
              !s && <AddChip key="rec" c={c} disabled={ro} icon={<RepeatIcon color={c.muted} size={14} />} label="Wiederholen" onPress={() => nav.navigate("Recurrence", { ref })} testID="edit-recurrence" />,
              !noteVisible && <AddChip key="note" c={c} icon={<LinesIcon color={c.muted} size={13} />} label="Beschreibung" onPress={() => { setShowNote(true); setTimeout(() => editor.current?.focus(), 50); }} testID="show-note" />,
              !noteVisible && !ro && <AddChip key="check" c={c} icon={<PlusIcon color={c.muted} size={11} />} label="Checkliste" onPress={addChecklistItem} testID="add-checklist" />,
            ].filter(Boolean);
            return chips.length ? (
              <>
                {divider(0)}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 14 }}>{chips}</View>
              </>
            ) : null;
          })()}
        </View>

        {/* Serienkarte */}
        {s && (
          <View style={card} testID="series-card">
            <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, minHeight: 44 }}>
              <Text style={{ flex: 1, color: c.muted, fontSize: 13, fontWeight: "600" }}>{phaseTitle}</Text>
              {!ro && (
                <Pressable onPress={() => setMenu("series")} testID="series-menu" accessibilityLabel="Serien-Aktionen" style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
                  <View style={{ transform: [{ rotate: "90deg" }] }}>
                    <DotsIcon color={c.muted} size={16} />
                  </View>
                </Pressable>
              )}
            </View>
            {strip.length > 0 && (
              <View style={{ flexDirection: "row", gap: 2, paddingHorizontal: 8 }} testID="exceptions">
                {strip.map((cell) => (
                  <StripDay
                    key={cell.date.toString()}
                    cell={cell}
                    c={c}
                    ro={ro}
                    label={stripByMonth ? MONTHS_SHORT[cell.date.month - 1]! : WD_SHORT[cell.date.dayOfWeek - 1]!}
                    onToggle={cell.kind === "future" || cell.kind === "future-skipped" ? () => toggleException(cell.date, cell.kind === "future-skipped") : undefined}
                  />
                ))}
                {Array.from({ length: Math.max(0, 7 - strip.length) }, (_, i) => (
                  <View key={`pad${i}`} style={{ flex: 1 }} />
                ))}
              </View>
            )}
            {extraSkipped.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 4 }}>
                <Text style={{ color: c.muted, fontSize: 12 }}>Später übersprungen:</Text>
                {extraSkipped.map((d) => (
                  <Pressable key={d} onPress={ro ? undefined : () => toggleException(parseKey(d)!, true)} testID={`exception-${d}`} accessibilityLabel={`${describeOccurrence(parseKey(d)!)}: wird übersprungen, antippen zum Zurücknehmen`} hitSlop={6} style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: c.muted, justifyContent: "center" }}>
                    <Text style={{ color: c.muted, fontSize: 12, textDecorationLine: "line-through" }}>{describeOccurrence(parseKey(d)!).slice(0, 9)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {s.phase === "clarify" && s.proposal && (
              <Text style={{ color: c.warn, fontSize: 13, paddingHorizontal: 16, paddingTop: 6 }}>Vorschlag für das nächste Vorkommen: {describeOccurrence(s.proposal)}</Text>
            )}
            {/* Was beim Erledigen passiert, daneben Überspringen */}
            {s.phase === "active" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 12, paddingTop: 8, paddingBottom: 14 }}>
                <View style={{ flex: 1 }} testID="complete-preview">
                  {nextDate ? (
                    <View accessible accessibilityLabel={`${T.preview.nextOccurrence}: ${formatGermanDate(nextDate)}`} testID="series-next">
                      <Text style={{ color: c.muted, fontSize: 12 }}>Danach</Text>
                      <Text style={{ color: c.fg, fontSize: 15, fontWeight: "500", marginTop: 1 }}>{formatGermanDate(nextDate)}</Text>
                    </View>
                  ) : preview?.ended ? (
                    <Text style={{ color: c.muted, fontSize: 13 }}>{T.preview.ends}</Text>
                  ) : null}
                  {notes.map((l) => (
                    <Text key={l} style={{ color: c.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>
                      {l}
                    </Text>
                  ))}
                </View>
                <Pill c={c} disabled={ro} label={T.actions.skip} icon={<SkipIcon color={c.fg} size={13} />} onPress={() => act({ type: "skipOccurrence", revision: s.revisionKey, instance: K }, "Übersprungen")} testID="series-skip" />
              </View>
            )}
            {s.phase === "ended" && (
              <View style={{ gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}>
                {(reopen?.lines.length ?? 0) > 0 && (
                  <View testID="reopen-preview">
                    {reopen!.lines.map((l) => (
                      <Text key={l} style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>
                        {l}
                      </Text>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: "row" }}>
                  {reopen?.preview.result === "change" && <Pill c={c} disabled={ro} primary label="Serie wiederöffnen" onPress={() => act({ type: "reopenSeries", revision: s.revisionKey }, "Serie wiederöffnet")} testID="series-reopen" />}
                  {reopen?.preview.result === "blocked" && <Pill c={c} disabled={ro} label="Mit neuer Regel fortsetzen" icon={<RepeatIcon color={c.fg} size={14} />} onPress={() => nav.navigate("Recurrence", { ref, continueSeries: true })} testID="series-continue" />}
                </View>
              </View>
            )}
            {s.phase !== "active" && s.phase !== "ended" && <View style={{ height: 10 }} />}
            {(s.C.size > 0 || s.S.size > 0 || hasArchive) && (
              <Pressable onPress={() => nav.navigate("SeriesHistory", { ref })} testID="series-history" android_ripple={{ color: c.surfaceHigh }} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingLeft: 16, paddingRight: 12, borderTopWidth: 1, borderTopColor: c.divider }}>
                <Text style={{ flex: 1, color: c.muted, fontSize: 14 }}>
                  <Text style={{ color: c.fg, fontWeight: "600" }}>{s.C.size}</Text> erledigt · <Text style={{ color: c.fg, fontWeight: "600" }}>{pastSkipped}</Text> übersprungen
                </Text>
                <Text style={{ color: c.primary, fontSize: 14, fontWeight: "500" }}>Verlauf</Text>
                <ChevronIcon color={c.primary} size={12} />
              </Pressable>
            )}
          </View>
        )}

        {/* Beschreibungskarte */}
        {noteVisible && (
          <View style={card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 16, paddingRight: 8, minHeight: 52 }}>
              <LinesIcon color={c.muted} size={14} />
              <Text style={{ color: c.muted, fontSize: 13, fontWeight: "600" }}>Beschreibung</Text>
              <Text style={{ flex: 1, textAlign: "right", color: save === "failed" || save === "conflict" ? c.danger : c.muted, fontSize: 12 }} numberOfLines={1} testID="save-state">
                {{ idle: "", pending: T.save.pending, draft: T.save.draft, saved: T.save.saved, failed: T.save.failed, conflict: T.save.conflict }[save]}
              </Text>
              <View style={{ flexDirection: "row", padding: 3, borderRadius: 10, backgroundColor: c.bg }} accessibilityRole="tablist">
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
                    hitSlop={{ top: 6, bottom: 6 }}
                    style={{ height: 30, paddingHorizontal: 12, borderRadius: 8, justifyContent: "center", backgroundColor: tab === x ? c.surface : "transparent", boxShadow: tab === x ? "0 1px 2px rgba(0,0,0,0.10)" : undefined }}
                  >
                    <Text style={{ color: tab === x ? c.fg : c.muted, fontSize: 13, fontWeight: tab === x ? "500" : "400" }}>{x === "edit" ? "Text" : "Vorschau"}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {tab === "edit" ? (
              <TextInput
                ref={editor}
                value={body}
                editable={!ro}
                onChangeText={onBody}
                onBlur={() => void flush()}
                multiline
                placeholder="Notiz in Markdown …"
                placeholderTextColor={c.muted}
                cursorColor={c.primary}
                style={{ minHeight: 120, textAlignVertical: "top", color: c.fg, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, fontSize: 15, lineHeight: 22 }}
                testID="editor"
              />
            ) : (
              <View style={{ height: 360, overflow: "hidden" }}>
                <PreviewWeb html={html} onCheck={(line) => !ro && void flush().then(() => act({ type: "toggleCheckbox", line }, "Checkbox"))} />
              </View>
            )}
            {!ro && (
              <Pressable onPress={addChecklistItem} testID="add-checklist" android_ripple={{ color: c.surfaceHigh }} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: c.divider }}>
                <PlusIcon color={c.primary} size={12} />
                <Text style={{ color: c.primary, fontSize: 14, fontWeight: "500" }}>Checklistenpunkt</Text>
              </Pressable>
            )}
          </View>
        )}

        {save === "failed" && (
          <View style={[card, { padding: 16, gap: 12 }]} testID="save-failed">
            <Text selectable style={{ color: c.danger }}>Speichern fehlgeschlagen. Dein Entwurf ist lokal gesichert.</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pill c={c} primary testID="retry-save" label="Erneut speichern" onPress={() => void repo.retryDraft(ref).then((o) => {
                notify(o, "Notiz");
                if (o.status === "ok" || o.status === "noop") { pending.current = false; setSave("saved"); }
              })} />
              <Pill c={c} testID="save-as-new" label="Als neue Datei speichern" onPress={() => void repo.saveDraftAsNew(ref).then((o) => notify(o, "Als neue Datei gespeichert"))} />
            </View>
          </View>
        )}
        {save === "conflict" && (
          <View style={[card, { padding: 16, gap: 10 }]} testID="draft-conflict">
            <Text selectable style={{ color: c.warn }}>Die Datei wurde extern geändert. Dein Entwurf ist lokal gesichert.</Text>
            {/* Datei-Version und eigener Entwurf bleiben sichtbar (7.3) */}
            <Text style={{ color: c.muted, fontSize: 12 }}>Unterschied Datei-Version → mein Entwurf</Text>
            <View style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 10, padding: 8 }}>
              {diffLines(t.body, body).map((part, j) => (
                <Text key={j} selectable style={{ fontFamily: "monospace", fontSize: 12, color: c.fg, backgroundColor: part.added ? "rgba(46,125,50,0.2)" : part.removed ? "rgba(198,40,40,0.2)" : "transparent" }}>
                  {part.value}
                </Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["mine", "file", "both"] as const).map((ch) => (
                <Pill
                  key={ch}
                  c={c}
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
      {dateMenu("due")}
      {dateMenu("scheduled")}
      <Menu
        open={menu === "more"}
        onClose={() => setMenu(null)}
        title={f.title}
        items={[
          // Bei Serien kein „Erledigt“: Erledigen und Beenden nur über die Serienaktionen (Entscheidung 18.10.2026).
          !ro && f.status !== "in-progress" && !done && { label: `Status: ${T.status["in-progress"]}`, testID: "status-in-progress", icon: <Glyph color={c.p3} size={14}>▶</Glyph>, onPress: () => act({ type: "setStatus", status: "in-progress" }, "Status geändert") },
          !ro && f.status === "in-progress" && { label: `Status: ${T.status.open}`, testID: "status-open-menu", icon: <Glyph color={c.muted} size={14}>○</Glyph>, onPress: () => act({ type: "setStatus", status: "open" }, "Status geändert") },
          !ro && !s && { label: "Wiederholung …", icon: <RepeatIcon color={c.muted} size={15} />, onPress: () => nav.navigate("Recurrence", { ref }) },
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
      {s && (
        <GroupedSheet
          open={menu === "series"}
          onClose={() => setMenu(null)}
          title={`Serie „${f.title}“`}
          subtitle={occ ? `${ruleText} · ${s.phase === "ended" ? "zuletzt" : "aktuell"} ${occ}` : ruleText}
          icon={<RepeatIcon color={c.primary} size={18} />}
          groups={[
            {
              items: [
                { label: "Regel bearbeiten", icon: <Glyph color={c.muted} size={16}>✎</Glyph>, testID: "series-edit", onPress: () => nav.navigate("Recurrence", { ref }) },
                s.phase === "active" &&
                  s.anchor === "calendar" && {
                    label: "Termin überspringen …",
                    description: "Einen bestimmten künftigen Termin auslassen.",
                    icon: <SkipIcon color={c.muted} size={14} />,
                    testID: "exception-add",
                    onPress: () => pickDate(null, (d) => act({ type: "setException", revision: s.revisionKey, date: d, skipped: true }, "Termin wird übersprungen")),
                  },
              ],
            },
            {
              heading: "Serie beenden",
              items: [
                s.phase === "active" && {
                  label: "Erledigen und beenden",
                  description: `${occ} zählt als erledigt, danach keine Termine mehr.`,
                  icon: <CheckCircleIcon color={c.toneToday} size={18} />,
                  testID: "series-end-complete",
                  onPress: () => act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: true }, "Serie beendet"),
                },
                s.phase === "active" && {
                  label: "Nur beenden",
                  description: `Ohne ${occ} zu erledigen. Die Aufgabe wird abgeschlossen.`,
                  icon: <StopIcon color={c.muted} size={18} />,
                  testID: "series-end",
                  onPress: () => act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: false }, "Serie beendet"),
                },
              ],
            },
            {
              items: [
                {
                  label: "Wiederholung entfernen",
                  description: "Die Aufgabe bleibt als einmalige Aufgabe. Der Verlauf wird archiviert.",
                  icon: <RepeatIcon color={c.danger} size={17} />,
                  danger: true,
                  testID: "series-remove",
                  onPress: () => act({ type: "removeRecurrence", revision: s.revisionKey }, "Wiederholung entfernt"),
                },
              ],
            },
          ]}
        />
      )}
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
