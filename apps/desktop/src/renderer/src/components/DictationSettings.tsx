// Einstellungen „Diktieren“ (4.9, 4.10): Schlüssel nur maskiert, Modelle, Bereinigung und Titelvorschlag an/aus.
import { useEffect, useState } from "react";
import { T } from "@markdoist/app";
import { bridge, type DictationStatus } from "../bridge";
import { useDialog } from "../dialog";

export function DictationSettingsDialog({ onClose }: { onClose(): void }) {
  const D = T.dictation;
  const dialog = useDialog<HTMLDivElement>(onClose);
  const [st, setSt] = useState<DictationStatus | null>(null);
  const [key, setKey] = useState("");
  const [models, setModels] = useState({ transcribeModel: "", cleanupModel: "", titleModel: "" });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (s: DictationStatus) => {
    setSt(s);
    setModels({ transcribeModel: s.settings.transcribeModel, cleanupModel: s.settings.cleanupModel, titleModel: s.settings.titleModel });
  };
  useEffect(() => void bridge().dictation.status().then(apply), []);
  if (!st) return null;

  const saveModels = () => void bridge().dictation.setSettings(models).then(apply);

  return (
    <div className="modal-back" onClick={onClose}>
      <div ref={dialog} className="modal dictation-settings" role="dialog" aria-modal="true" aria-label={D.section} onClick={(e) => e.stopPropagation()} data-testid="dictation-settings">
        <h2>{D.section}</h2>
        <label htmlFor="dictation-key">{D.keyLabel}</label>
        {st.hasKey ? (
          <div className="key-row">
            <span className="masked" data-testid="dictation-key-masked">
              {st.masked}
            </span>
            <button
              className="btn"
              disabled={busy}
              data-testid="dictation-key-check"
              onClick={() => {
                setBusy(true);
                void bridge()
                  .dictation.check()
                  .then((r) => setMsg(r.ok ? { text: D.keyOk } : { text: D.errors[r.kind], error: true }))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "…" : D.keyCheck}
            </button>
            <button className="btn" data-testid="dictation-key-remove" onClick={() => void bridge().dictation.clearKey().then((s) => (apply(s), setMsg({ text: D.keyRemoved })))}>
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
                .dictation.setKey(key)
                .then((s) => (apply(s), setKey(""), setMsg({ text: D.keySaved })));
            }}
          >
            <input id="dictation-key" type="password" autoComplete="off" spellCheck={false} placeholder={D.keyPlaceholder} value={key} onChange={(e) => setKey(e.target.value)} data-testid="dictation-key" />
            <button className="btn primary" type="submit" disabled={!key.trim()} data-testid="dictation-key-save">
              {D.keySave}
            </button>
          </form>
        )}
        {msg && (
          <p className={`hint${msg.error ? " error" : ""}`} data-testid="dictation-status">
            {msg.text}
          </p>
        )}
        {st.insecure && st.hasKey && <p className="hint error">{D.keyInsecure}</p>}
        <p className="hint">{D.keyHint}</p>

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
          <label htmlFor="dictation-model-transcribe">{D.modelTranscribe}</label>
          <input
            id="dictation-model-transcribe"
            value={models.transcribeModel}
            onChange={(e) => setModels((m) => ({ ...m, transcribeModel: e.target.value }))}
            onBlur={saveModels}
            spellCheck={false}
            data-testid="dictation-model-transcribe"
          />
          <label htmlFor="dictation-model-cleanup">{D.modelCleanup}</label>
          <input
            id="dictation-model-cleanup"
            value={models.cleanupModel}
            disabled={!st.settings.cleanup}
            onChange={(e) => setModels((m) => ({ ...m, cleanupModel: e.target.value }))}
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
            <span className="hint">{D.autoTitleHint}</span>
          </span>
        </label>
        <div className="fields" style={{ gridTemplateColumns: "180px 1fr" }}>
          <label htmlFor="dictation-model-title">{D.modelTitle}</label>
          <input
            id="dictation-model-title"
            value={models.titleModel}
            onChange={(e) => setModels((m) => ({ ...m, titleModel: e.target.value }))}
            onBlur={saveModels}
            spellCheck={false}
            data-testid="dictation-model-title"
          />
        </div>
        <div className="buttons">
          <button className="btn" onClick={onClose} data-testid="dictation-settings-close">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
