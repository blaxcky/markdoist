// Schnellerfassung (4.1, AK-26): Titel genügt; landet im Eingang ohne Termin.
// Blatt über der Liste mit Titelzeile, den Chips Beschreibung und Bearbeiten und rotem Plus-Knopf über der Tastatur (CaptureSheet).
// Das Blatt schließt sofort, die Aufgabe steht schon in der Liste; geschrieben wird im Hintergrund (4.4).
// Diktieren (4.13): Chip „Diktieren“ für den Titel (kommt roh), Mikrofon am Beschreibungsfeld (wird bereinigt).
import { useRef, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { appendDictation, appendTitle, dictationErrorText, T, type DictationResult } from "@markdoist/app";
import { useRepo } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import { Glyph, LinesIcon, MicIcon } from "../components/icons";
import { CaptureSheet } from "../components/capture-sheet";
import { DictatePanel, dictatePanelActive } from "../components/dictate-panel";
import { useDictation } from "../dictation/use-dictation";
import { navigationRef, type RootStack } from "../navigation";

export function CaptureScreen() {
  const repo = useRepo();
  const notify = useNotify();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const initial = useRoute<RouteProp<RootStack, "Capture">>().params;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [showNote, setShowNote] = useState(!!initial?.note);
  const sent = useRef(false);
  // Ziel des laufenden Diktats: beim Start festgelegt, gilt auch für „Erneut versuchen“.
  const target = useRef<"title" | "note">("title");
  const titleNow = useRef(title);
  titleNow.current = title;
  const onDictated = (r: DictationResult) => {
    if (target.current === "title") return setTitle((cur) => appendTitle(cur, r.text));
    setShowNote(true);
    setNote((cur) => appendDictation(cur, r.text));
    if (!r.cleaned && r.cleanupError) notify({ status: "ok", message: T.dictation.notCleaned });
  };
  const dictation = useDictation({
    enabled: true,
    ctx: () => (target.current === "title" ? { kind: "task", target: "title" } : { kind: "task", title: titleNow.current.trim() || undefined }),
    onResult: (r) => onDictated(r),
    onError: (kind, detail, canRetry) => {
      // Wiederholbare Fehler zeigt die Aufnahmekarte selbst.
      if (!canRetry) notify({ status: "error", message: dictationErrorText(kind, detail) });
      if (kind === "nokey" || kind === "nomodel") nav.navigate("Dictation");
    },
  });
  const dictate = (t: "title" | "note") => {
    target.current = t;
    void dictation.start();
  };
  const ready = !!title.trim();
  const submit = (edit: boolean) => {
    if (!title.trim() || sent.current) return;
    sent.current = true;
    const input = { title: title.trim(), note };
    let closed = false;
    void repo
      .create(input, (ref) => {
        closed = true;
        if (edit) nav.replace("Detail", { ref });
        else nav.goBack();
      })
      .then((o) => {
        notify(o, "Erfasst im Eingang");
        if (!closed) sent.current = false;
        // Scheitert das Schreiben nach dem Schließen, öffnet die Erfassung erneut mit dem Text (7.6).
        else if (o.status !== "ok" && o.status !== "noop" && navigationRef.isReady()) navigationRef.navigate("Capture", input);
      });
  };
  // Ohne `onPress` (Bearbeiten ohne Titel) ist der Chip sichtbar ausgegraut.
  const chip = (label: string, icon: ReactNode, onPress: (() => void) | undefined, testID: string, active = false) => (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress, selected: active }}
      style={{ flexDirection: "row", alignItems: "center", gap: 7, height: 34, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: active ? c.primary : c.outline, backgroundColor: active ? c.primaryContainer : c.surface, opacity: onPress ? 1 : 0.45 }}
    >
      {icon}
      <Text style={{ color: c.fg, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  return (
    <CaptureSheet
      value={title}
      onChangeText={setTitle}
      placeholder="Aufgabenname"
      onSubmit={() => submit(false)}
      ready={ready}
      accessibilityLabel={T.fields.title}
      submitLabel="Erfassen (landet im Eingang, ohne Termin)"
      testID={{ input: "capture-title", submit: "capture-submit" }}
      extra={
        showNote && (
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <TextInput
              autoFocus
              placeholder="Beschreibung"
              placeholderTextColor={c.muted}
              value={note}
              onChangeText={setNote}
              multiline
              cursorColor={c.primary}
              style={{ flex: 1, color: c.fg, fontSize: 15, paddingLeft: 18, paddingRight: 4, paddingTop: 0, paddingBottom: 8, maxHeight: 140, textAlignVertical: "top" }}
              testID="capture-note"
            />
            {!dictatePanelActive(dictation.state) && (
              <Pressable onPress={() => dictate("note")} testID="capture-dictate-note" accessibilityRole="button" accessibilityLabel={T.dictation.record} hitSlop={6} style={{ width: 44, height: 32, alignItems: "center", justifyContent: "center", marginRight: 6 }}>
                <MicIcon color={c.muted} size={18} />
              </Pressable>
            )}
          </View>
        )
      }
      panel={dictatePanelActive(dictation.state) ? <DictatePanel state={dictation.state} hint={target.current === "title" ? T.dictation.titleRaw : null} onStop={() => void dictation.stop()} onCancel={() => void dictation.cancel()} onRetry={() => void dictation.retry()} /> : undefined}
      chips={
        <>
          {chip("Beschreibung", <LinesIcon color={c.muted} size={14} />, () => setShowNote((x) => !x), "capture-toggle-note", showNote)}
          {chip("Bearbeiten", <Glyph color={c.muted} size={15}>✎</Glyph>, ready ? () => submit(true) : undefined, "capture-edit")}
          {/* Nur das Symbol: Mit Text passte die Chipzeile nicht mehr neben den Senden-Knopf. */}
          <Pressable
            onPress={() => dictate("title")}
            testID="capture-dictate"
            accessibilityRole="button"
            accessibilityLabel={T.dictation.recordTitle}
            style={{ alignItems: "center", justifyContent: "center", width: 44, height: 34, borderRadius: 8, borderWidth: 1, borderColor: c.outline, backgroundColor: c.surface }}
          >
            <MicIcon color={c.muted} size={16} />
          </Pressable>
        </>
      }
    />
  );
}
