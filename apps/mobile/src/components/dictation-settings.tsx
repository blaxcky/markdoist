// Einstellungen „Diktieren“ (4.9, 4.10, 4.12): API-Schlüssel je Anbieter (nur maskiert sichtbar), Modelle,
// Bereinigung und Titelvorschlag an/aus, Text-Anbieter (OpenAI oder Claude).
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { checkClaudeKey, checkKey, maskKey, PROVIDER_LABEL, T, textModels, type ApiProvider, type FetchLike, type TextProvider } from "@markdoist/app";
import { useTheme } from "../theme";
import { clearApiKey, saveDictationSettings, setApiKey, useDictationConfig } from "../dictation/store";

const D = T.dictation;

/** Testkennungen: OpenAI behält die bisherigen (`dictation-key…`), andere Anbieter `dictation-<anbieter>-key…`. */
const tid = (p: ApiProvider, suffix: string) => (p === "openai" ? `dictation-key${suffix}` : `dictation-${p}-key${suffix}`);

function KeyRow({ provider, value }: { provider: ApiProvider; value: string | null }) {
  const c = useTheme();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const field = { color: c.fg, fontSize: 15, borderWidth: 1, borderColor: c.outline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface } as const;
  const btn = (label: string, onPress: () => void, testID: string, disabled?: boolean) => (
    <Pressable onPress={onPress} disabled={disabled} testID={testID} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: c.outline, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: c.fg }}>{label}</Text>
    </Pressable>
  );
  const check = async () => {
    if (!value) return;
    setBusy(true);
    const r = provider === "anthropic" ? await checkClaudeKey({ key: value }) : await checkKey(fetch as unknown as FetchLike, value);
    setBusy(false);
    setStatus(r.ok ? { text: D.keyOk } : { text: D.errors[r.kind], error: true });
  };
  return (
    <>
      <Text style={{ color: c.fg, fontSize: 15 }}>{D.keyLabelFor(PROVIDER_LABEL[provider])}</Text>
      {value ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: c.fg, fontSize: 15, fontFamily: "monospace", flexGrow: 1 }} testID={tid(provider, "-masked")}>
            {maskKey(value)}
          </Text>
          {btn(D.keyCheck, () => void check(), tid(provider, "-check"), busy)}
          {btn(D.keyRemove, () => void clearApiKey(provider).then(() => setStatus({ text: D.keyRemoved })), tid(provider, "-remove"))}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={D.keyPlaceholderFor[provider]}
            placeholderTextColor={c.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[field, { flex: 1 }]}
            testID={tid(provider, "")}
          />
          {btn(
            D.keySave,
            () =>
              void setApiKey(input, provider).then(() => {
                setInput("");
                setStatus({ text: D.keySaved });
              }),
            tid(provider, "-save"),
            !input.trim(),
          )}
        </View>
      )}
      {busy && <ActivityIndicator color={c.primary} size="small" style={{ alignSelf: "flex-start" }} />}
      {status && (
        <Text style={{ color: status.error ? c.danger : c.muted, fontSize: 13 }} testID={provider === "openai" ? "dictation-status" : `dictation-${provider}-status`}>
          {status.text}
        </Text>
      )}
    </>
  );
}

export function DictationSettings() {
  const c = useTheme();
  const { keys, settings, loaded } = useDictationConfig();
  const pick = () => ({
    transcribeModel: settings.transcribeModel,
    cleanupModel: settings.cleanupModel,
    titleModel: settings.titleModel,
    claudeCleanupModel: settings.claudeCleanupModel,
    claudeTitleModel: settings.claudeTitleModel,
  });
  const [models, setModels] = useState(pick);
  useEffect(
    () => setModels(pick()),
    [settings.transcribeModel, settings.cleanupModel, settings.titleModel, settings.claudeCleanupModel, settings.claudeTitleModel],
  );

  const field = { color: c.fg, fontSize: 15, borderWidth: 1, borderColor: c.outline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface } as const;
  const saveModels = () => void saveDictationSettings({ ...settings, ...models });
  const text = textModels(settings).provider;
  const claude = text === "anthropic";
  const cleanupField = claude ? "claudeCleanupModel" : "cleanupModel";
  const titleField = claude ? "claudeTitleModel" : "titleModel";
  const heading = (label: string) => <Text style={{ color: c.fg, fontSize: 15, fontWeight: "600", marginTop: 12 }}>{label}</Text>;
  const chip = (p: TextProvider) => {
    const on = text === p;
    return (
      <Pressable
        key={p}
        onPress={() => void saveDictationSettings({ ...settings, ...models, textProvider: p })}
        testID={`dictation-text-${p}`}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: on ? c.primary : c.outline, backgroundColor: on ? c.primary : "transparent" }}
      >
        <Text style={{ color: on ? c.onPrimary : c.fg }}>{D.providerNames[p]}</Text>
      </Pressable>
    );
  };

  if (!loaded) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 13, marginTop: 16 }}>{D.section}</Text>
      {heading(D.transcribeSection)}
      <KeyRow provider="openai" value={keys.openai} />
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

      {heading(D.textSection)}
      <Text style={{ color: c.muted, fontSize: 13 }}>{D.textSectionHint}</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }} accessibilityRole="radiogroup" accessibilityLabel={D.textProvider}>
        {chip("openai")}
        {chip("anthropic")}
      </View>
      {claude && <KeyRow provider="anthropic" value={keys.anthropic} />}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.fg, fontSize: 15 }}>{D.cleanup}</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>{D.cleanupHint}</Text>
        </View>
        <Switch value={settings.cleanup} onValueChange={(v) => void saveDictationSettings({ ...settings, ...models, cleanup: v })} trackColor={{ true: c.primary }} testID="dictation-cleanup" />
      </View>
      <Text style={{ color: c.fg, fontSize: 15 }}>{D.modelCleanup}</Text>
      <TextInput
        value={models[cleanupField]}
        onChangeText={(v) => setModels((m) => ({ ...m, [cleanupField]: v }))}
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
          <Text style={{ color: c.muted, fontSize: 13 }}>{claude ? D.autoTitleHintFor(PROVIDER_LABEL.anthropic) : D.autoTitleHint}</Text>
        </View>
        <Switch value={settings.autoTitle} onValueChange={(v) => void saveDictationSettings({ ...settings, ...models, autoTitle: v })} trackColor={{ true: c.primary }} testID="dictation-auto-title" />
      </View>
      <Text style={{ color: c.fg, fontSize: 15 }}>{D.modelTitle}</Text>
      <TextInput
        value={models[titleField]}
        onChangeText={(v) => setModels((m) => ({ ...m, [titleField]: v }))}
        onEndEditing={saveModels}
        autoCapitalize="none"
        autoCorrect={false}
        style={field}
        testID="dictation-model-title"
      />
      <Text style={{ color: c.muted, fontSize: 13, marginTop: 8 }}>{claude ? D.keyHintFor(PROVIDER_LABEL.openai, PROVIDER_LABEL.anthropic) : D.keyHint}</Text>
    </View>
  );
}
