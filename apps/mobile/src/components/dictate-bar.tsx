// Diktieren (4.9): Leiste in der Beschreibungskarte. Ruhezustand: Knopf „Diktieren“ neben „Checklistenpunkt“;
// während der Aufnahme Laufzeit mit „Abbrechen“ und „Fertig“; danach Fortschritt bzw. Fehler mit „Erneut versuchen“.
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { formatDuration, T } from "@markdoist/app";
import { useTheme } from "../theme";
import { MicIcon } from "./icons";
import type { DictationState } from "../dictation/use-dictation";

export function DictateBar({ state, onStart, onStop, onCancel, onRetry }: { state: DictationState; onStart(): void; onStop(): void; onCancel(): void; onRetry(): void }) {
  const c = useTheme();
  const D = T.dictation;
  const btn = (label: string, onPress: () => void, testID: string, strong?: boolean) => (
    <Pressable
      onPress={onPress}
      testID={testID}
      hitSlop={6}
      style={{ paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: "center", backgroundColor: strong ? c.primary : "transparent", borderWidth: strong ? 0 : 1, borderColor: c.outline }}
    >
      <Text style={{ color: strong ? "#fff" : c.fg, fontSize: 14, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
  const row = { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: c.divider } as const;

  if (state.phase === "recording" || state.phase === "starting") {
    return (
      <View style={row} testID="dictate-recording">
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger }} />
        <Text style={{ flex: 1, color: c.fg, fontSize: 14, fontVariant: ["tabular-nums"] }} testID="dictate-state">
          {D.recording} {formatDuration(state.ms)}
        </Text>
        {btn(D.cancel, onCancel, "dictate-cancel")}
        {btn(D.stop, onStop, "dictate-stop", true)}
      </View>
    );
  }
  if (state.phase === "transcribing" || state.phase === "cleaning") {
    return (
      <View style={row}>
        <ActivityIndicator color={c.primary} size="small" />
        <Text style={{ flex: 1, color: c.muted, fontSize: 14 }} testID="dictate-state">
          {state.phase === "transcribing" ? D.transcribing : D.cleaning}
        </Text>
        {btn(D.cancel, onCancel, "dictate-cancel")}
      </View>
    );
  }
  if (state.phase === "error" && state.canRetry) {
    return (
      <View style={row}>
        <Text style={{ flex: 1, color: c.danger, fontSize: 14 }} testID="dictate-state">
          {state.error ? D.errors[state.error] : D.errors.server}
        </Text>
        {btn(D.cancel, onCancel, "dictate-cancel")}
        {btn(D.retry, onRetry, "dictate-retry", true)}
      </View>
    );
  }
  return (
    <Pressable onPress={onStart} testID="dictate" accessibilityLabel={D.record} android_ripple={{ color: c.surfaceHigh }} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 16 }}>
      <MicIcon color={c.primary} size={16} />
      <Text style={{ color: c.primary, fontSize: 14, fontWeight: "500" }}>{D.dictate}</Text>
    </Pressable>
  );
}
