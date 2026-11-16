// Diktieren im Eingabeblatt eines Boards (4.10): Ruhezustand als Pille „Diktieren“ in der Aktionsleiste;
// sobald etwas läuft, ersetzt eine eigene Karte die Leiste: Aufnahme mit Laufzeit, „Abbrechen“ und „Fertig“
// gleich breit, danach Fortschritt bzw. Fehler mit „Erneut versuchen“. Das Detail nutzt weiter die DictateBar.
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { dictationErrorText, formatDuration, T } from "@markdoist/app";
import { useTheme } from "../theme";
import { CheckIcon, MicIcon } from "./icons";
import type { DictationState } from "../dictation/use-dictation";

/** Ob die Karte statt der Aktionsleiste steht. Ein Fehler ohne Wiederholung meldet sich nur als Hinweis. */
export function dictatePanelActive(state: DictationState): boolean {
  return state.phase !== "idle" && !(state.phase === "error" && !state.canRetry);
}

export function DictatePill({ onStart }: { onStart(): void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onStart}
      testID="dictate"
      accessibilityRole="button"
      accessibilityLabel={T.dictation.record}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingLeft: 14, paddingRight: 18, borderRadius: 22, backgroundColor: c.primaryContainer, opacity: pressed ? 0.7 : 1 })}
    >
      <MicIcon color={c.onPrimaryContainer} size={16} />
      <Text style={{ color: c.onPrimaryContainer, fontSize: 15, fontWeight: "500" }}>{T.dictation.dictate}</Text>
    </Pressable>
  );
}

/** Roter Punkt mit langsam atmendem Hof: zeigt, dass das Mikrofon offen ist. */
function RecDot() {
  const c = useTheme();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.12 + pulse.value * 0.2, transform: [{ scale: 1 + pulse.value * 0.35 }] }));
  return (
    <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: 18, height: 18, borderRadius: 9, backgroundColor: c.danger }, halo]} />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger }} />
    </View>
  );
}

export function DictatePanel({ state, onStop, onCancel, onRetry }: { state: DictationState; onStop(): void; onCancel(): void; onRetry(): void }) {
  const c = useTheme();
  const D = T.dictation;
  const recording = state.phase === "recording";

  const button = (label: string, onPress: () => void, testID: string, strong?: boolean, icon?: ReactNode) => (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 48,
        borderRadius: 12,
        backgroundColor: strong ? c.primaryStrong : c.surface,
        borderWidth: strong ? 0 : 1,
        borderColor: c.outline,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {icon}
      <Text style={{ color: strong ? c.onPrimary : c.fg, fontSize: 15, fontWeight: strong ? "600" : "500" }}>{label}</Text>
    </Pressable>
  );

  let head: ReactNode;
  let hint: string | null = null;
  let actions: ReactNode;
  if (recording) {
    head = (
      <>
        <RecDot />
        <Text style={{ flex: 1, color: c.onPrimaryContainer, fontSize: 14, fontWeight: "500" }} testID="dictate-state">
          {D.recordingNow}
        </Text>
        <Text style={{ color: c.fg, fontSize: 22, fontWeight: "500", fontVariant: ["tabular-nums"] }} testID="dictate-time">
          {formatDuration(state.ms)}
        </Text>
      </>
    );
    hint = D.filesOwnItem;
    actions = (
      <>
        {button(D.cancel, onCancel, "dictate-cancel")}
        {button(D.stop, onStop, "dictate-stop", true, <CheckIcon color={c.onPrimary} size={16} weight={2.4} />)}
      </>
    );
  } else if (state.phase === "error") {
    head = (
      <Text style={{ flex: 1, color: c.danger, fontSize: 14 }} testID="dictate-state">
        {dictationErrorText(state.error ?? "server", state.detail)}
      </Text>
    );
    actions = (
      <>
        {button(D.cancel, onCancel, "dictate-cancel")}
        {button(D.retry, onRetry, "dictate-retry", true)}
      </>
    );
  } else {
    // Mikrofon startet, Erkennung oder Bereinigung: nur Abbrechen.
    const label = state.phase === "starting" ? D.starting : state.phase === "transcribing" ? D.transcribing : D.cleaning;
    head = (
      <>
        <ActivityIndicator color={state.phase === "starting" ? c.muted : c.primaryStrong} size="small" />
        <Text style={{ flex: 1, color: c.fg, fontSize: 15, fontWeight: "500" }} testID="dictate-state">
          {label}
        </Text>
        {state.phase !== "starting" && state.ms > 0 ? (
          <Text style={{ color: c.muted, fontSize: 13, fontVariant: ["tabular-nums"] }}>
            {formatDuration(state.ms)} {D.recording}
          </Text>
        ) : null}
      </>
    );
    actions = button(D.cancel, onCancel, "dictate-cancel");
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      testID={recording ? "dictate-recording" : state.phase === "starting" ? "dictate-starting" : undefined}
      style={{ borderRadius: 16, borderWidth: 1, borderColor: recording ? c.recBorder : c.outline, backgroundColor: recording ? c.recBg : c.bg, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 }}>{head}</View>
      {hint ? <Text style={{ color: c.muted, fontSize: 13, marginTop: 8 }}>{hint}</Text> : null}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>{actions}</View>
    </View>
  );
}
