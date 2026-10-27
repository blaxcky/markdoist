// Schnellerfassung (4.1): nur Titel nötig, Notiz optional; landet immer im Eingang ohne Termin.
import { useEffect, useRef, useState } from "react";
import { T } from "@markdoist/app";
import { IconInbox } from "./Icons";

interface Props {
  /** Startwerte, wenn eine Erfassung im Hintergrund scheiterte (7.6) */
  initial?: { title: string; note: string } | null;
  onCancel(): void;
  onCapture(title: string, note: string, edit: boolean): void;
}

export function Capture({ initial, onCancel, onCapture }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
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
          <input ref={input} className="qa-title" placeholder="Aufgabenname" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="capture-title" aria-label="Titel" />
          <textarea className="qa-desc" placeholder="Beschreibung" rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="capture-note" aria-label="Notiz" />
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
