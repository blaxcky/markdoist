// Schnellerfassung (4.1): nur Titel nötig, Notiz optional; landet immer im Eingang ohne Termin.
import { useEffect, useRef, useState } from "react";
import { appendDictation, appendTitle, T, type DictationErrorKind } from "@markdoist/app";
import { DictateButton } from "./DictateButton";
import { IconInbox } from "./Icons";

interface Props {
  /** Startwerte, wenn eine Erfassung im Hintergrund scheiterte (7.6) */
  initial?: { title: string; note: string } | null;
  onCancel(): void;
  onCapture(title: string, note: string, edit: boolean): void;
  /** Fehler beim Diktieren als Hinweis (4.13) */
  onDictationError(kind: DictationErrorKind): void;
}

export function Capture({ initial, onCancel, onCapture, onDictationError }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => input.current?.focus(), []);
  // Je ein Mikrofon für Titel (roh) und Beschreibung (bereinigt), 4.13; solange eines läuft, ist das andere ausgeblendet.
  const [dictBusy, setDictBusy] = useState<"title" | "note" | null>(null);
  const busyFor = (target: "title" | "note") => (busy: boolean) => setDictBusy((x) => (busy ? target : x === target ? null : x));
  const submit = (edit: boolean) => {
    if (title.trim()) onCapture(title.trim(), note, edit);
  };
  return (
    <div className="modal-back" onClick={onCancel}>
      <div
        className="modal quick-add"
        role="dialog"
        aria-label={T.actions.capture}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.ctrlKey || e.target === input.current)) {
            e.preventDefault();
            submit(e.shiftKey);
          }
        }}
        data-testid="capture"
      >
        <div className="qa-body">
          {/* Mehrzeilig, damit lange Titel umbrechen; Enter erfasst, eingefügte Zeilenumbrüche werden zu Leerzeichen. */}
          <div className="qa-row">
            <textarea ref={input} className="qa-title" rows={1} placeholder="Aufgabenname" value={title} onChange={(e) => setTitle(e.target.value.replace(/[ \t]*[\r\n]+[ \t]*/g, " "))} data-testid="capture-title" aria-label="Titel" />
            {dictBusy !== "note" && (
              <DictateButton
                testId="capture-dictate-title"
                label={T.dictation.recordTitle}
                ctx={() => ({ kind: "task", target: "title" })}
                onResult={(r) => setTitle((cur) => appendTitle(cur, r.text))}
                onBusy={busyFor("title")}
                onError={onDictationError}
              />
            )}
          </div>
          <div className="qa-row">
            <textarea className="qa-desc" placeholder="Beschreibung" rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="capture-note" aria-label="Notiz" />
            {dictBusy !== "title" && (
              <DictateButton
                testId="capture-dictate-note"
                ctx={() => ({ kind: "task", title })}
                onResult={(r) => setNote((cur) => appendDictation(cur, r.text))}
                onBusy={busyFor("note")}
                onError={onDictationError}
              />
            )}
          </div>
        </div>
        <div className="qa-hint">
          Neue Aufgaben landen im Eingang, ohne Termin. <kbd>Enter</kbd> erfassen, <kbd>Shift</kbd>+<kbd>Enter</kbd> erfassen &amp; bearbeiten.
        </div>
        <div className="qa-foot">
          <span className="qa-chip">
            <IconInbox size={16} /> {T.views.inbox}
          </span>
          <button className="btn" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="btn" disabled={!title.trim()} onClick={() => submit(true)} data-testid="capture-edit">
            Erfassen &amp; bearbeiten
          </button>
          <button className="btn primary" disabled={!title.trim()} onClick={() => submit(false)} data-testid="capture-submit">
            Aufgabe hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}
