// Einstellungen „Diktieren“ (4.9, 4.10): API-Schlüssel (nur maskiert sichtbar), Modelle, Bereinigung und Titelvorschlag an/aus.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { checkKey, maskKey, T, type FetchLike } from "@markdoist/app";
import { useTheme } from "../theme";
import { clearApiKey, saveDictationSettings, setApiKey, useDictationConfig } from "../dictation/store";

export function DictationSettings() {
  const c = useTheme();
  const D = T.dictation;
  const { key, settings, loaded } = useDictationConfig();
  const [input, setInput] = useState("");
  const [models, setModels] = useState({ transcribeModel: settings.transcribeModel, cleanupModel: settings.cleanupModel, titleModel: settings.titleModel });
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => setModels({ transcribeModel: settings.transcribeModel, cleanupModel: settings.cleanupModel, titleModel: settings.titleModel }),
    [settings.transcribeModel, settings.cleanupModel, settings.titleModel],
  );

  const field = { color: c.fg, fontSize: 15, borderWidth: 1, borderColor: c.outline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface } as const;
  const btn = (label: string, onPress: () => void, testID: string, disabled?: boolean) => (
    <Pressable onPress={onPress} disabled={disabled} testID={testID} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: c.outline, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: c.fg }}>{label}</Text>
    </Pressable>
  );
  const saveModels = () => void saveDictationSettings({ ...settings, ...models });

  const check = async () => {
    if (!key) return;
    setBusy(true);
    const r = await checkKey(fetch as unknown as FetchLike, key);
    setBusy(false);
    setStatus(r.ok ? { text: D.keyOk } : { text: D.errors[r.kind], error: true });
  };

  if (!loaded) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 13, marginTop: 16 }}>{D.section}</Text>
      <Text style={{ color: c.fg, fontSize: 15 }}>{D.keyLabel}</Text>
      {key ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: c.fg, fontSize: 15, fontFamily: "monospace", flexGrow: 1 }} testID="dictation-key-masked">
            {maskKey(key)}
          </Text>
          {btn(D.keyCheck, () => void check(), "dictation-key-check", busy)}
          {btn(D.keyRemove, () => void clearApiKey().then(() => setStatus({ text: D.keyRemoved })), "dictation-key-remove")}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={D.keyPlaceholder}
            placeholderTextColor={c.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[field, { flex: 1 }]}
            testID="dictation-key"
          />
          {btn(
            D.keySave,
            () =>
              void setApiKey(input).then(() => {
                setInput("");
                setStatus({ text: D.keySaved });
              }),
            "dictation-key-save",
            !input.trim(),
          )}
        </View>
      )}
      {busy && <ActivityIndicator color={c.primary} size="small" style={{ alignSelf: "flex-start" }} />}
      {status && (
        <Text style={{ color: status.error ? c.danger : c.muted, fontSize: 13 }} testID="dictation-status">
          {status.text}
        </Text>
      )}
      <Text style={{ color: c.muted, fontSize: 13 }}>{D.keyHint}</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.fg, fontSize: 15 }}>{D.cleanup}</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>{D.cleanupHint}</Text>
        </View>
        <Switch value={settings.cleanup} onValueChange={(v) => void saveDictationSettings({ ...settings, ...models, cleanup: v })} trackColor={{ true: c.primary }} testID="dictation-cleanup" />
      </View>
      <Text style={{ color: c.fg, fontSize: 15, marginTop: 8 }}>{D.modelTranscribe}</Text>
      <TextInput
        value={models.transcribeModel}
        onChangeText={(v) => setModels((m) => ({ ...m, transcribeModel: v }))}
        onEndEditing={saveModels}
        autoCapitalize="none"
        autoCorrect={false}
        style={field}
        testID="dictation-model-transcribe"
      />
      <Text style={{ color: c.fg, fontSize: 15 }}>{D.modelCleanup}</Text>
      <TextInput
        value={models.cleanupModel}
        onChangeText={(v) => setModels((m) => ({ ...m, cleanupModel: v }))}
        onEndEditing={saveModels}
        autoCapitalize="none"
        autoCorrect={false}
        editable={settings.cleanup}
        style={[field, { opacity: settings.cleanup ? 1 : 0.5 }]}
        testID="dictation-model-cleanup"
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.fg, fontSize: 15 }}>{D.autoTitle}</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>{D.autoTitleHint}</Text>
        </View>
        <Switch value={settings.autoTitle} onValueChange={(v) => void saveDictationSettings({ ...settings, ...models, autoTitle: v })} trackColor={{ true: c.primary }} testID="dictation-auto-title" />
      </View>
      <Text style={{ color: c.fg, fontSize: 15 }}>{D.modelTitle}</Text>
      <TextInput
        value={models.titleModel}
        onChangeText={(v) => setModels((m) => ({ ...m, titleModel: v }))}
        onEndEditing={saveModels}
        autoCapitalize="none"
        autoCorrect={false}
        style={field}
        testID="dictation-model-title"
      />
    </View>
  );
}
