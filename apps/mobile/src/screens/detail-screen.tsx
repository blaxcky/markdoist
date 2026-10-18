// Detailansicht Android (4.4): Felder, Serie, Notiz mit Autosave und WebView-Vorschau.
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
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
  type Status,
  type TaskAction,
} from "@markdoist/core";
import { pickDate } from "../components/actions-sheet";
import { systemClock, useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import { useTheme, type Theme } from "../theme";
import type { RootStack } from "../navigation";

type SaveState = "idle" | "pending" | "draft" | "saved" | "failed" | "conflict";

function Chip({ label, active, onPress, c, testID, disabled }: { label: string; active: boolean; onPress(): void; c: Theme; testID?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      testID={testID}
      accessibilityState={{ selected: active, disabled }}
      style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: active ? c.primary : c.outline, backgroundColor: active ? c.primaryContainer : "transparent", opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ color: c.fg }}>{label}</Text>
    </Pressable>
  );
}

function previewHtml(body: string, c: Theme): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;font-size:16px;color:${c.fg};background:${c.bg};margin:12px;line-height:1.5}
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
  const [save, setSave] = useState<SaveState>(draft !== null ? "draft" : "idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const html = useMemo(() => (tab === "preview" ? previewHtml(body, c) : ""), [tab, body, c]);

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
    if (o.status === "ok" || o.status === "noop") setSave("saved");
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
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24 }}>
        <Text style={{ color: c.muted }}>Die Aufgabe ist nicht mehr vorhanden.</Text>
        {draft !== null && (
          <Pressable onPress={() => void repo.saveDraftAsNew(ref, "Wiederhergestellter Entwurf").then((o) => notify(o, "Als neue Datei gespeichert"))} style={{ marginTop: 16 }}>
            <Text style={{ color: c.primary }}>Entwurf als neue Datei speichern</Text>
          </Pressable>
        )}
      </View>
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

  const dateRow = (field: "due" | "scheduled") => {
    const raw = typeof t.data[field] === "string" ? (t.data[field] as string) : null;
    // Werte mit Offset in Ortszeit anzeigen (3.3); erst eine Bearbeitung schreibt lokal.
    const { date, time } = splitDateValue(raw, systemClock().timeZone);
    const set = (d: string, tm: string) => act({ type: "setDate", field, value: d ? (tm ? `${d}T${tm}` : d) : null }, field === "due" ? "Frist geändert" : "Planung geändert");
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>{T.fields[field]}</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Chip c={c} disabled={ro} testID={`field-${field}`} label={date ? formatGermanDate(Temporal.PlainDate.from(date)) : "Datum wählen"} active={!!date} onPress={() => pickDate(date || null, (d) => set(d, time))} />
          {date && (time ? (
            <Chip c={c} disabled={ro} label={time} active onPress={() => {
              const [h, mi] = time.split(":").map(Number);
              DateTimePickerAndroid.open({ value: new Date(2000, 0, 1, h, mi), mode: "time", is24Hour: true, onChange: (e, d) => e.type === "set" && d && set(date, `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`) });
            }} />
          ) : (
            <Chip c={c} disabled={ro} label="Uhrzeit hinzufügen" active={false} onPress={() => set(date, "09:00")} />
          ))}
          {date && <Chip c={c} disabled={ro} label="✕" active={false} onPress={() => set("", "")} testID={`clear-${field}`} />}
          {raw && !f[field] && <Text style={{ color: c.warn }}>ungültig: {raw}</Text>}
        </View>
      </View>
    );
  };

  const btn = (label: string, onPress: () => void, testID?: string, primary = false, danger = false) => (
    <Pressable onPress={ro ? undefined : onPress} testID={testID} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: primary ? c.primary : "transparent", borderWidth: primary ? 0 : 1, borderColor: c.outline, opacity: ro ? 0.5 : 1 }}>
      <Text style={{ color: primary ? c.onPrimary : danger ? c.danger : c.fg }}>{label}</Text>
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

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled" testID="detail">
      <TextInput
        value={title}
        editable={!ro}
        onChangeText={setTitle}
        onEndEditing={() => title.trim() && title !== f.title && act({ type: "setTitle", title }, "Titel geändert")}
        style={{ fontSize: 22, fontWeight: "600", color: c.fg, padding: 0 }}
        multiline
        testID="field-title"
        accessibilityLabel={T.fields.title}
      />
      {view.diagnostics.map((d, i) => (
        <Text key={i} selectable style={{ color: d.severity === "error" ? c.danger : d.severity === "info" ? c.muted : c.warn, backgroundColor: c.badge, padding: 10, borderRadius: 8 }}>{d.message}</Text>
      ))}
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>{T.fields.status}</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {/* Bei Serien kein „Erledigt“: Erledigen und Beenden nur über die Serienknöpfe (Entscheidung 18.10.2026). */}
          {(["open", "in-progress", "done"] as Status[]).filter((x) => !(s && x === "done" && f.status !== "done")).map((x) => (
            <Chip key={x} c={c} disabled={ro || (!!s && x === "done")} label={T.status[x]} active={f.status === x} onPress={() => act({ type: "setStatus", status: x }, "Status geändert")} testID={`status-${x}`} />
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>{T.fields.priority}</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {(["none", "low", "normal", "high"] as Priority[]).map((x) => (
            <Chip key={x} c={c} disabled={ro} label={T.priority[x]} active={f.priority === x} onPress={() => act({ type: "setPriority", priority: x }, "Priorität geändert")} testID={`priority-${x}`} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: c.fg, fontSize: 16 }}>Im Eingang</Text>
        <Switch value={f.inbox} disabled={ro} onValueChange={(v) => act({ type: "setInbox", inbox: v }, v ? "Zurück in den Eingang" : "Einsortiert")} testID="field-inbox" trackColor={{ true: c.primary }} />
      </View>
      {dateRow("due")}
      {dateRow("scheduled")}
      <View style={{ gap: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>Wiederholung</Text>
        <Text style={{ color: c.fg }} testID="series-desc">{s ? (s.rule ? describeRule(s.rule, s.anchor) ?? s.raw : s.raw) : "keine"}</Text>
        {s?.instance && (
          <Text style={{ color: c.fg }}>
            Aktuelles Vorkommen: {describeOccurrence(s.instance)}
            {s.phase === "clarify" && s.proposal ? ` – Vorschlag: ${describeOccurrence(s.proposal)}` : ""}
          </Text>
        )}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {s && s.phase === "active" && btn("Vorkommen erledigen", () => act({ type: "completeOccurrence", revision: s.revisionKey, instance: K }, "Vorkommen erledigt"), "series-complete", true)}
          {s && s.phase === "active" && btn(T.actions.skip, () => act({ type: "skipOccurrence", revision: s.revisionKey, instance: K }, "Übersprungen"), "series-skip")}
          {s && s.phase === "active" && btn("Erledigen und Serie beenden", () => act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: true }, "Serie beendet"), "series-end-complete")}
          {s && s.phase === "active" && btn("Serie ohne Erledigung beenden", () => act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: false }, "Serie beendet"), "series-end")}
          {s && s.phase === "ended" && reopen?.preview.result === "change" && btn("Serie wiederöffnen", () => act({ type: "reopenSeries", revision: s.revisionKey }, "Serie wiederöffnet"), "series-reopen")}
          {s && s.phase === "ended" && reopen?.preview.result === "blocked" && btn("Serie mit neuer Regel fortsetzen", () => nav.navigate("Recurrence", { ref, continueSeries: true }), "series-continue")}
          {btn(s ? "Regel bearbeiten" : "Wiederholung …", () => nav.navigate("Recurrence", { ref }), "edit-recurrence")}
          {s && btn("Wiederholung entfernen", () => act({ type: "removeRecurrence", revision: s.revisionKey }, "Wiederholung entfernt"))}
        </View>
        {previewLinesFor.length > 0 && (
          <View testID={s?.phase === "ended" ? "reopen-preview" : "complete-preview"} accessibilityLabel={s?.phase === "ended" ? "Beim Wiederöffnen" : "Beim Erledigen"}>
            {previewLinesFor.map((l) => (
              <Text key={l} style={{ color: c.muted, fontSize: 13 }}>• {l}</Text>
            ))}
          </View>
        )}
        {s && s.phase === "active" && s.anchor === "calendar" && (
          <View style={{ gap: 6 }} testID="exceptions">
            <Text style={{ color: c.muted, fontSize: 13 }}>Ausnahmen – nächste Termine (antippen zum Überspringen)</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[...upcomingForExceptions(s), ...extraSkipped.map((d) => ({ date: parseKey(d)!, skipped: true }))].map((u) => (
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
                onPress={() =>
                  pickDate(null, (d) => act({ type: "setException", revision: s.revisionKey, date: d, skipped: true }, "Termin wird übersprungen"))
                }
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
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {!s && btn(f.status === "done" ? T.actions.reopen : T.actions.complete, () => act(f.status === "done" ? { type: "reopen" } : { type: "complete" }, f.status === "done" ? "Wiederöffnet" : "Erledigt"), "toggle-done", true)}
        {btn(T.actions.renameToTitle, () => void repo.renameToTitle(ref).then((o) => notify(o, "Umbenannt")))}
        {btn(T.actions.delete, () => void repo.moveToTrash(ref).then((o) => { notify(o, "Gelöscht"); if (o.status === "ok") nav.goBack(); }), "delete", false, true)}
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Chip c={c} label="Bearbeiten" active={tab === "edit"} onPress={() => setTab("edit")} />
        <Chip c={c} label="Vorschau" active={tab === "preview"} onPress={() => { void flush(); setTab("preview"); }} testID="tab-preview" />
        <Text style={{ marginLeft: "auto", color: save === "failed" || save === "conflict" ? c.danger : c.muted, fontSize: 13 }} testID="save-state">
          {{ idle: "", pending: T.save.pending, draft: T.save.draft, saved: T.save.saved, failed: T.save.failed, conflict: T.save.conflict }[save]}
        </Text>
      </View>
      {save === "failed" && (
        <View style={{ backgroundColor: c.badge, borderRadius: 8, padding: 10, gap: 8 }} testID="save-failed">
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
        <View style={{ backgroundColor: c.badge, borderRadius: 8, padding: 10, gap: 8 }} testID="draft-conflict">
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
      {tab === "edit" ? (
        <TextInput
          value={body}
          editable={!ro}
          onChangeText={onBody}
          onBlur={() => void flush()}
          multiline
          placeholder="Notiz (Markdown)"
          placeholderTextColor={c.muted}
          style={{ minHeight: 220, textAlignVertical: "top", color: c.fg, borderWidth: 1, borderColor: c.outline, borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 15 }}
          testID="editor"
        />
      ) : (
        <View style={{ height: 360, borderWidth: 1, borderColor: c.outline, borderRadius: 8, overflow: "hidden" }}>
          <PreviewWeb html={html} onCheck={(line) => !ro && void flush().then(() => act({ type: "toggleCheckbox", line }, "Checkbox"))} />
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
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
