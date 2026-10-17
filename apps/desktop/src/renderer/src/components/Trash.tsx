// Papierkorb (4.4, F004): Wiederherstellen; Leeren nur ausdrücklich und ohne Undo.
import { useState } from "react";
import { T, type Outcome, type Repository, type RepoState } from "@markdoist/app";
import { useDialog } from "../dialog";

interface Props {
  repo: Repository;
  state: RepoState;
  onOutcome(o: Outcome, label?: string): void;
}

export function Trash({ repo, state, onOutcome }: Props) {
  const [confirm, setConfirm] = useState<{ ref: string; name: string; hash: string }[] | null>(null);
  return (
    <div className="list" data-testid="trash">
      {state.trash.length === 0 && <div className="empty">Der Papierkorb ist leer.</div>}
      {state.trash.map((m) => (
        <div key={m.ref} className="row" data-testid="trash-row">
          <div className="main">
            <div className="title">{m.name}</div>
          </div>
          <button className="btn" onClick={() => void repo.restoreFromTrash(m.ref).then((o) => onOutcome(o, T.actions.restore))}>
            {T.actions.restore}
          </button>
        </div>
      ))}
      {state.trash.length > 0 && (
        <div className="actions">
          <button className="btn danger" onClick={() => void repo.trashHashes().then(setConfirm)} data-testid="empty-trash">
            {T.actions.emptyTrash}
          </button>
        </div>
      )}
      {confirm && (
        <ConfirmEmpty
          count={confirm.length}
          names={confirm.map((c) => c.name)}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const list = confirm;
            setConfirm(null);
            void repo.emptyTrash(list).then((o) => onOutcome(o, T.actions.emptyTrash));
          }}
        />
      )}
    </div>
  );
}

function ConfirmEmpty({ count, names, onCancel, onConfirm }: { count: number; names: string[]; onCancel(): void; onConfirm(): void }) {
  const ref = useDialog<HTMLDivElement>(onCancel);
  return (
        <div className="modal-back" onClick={onCancel}>
          <div ref={ref} className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={T.actions.emptyTrash}>
            <h2>{T.actions.emptyTrash}</h2>
            <p>
              {count} Datei(en) werden <b>endgültig</b> gelöscht. Das lässt sich nicht rückgängig machen. Inzwischen geänderte Dateien bleiben erhalten.
            </p>
            <ul style={{ maxHeight: 200, overflow: "auto" }}>
              {names.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <div className="buttons">
              <button className="btn" onClick={onCancel}>Abbrechen</button>
              <button className="btn danger" onClick={onConfirm} data-testid="confirm-empty">
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
  );
}
