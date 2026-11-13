// „Checkliste einfügen“ (4.11): Eingabeblatt mit mehrzeiligem Feld. Der eingefügte Text geht an die KI, die
// Einträge werden als ein Schreibvorgang an die Liste angehängt, danach schließt das Blatt. Bei einem Fehler
// bleibt der Text im Feld; „Abbrechen“ bricht eine laufende Anfrage ab.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { checklistErrorText, DictationError, insertChecklistItems, T_CHECKLIST } from "@markdoist/app";
import { CaptureSheet } from "../components/capture-sheet";
import { checklistItems } from "../dictation/checklist";
import { useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export function PasteChecklistScreen() {
  const { ref } = useRoute<RouteProp<RootStack, "PasteChecklist">>().params;
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const list = state.index.tasks.find((v) => v.task.ref === ref);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  // Verlassen des Blatts bricht eine laufende Anfrage ab.
  useEffect(() => () => ctrl.current?.abort(), []);

  const cancel = () => {
    ctrl.current?.abort();
    ctrl.current = null;
    setBusy(false);
    setError(null);
  };

  const submit = async () => {
    if (busy || !text.trim() || !list || list.readOnly) return;
    const mine = new AbortController();
    ctrl.current = mine;
    setBusy(true);
    setError(null);
    try {
      const items = await checklistItems(text, list.task.fields.title, mine.signal);
      if (mine.signal.aborted) return;
      const o = await insertChecklistItems(repo, ref, items);
      if (o.status === "ok") {
        notify({ ...o, message: T_CHECKLIST.inserted(items.length) });
        if (nav.isFocused()) nav.goBack();
        return;
      }
      if (o.status !== "noop") setError(o.message);
    } catch (e) {
      if (mine.signal.aborted) return;
      setError(checklistErrorText(e));
      if (e instanceof DictationError && e.kind === "nokey") {
        notify({ status: "error", message: T_CHECKLIST.noKey });
        nav.navigate("Settings");
      }
    } finally {
      if (ctrl.current === mine) {
        ctrl.current = null;
        setBusy(false);
      }
    }
  };

  const status = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: c.divider }}>
      {busy && <ActivityIndicator color={c.primary} size="small" />}
      <Text style={{ flex: 1, color: error ? c.danger : c.muted, fontSize: 13, paddingVertical: 8 }} testID="paste-checklist-status" accessibilityLiveRegion="polite">
        {busy ? T_CHECKLIST.busy : (error ?? T_CHECKLIST.hint)}
      </Text>
      {busy && (
        <Pressable onPress={cancel} testID="paste-checklist-cancel" hitSlop={6} style={{ paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: "center", borderWidth: 1, borderColor: c.outline }}>
          <Text style={{ color: c.fg, fontSize: 14, fontWeight: "500" }}>{T_CHECKLIST.cancel}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <CaptureSheet
      value={text}
      onChangeText={(t) => {
        setText(t);
        if (error) setError(null);
      }}
      placeholder={T_CHECKLIST.placeholder}
      onSubmit={() => void submit()}
      ready={!busy && !!text.trim() && !!list && !list.readOnly}
      paragraphs
      extra={status}
      submitLabel={T_CHECKLIST.submit}
      accessibilityLabel={T_CHECKLIST.title}
      testID={{ input: "paste-checklist-text", submit: "paste-checklist-submit" }}
    />
  );
}
