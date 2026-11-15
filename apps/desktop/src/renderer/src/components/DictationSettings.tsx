// Einstellungen „Diktieren“ (4.9, 4.10, 4.12): Schlüssel nur maskiert, Modelle, Bereinigung und Titelvorschlag
// an/aus, Anbieter für Erkennung (OpenAI, Groq, Gemini) und Text (OpenAI oder Claude).
import { useEffect, useState } from "react";
import { API_PROVIDERS, PROVIDER_LABEL, T, textModels, transcribeTarget, TRANSCRIBE_PROVIDERS, type ApiProvider, type TextProvider, type TranscribeProvider } from "@markdoist/app";
import { bridge, type DictationStatus } from "../bridge";
import { useDialog } from "../dialog";

const D = T.dictation;

/** Testkennungen: OpenAI behält die bisherigen (`dictation-key…`), andere Anbieter `dictation-<anbieter>-key…`. */
const tid = (p: ApiProvider, suffix: string) => (p === "openai" ? `dictation-key${suffix}` : `dictation-${p}-key${suffix}`);

function KeyRow({ provider, st, apply }: { provider: ApiProvider; st: DictationStatus; apply(s: DictationStatus): void }) {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const k = st.keys[provider];
  const id = tid(provider, "");
  return (
    <>
      <label htmlFor={id}>{D.keyLabelFor(PROVIDER_LABEL[provider])}</label>
      {k.hasKey ? (
        <div className="key-row">
          <span className="masked" data-testid={tid(provider, "-masked")}>
            {k.masked}
          </span>
          <button
            className="btn"
            disabled={busy}
            data-testid={tid(provider, "-check")}
            onClick={() => {
              setBusy(true);
              void bridge()
                .dictation.check(provider)
                .then((r) => setMsg(r.ok ? { text: D.keyOk } : { text: D.errors[r.kind], error: true }))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "…" : D.keyCheck}
          </button>
          <button className="btn" data-testid={tid(provider, "-remove")} onClick={() => void bridge().dictation.clearKey(provider).then((s) => (apply(s), setMsg({ text: D.keyRemoved })))}>
            {D.keyRemove}
          </button>
        </div>
      ) : (
        <form
          className="key-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!key.trim()) return;
            void bridge()
              .dictation.setKey(key, provider)
              .then((s) => (apply(s), setKey(""), setMsg({ text: D.keySaved })));
          }}
        >
          <input id={id} type="password" autoComplete="off" spellCheck={false} placeholder={D.keyPlaceholderFor[provider]} value={key} onChange={(e) => setKey(e.target.value)} data-testid={id} />
          <button className="btn primary" type="submit" disabled={!key.trim()} data-testid={tid(provider, "-save")}>
            {D.keySave}
          </button>
        </form>
      )}
      {msg && (
        <p className={`hint${msg.error ? " error" : ""}`} data-testid={provider === "openai" ? "dictation-status" : `dictation-${provider}-status`}>
          {msg.text}
        </p>
      )}
    </>
  );
}

export function DictationSettingsDialog({ onClose }: { onClose(): void }) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  const [st, setSt] = useState<DictationStatus | null>(null);
  const [models, setModels] = useState({ transcribeModel: "", groqModel: "", geminiModel: "", cleanupModel: "", titleModel: "", claudeCleanupModel: "", claudeTitleModel: "" });

  const apply = (s: DictationStatus) => {
    setSt(s);
    const { transcribeModel, groqModel, geminiModel, cleanupModel, titleModel, claudeCleanupModel, claudeTitleModel } = s.settings;
    setModels({ transcribeModel, groqModel, geminiModel, cleanupModel, titleModel, claudeCleanupModel, claudeTitleModel });
  };
  useEffect(() => void bridge().dictation.status().then(apply), []);
  if (!st) return null;

  const saveModels = () => void bridge().dictation.setSettings(models).then(apply);
  const text = textModels(st.settings).provider;
  const claude = text === "anthropic";
  // Feldnamen der Modelle des gewählten Text-Anbieters
  const cleanupField = claude ? "claudeCleanupModel" : "cleanupModel";
  const titleField = claude ? "claudeTitleModel" : "titleModel";
  const stt = transcribeTarget(st.settings).provider;
  const sttField = stt === "groq" ? "groqModel" : stt === "gemini" ? "geminiModel" : "transcribeModel";
  const anyKey = API_PROVIDERS.some((p) => st.keys[p].hasKey);
  // Ein Schlüssel wird nur einmal gezeigt, auch wenn Erkennung und Text beim selben Anbieter liegen.
  const textKey: ApiProvider = text;

  return (
    <div className="modal-back" onClick={onClose}>
      <div ref={dialog} className="modal dictation-settings" role="dialog" aria-modal="true" aria-label={D.section} onClick={(e) => e.stopPropagation()} data-testid="dictation-settings">
        <h2>{D.section}</h2>
        <h3>{D.transcribeSection}</h3>
        <div className="fields" style={{ gridTemplateColumns: "180px 1fr" }}>
          <label htmlFor="dictation-transcribe-provider">{D.textProvider}</label>
          <select
            id="dictation-transcribe-provider"
            value={stt}
            onChange={(e) => void bridge().dictation.setSettings({ ...models, transcribeProvider: e.target.value as TranscribeProvider }).then(apply)}
            data-testid="dictation-transcribe-provider"
          >
            {TRANSCRIBE_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {D.providerNames[p]}
              </option>
            ))}
          </select>
        </div>
        <KeyRow key={stt} provider={stt} st={st} apply={apply} />
        <div className="fields" style={{ gridTemplateColumns: "180px 1fr" }}>
          <label htmlFor="dictation-model-transcribe">{D.modelTranscribe}</label>
          <input
            id="dictation-model-transcribe"
            value={models[sttField]}
            onChange={(e) => setModels((m) => ({ ...m, [sttField]: e.target.value }))}
            onBlur={saveModels}
            spellCheck={false}
            data-testid="dictation-model-transcribe"
          />
        </div>

        <h3>{D.textSection}</h3>
        <p className="hint">{D.textSectionHint}</p>
        <div className="fields" style={{ gridTemplateColumns: "180px 1fr" }}>
          <label htmlFor="dictation-text-provider">{D.textProvider}</label>
          <select
            id="dictation-text-provider"
            value={text}
            onChange={(e) => void bridge().dictation.setSettings({ ...models, textProvider: e.target.value as TextProvider }).then(apply)}
            data-testid="dictation-text-provider"
          >
            <option value="openai">{D.providerNames.openai}</option>
            <option value="anthropic">{D.providerNames.anthropic}</option>
          </select>
        </div>
        {textKey !== stt && <KeyRow key={textKey} provider={textKey} st={st} apply={apply} />}

        <label className="menu-row" style={{ padding: 0 }}>
          <input
            type="checkbox"
            checked={st.settings.cleanup}
            onChange={(e) => void bridge().dictation.setSettings({ ...models, cleanup: e.target.checked }).then(apply)}
            data-testid="dictation-cleanup"
          />
          <span>
            {D.cleanup}
            <br />
            <span className="hint">{D.cleanupHint}</span>
          </span>
        </label>
        <div className="fields" style={{ gridTemplateColumns: "180px 1fr" }}>
          <label htmlFor="dictation-model-cleanup">{D.modelCleanup}</label>
          <input
            id="dictation-model-cleanup"
            value={models[cleanupField]}
            disabled={!st.settings.cleanup}
            onChange={(e) => setModels((m) => ({ ...m, [cleanupField]: e.target.value }))}
            onBlur={saveModels}
            spellCheck={false}
            data-testid="dictation-model-cleanup"
          />
        </div>
        <label className="menu-row" style={{ padding: 0 }}>
          <input
            type="checkbox"
            checked={st.settings.autoTitle}
            onChange={(e) => void bridge().dictation.setSettings({ ...models, autoTitle: e.target.checked }).then(apply)}
            data-testid="dictation-auto-title"
          />
          <span>
            {D.autoTitle}
            <br />
            <span className="hint">{claude ? D.autoTitleHintFor(PROVIDER_LABEL.anthropic) : D.autoTitleHint}</span>
          </span>
        </label>
        <div className="fields" style={{ gridTemplateColumns: "180px 1fr" }}>
          <label htmlFor="dictation-model-title">{D.modelTitle}</label>
          <input
            id="dictation-model-title"
            value={models[titleField]}
            onChange={(e) => setModels((m) => ({ ...m, [titleField]: e.target.value }))}
            onBlur={saveModels}
            spellCheck={false}
            data-testid="dictation-model-title"
          />
        </div>

        {st.insecure && anyKey && <p className="hint error">{D.keyInsecure}</p>}
        <p className="hint">{stt === "openai" && text === "openai" ? D.keyHint : D.keyHintFor(PROVIDER_LABEL[stt], PROVIDER_LABEL[text])}</p>
        <div className="buttons">
          <button className="btn" onClick={onClose} data-testid="dictation-settings-close">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
