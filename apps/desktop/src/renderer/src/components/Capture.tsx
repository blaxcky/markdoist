// Schnellerfassung (4.1): nur Titel nötig, Notiz optional; landet immer im Eingang ohne Termin.
import { useEffect, useRef, useState } from "react";
import { T } from "@markdoist/app";

interface Props {
  onCancel(): void;
  onCapture(title: string, note: string, edit: boolean): void;
}

export function Capture({ onCancel, onCapture }: Props) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (edit: boolean) => {
    if (title.trim()) onCapture(title.trim(), note, edit);
  };
  return (
    <div className="modal-back" onClick={onCancel}>
      <div
        className="modal"
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
        <h2>{T.actions.capture}</h2>
        <input ref={input} placeholder="Titel" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="capture-title" aria-label="Titel" />
        <textarea placeholder="Notiz (optional)" rows={4} value={note} onChange={(e) => setNote(e.target.value)} data-testid="capture-note" aria-label="Notiz" />
        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
          Neue Aufgaben landen im Eingang, ohne Termin. <kbd>Enter</kbd> erfassen, <kbd>Shift</kbd>+<kbd>Enter</kbd> erfassen &amp; bearbeiten.
        </div>
        <div className="buttons">
          <button className="btn" onClick={onCancel}>Abbrechen</button>
          <button className="btn" disabled={!title.trim()} onClick={() => submit(true)} data-testid="capture-edit">
            Erfassen &amp; bearbeiten
          </button>
          <button className="btn primary" disabled={!title.trim()} onClick={() => submit(false)} data-testid="capture-submit">
            Erfassen
          </button>
        </div>
      </div>
    </div>
  );
}
