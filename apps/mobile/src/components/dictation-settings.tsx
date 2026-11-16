// Seite „Diktieren“ (4.9, 4.10, 4.12): Anbieter für Erkennung (auf dem Gerät, OpenAI, Groq, Gemini) und Text
// (OpenAI oder Claude) als Auswahllisten, die nötigen API-Schlüssel (nur maskiert sichtbar) in einer Karte,
// Bereinigung und Titelvorschlag an/aus, eine Übersicht, was das Gerät verlässt, und die Modellnamen unter „Erweitert“.
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import {
  checkApiKey,
  formatMB,
  LOCAL_MODEL_NAME,
  maskKey,
  modelBytes,
  PROVIDER_LABEL,
  T,
  textModels,
  transcribeTarget,
  TRANSCRIBE_PROVIDERS,
  type ApiProvider,
  type DictationSettings as Settings,
  type FetchLike,
  type TranscribeProvider,
} from "@markdoist/app";
import { cancelDownload, downloadModel, localAvailable, removeModel, useLocalModel } from "../dictation/local";
import { useTheme } from "../theme";
import { clearApiKey, saveDictationSettings, setApiKey, useDictationConfig } from "../dictation/store";
import { Card, CardFooter, Divider, IconTile, Pill, RadioRow, Row, Section, SmallButton, SwitchRow } from "./settings-ui";
import { CheckIcon, ChevronIcon, LinesIcon, MicIcon } from "./icons";

const D = T.dictation;
const P = D.page;

/** Testkennungen: OpenAI behält die bisherigen (`dictation-key…`), andere Anbieter `dictation-<anbieter>-key…`. */
const tid = (p: ApiProvider, suffix: string) => (p === "openai" ? `dictation-key${suffix}` : `dictation-${p}-key${suffix}`);

function KeyRow({ provider, value, usage, first }: { provider: ApiProvider; value: string | null; usage: string; first: boolean }) {
  const c = useTheme();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (!value) return;
    setBusy(true);
    const r = await checkApiKey(provider, { fetch: fetch as unknown as FetchLike, key: value });
    setBusy(false);
    setStatus(r.ok ? { text: D.keyOk, ok: true } : { text: D.errors[r.kind], error: true });
  };
  return (
    <View style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 10, borderTopWidth: first ? 0 : 1, borderTopColor: c.divider }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ color: c.fg, fontSize: 16, flex: 1 }}>{D.providerNames[provider]}</Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>{usage}</Text>
      </View>
      {value ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ color: c.fg, fontSize: 14, fontFamily: "monospace", flexGrow: 1 }} testID={tid(provider, "-masked")}>
            {maskKey(value)}
          </Text>
          <SmallButton label={D.keyCheck} onPress={() => void check()} testID={tid(provider, "-check")} disabled={busy} />
          <SmallButton label={D.keyRemove} onPress={() => void clearApiKey(provider).then(() => setStatus({ text: D.keyRemoved }))} testID={tid(provider, "-remove")} danger />
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
            accessibilityLabel={D.keyLabelFor(PROVIDER_LABEL[provider])}
            style={{ flex: 1, minHeight: 44, color: c.fg, fontSize: 15, fontFamily: "monospace", borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: 14, backgroundColor: c.field }}
            testID={tid(provider, "")}
          />
          <SmallButton
            label={D.keySave}
            filled
            onPress={() =>
              void setApiKey(input, provider).then(() => {
                setInput("");
                setStatus({ text: D.keySaved });
              })
            }
            testID={tid(provider, "-save")}
            disabled={!input.trim()}
          />
        </View>
      )}
      {busy && <ActivityIndicator color={c.primary} size="small" style={{ alignSelf: "flex-start" }} />}
      {status && (
        <Text style={{ color: status.error ? c.danger : status.ok ? c.onDoneContainer : c.muted, fontSize: 13 }} testID={provider === "openai" ? "dictation-status" : `dictation-${provider}-status`}>
          {status.text}
        </Text>
      )}
    </View>
  );
}

/** Lokales Modell (4.12): herunterladen mit Fortschritt, abbrechen, löschen. Steht unter „Auf dem Gerät“. */
function LocalModelPanel() {
  const c = useTheme();
  const L = D.local;
  const m = useLocalModel();
  if (!m) return null;
  const pct = m.state === "downloading" ? Math.floor((m.received / Math.max(1, m.total)) * 100) : 0;
  return (
    <CardFooter inset={74} testID="local-model">
      {m.state === "ready" && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.doneContainer, alignItems: "center", justifyContent: "center" }}>
              <CheckIcon color={c.onDoneContainer} size={12} weight={2.4} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ color: c.fg, fontSize: 15, fontWeight: "500" }} testID="local-model-state">
                {P.localReady}
              </Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>
                {LOCAL_MODEL_NAME} · {formatMB(modelBytes())}
              </Text>
            </View>
          </View>
          <SmallButton label={L.remove} onPress={() => void removeModel()} testID="local-model-remove" />
        </>
      )}
      {m.state === "downloading" && (
        <>
          <Text style={{ color: c.fg, fontSize: 15, fontWeight: "500" }} testID="local-model-state">
            {L.downloading(pct)}
          </Text>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.outline, overflow: "hidden" }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View style={{ width: `${pct}%`, height: 6, backgroundColor: c.primaryStrong }} />
          </View>
          <SmallButton label={L.cancel} onPress={cancelDownload} testID="local-model-cancel" />
        </>
      )}
      {(m.state === "missing" || m.state === "error") && (
        <>
          <Text style={{ color: c.fg, fontSize: 14, lineHeight: 20 }}>{P.localMissing}</Text>
          <SmallButton label={L.download(formatMB(modelBytes()))} filled onPress={() => void downloadModel()} testID="local-model-download" />
        </>
      )}
      {m.state === "error" && (
        <Text style={{ color: c.danger, fontSize: 13 }} testID="local-model-error">
          {L.failed}: {m.message}
        </Text>
      )}
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>{P.localSource}</Text>
    </CardFooter>
  );
}

/** Zeile der Karte „Was das Gerät verlässt“ */
function FlowRow({ icon, label, dest, sub, local, testID }: { icon: (color: string) => ReactNode; label: string; dest: string; sub: string; local?: boolean; testID?: string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 14, paddingHorizontal: 16 }}>
      <IconTile size={40} bg={local ? c.doneContainer : c.badge} fg={local ? c.onDoneContainer : c.fg}>
        {icon}
      </IconTile>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: c.fg, fontSize: 16, fontWeight: "500" }} testID={testID}>
          {dest}
        </Text>
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{sub}</Text>
      </View>
    </View>
  );
}

export function DictationSettings() {
  const c = useTheme();
  const { keys, settings, loaded } = useDictationConfig();
  const [advanced, setAdvanced] = useState(false);
  const pick = () => ({
    transcribeModel: settings.transcribeModel,
    groqModel: settings.groqModel,
    geminiModel: settings.geminiModel,
    cleanupModel: settings.cleanupModel,
    titleModel: settings.titleModel,
    claudeCleanupModel: settings.claudeCleanupModel,
    claudeTitleModel: settings.claudeTitleModel,
  });
  const [models, setModels] = useState(pick);
  useEffect(
    () => setModels(pick()),
    [settings.transcribeModel, settings.groqModel, settings.geminiModel, settings.cleanupModel, settings.titleModel, settings.claudeCleanupModel, settings.claudeTitleModel],
  );

  const save = (patch: Partial<Settings>) => void saveDictationSettings({ ...settings, ...models, ...patch });
  const saveModels = () => save({});
  const text = textModels(settings).provider;
  const claude = text === "anthropic";
  const cleanupField = claude ? "claudeCleanupModel" : "cleanupModel";
  const titleField = claude ? "claudeTitleModel" : "titleModel";
  // „Auf dem Gerät“ nur, wenn es die native Bibliothek für diese Architektur gibt.
  const canLocal = localAvailable();
  const picked = transcribeTarget(settings).provider;
  const stt: TranscribeProvider = picked === "local" && !canLocal ? "openai" : picked;
  const sttKey: ApiProvider | null = stt === "local" ? null : stt;
  const modelField = (p: Exclude<TranscribeProvider, "local">) => (p === "groq" ? "groqModel" : p === "gemini" ? "geminiModel" : "transcribeModel");
  const field = { minHeight: 44, color: c.fg, fontSize: 14, fontFamily: "monospace", borderWidth: 1, borderColor: c.outline, borderRadius: 12, paddingHorizontal: 14, backgroundColor: c.field } as const;
  const fieldLabel = { color: c.muted, fontSize: 13 } as const;

  if (!loaded) return null;
  const keyRows: { p: ApiProvider; usage: string }[] = [];
  if (sttKey) keyRows.push({ p: sttKey, usage: sttKey === text ? P.keyFor.both : P.keyFor.stt });
  if (text !== sttKey) keyRows.push({ p: text, usage: P.keyFor.text });
  const sttProviders = TRANSCRIBE_PROVIDERS.filter((p) => p !== "local" || canLocal);

  return (
    <View style={{ gap: 22 }}>
      <Section title={D.transcribeSection} hint={P.transcribeHint}>
        <Card role="radiogroup" label={D.transcribeSection}>
          {sttProviders.map((p, i) => (
            <RadioRow
              key={p}
              first={i === 0}
              title={D.providerNames[p]}
              sub={p === "local" ? P.localSub : models[modelField(p)]}
              mono={p !== "local"}
              selected={stt === p}
              onPress={() => save({ transcribeProvider: p })}
              testID={`dictation-stt-${p}`}
              tag={p === "local" ? <Pill label={P.tagOffline} tone="ok" /> : !keys[p] ? <Pill label={P.tagNoKey} /> : undefined}
            />
          ))}
          {stt === "local" && <LocalModelPanel />}
        </Card>
      </Section>

      <Section title={D.textSection} hint={D.textSectionHint}>
        <Card role="radiogroup" label={D.textProvider}>
          {(["openai", "anthropic"] as const).map((p, i) => {
            const a = p === "anthropic" ? models.claudeCleanupModel : models.cleanupModel;
            const b = p === "anthropic" ? models.claudeTitleModel : models.titleModel;
            return (
              <RadioRow
                key={p}
                first={i === 0}
                title={D.providerNames[p]}
                sub={a === b ? a : `${a} · ${b}`}
                mono
                selected={text === p}
                onPress={() => save({ textProvider: p })}
                testID={`dictation-text-${p}`}
                tag={!keys[p] ? <Pill label={P.tagNoKey} /> : undefined}
              />
            );
          })}
        </Card>
      </Section>

      <Section title={P.keys}>
        <Card>
          {keyRows.map(({ p, usage }, i) => (
            <KeyRow key={p} provider={p} value={keys[p]} usage={usage} first={i === 0} />
          ))}
          <CardFooter>
            <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{P.keysSafe}</Text>
          </CardFooter>
        </Card>
      </Section>

      <Section title={P.after}>
        <Card>
          <SwitchRow title={D.cleanup} hint={D.cleanupHint} value={settings.cleanup} onChange={(v) => save({ cleanup: v })} testID="dictation-cleanup" />
          <Divider inset={16} />
          <SwitchRow title={D.autoTitle} hint={P.autoTitleHint} value={settings.autoTitle} onChange={(v) => save({ autoTitle: v })} testID="dictation-auto-title" />
        </Card>
      </Section>

      <Section title={P.dataFlow}>
        <Card testID="dictation-dataflow">
          <FlowRow
            icon={(col) => <MicIcon color={col} size={18} />}
            label={P.recordings}
            dest={sttKey ? P.goesTo(D.providerNames[sttKey]) : P.stays}
            sub={sttKey ? P.recordingsCloud : P.recordingsLocal}
            local={!sttKey}
            testID="dataflow-recordings"
          />
          <Divider inset={70} />
          <FlowRow icon={(col) => <LinesIcon color={col} size={16} />} label={P.texts} dest={P.goesTo(D.providerNames[text])} sub={P.textsSent(settings.cleanup)} testID="dataflow-texts" />
        </Card>
      </Section>

      <Section title={P.advanced}>
        <Card>
          <Row
            title={P.models}
            sub={P.modelsHint}
            onPress={() => setAdvanced((v) => !v)}
            testID="dictation-advanced"
            trailing={<ChevronIcon color={c.muted} size={16} dir={advanced ? "down" : "right"} />}
          />
          {advanced && (
            <View style={{ borderTopWidth: 1, borderTopColor: c.divider, padding: 16, gap: 14 }}>
              {sttKey && (
                <View style={{ gap: 6 }}>
                  <Text style={fieldLabel}>{P.modelFor(P.modelTranscribe, PROVIDER_LABEL[sttKey])}</Text>
                  <TextInput
                    value={models[modelField(sttKey)]}
                    onChangeText={(v) => setModels((m) => ({ ...m, [modelField(sttKey)]: v }))}
                    onEndEditing={saveModels}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel={D.modelTranscribe}
                    style={field}
                    testID="dictation-model-transcribe"
                  />
                </View>
              )}
              <View style={{ gap: 6, opacity: settings.cleanup ? 1 : 0.5 }}>
                <Text style={fieldLabel}>{P.modelFor(P.modelCleanup, PROVIDER_LABEL[text])}</Text>
                <TextInput
                  value={models[cleanupField]}
                  onChangeText={(v) => setModels((m) => ({ ...m, [cleanupField]: v }))}
                  onEndEditing={saveModels}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={settings.cleanup}
                  accessibilityLabel={D.modelCleanup}
                  style={field}
                  testID="dictation-model-cleanup"
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={fieldLabel}>{P.modelFor(P.modelTitle, PROVIDER_LABEL[text])}</Text>
                <TextInput
                  value={models[titleField]}
                  onChangeText={(v) => setModels((m) => ({ ...m, [titleField]: v }))}
                  onEndEditing={saveModels}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={D.modelTitle}
                  style={field}
                  testID="dictation-model-title"
                />
              </View>
            </View>
          )}
        </Card>
      </Section>
    </View>
  );
}
