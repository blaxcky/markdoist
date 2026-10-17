// Probleme (4.3) und Konfliktvarianten (7.4): ganze Variante behalten oder beide behalten.
import { useState } from "react";
import { diffLines } from "diff";
import { useDialog } from "../dialog";
import { T, type Outcome, type Repository, type RepoState } from "@markdoist/app";
import { problemsView, type ConflictGroup, type Task } from "@markdoist/core";

interface Props {
  repo: Repository;
  state: RepoState;
  onSelect(ref: string): void;
  onOutcome(o: Outcome, label?: string): void;
}

export function Problems({ repo, state, onSelect, onOutcome }: Props) {
  const entries = problemsView(state.index);
  const [conflict, setConflict] = useState<ConflictGroup | null>(null);
  return (
    <div className="list" data-testid="problems">
      {state.recovery.map((r) => (
        <div key={r.opId} className="diag error">
          <b>Wiederherstellung: {r.name}</b> – {r.message}
          {r.desired !== null && (
            <details>
              <summary>Gewünschte Fassung</summary>
              <pre className="diff">{r.desired}</pre>
            </details>
          )}
          <div className="actions" style={{ padding: "6px 0 0" }}>
            {r.desired !== null && (
              <button className="btn" onClick={() => void repo.applyRecovery(r.opId).then((o) => onOutcome(o, "Fassung übernommen"))} data-testid="apply-recovery">
                Gewünschte Fassung übernehmen
              </button>
            )}
            <button className="btn" onClick={() => void repo.resolveRecovery(r.opId)}>Aktuellen Stand behalten</button>
          </div>
        </div>
      ))}
      {repo.orphanDrafts().map((d) => (
        <div key={d.ref} className="diag warn" data-testid="orphan-draft">
          <b>Entwurf ohne Datei</b> ({d.ref.replace(/^tasks\//, "")}): Die Datei wurde extern gelöscht oder umbenannt.
          <pre className="diff">{d.text}</pre>
          <div className="actions" style={{ padding: "6px 0 0" }}>
            <button className="btn" onClick={() => void repo.resolveDraftConflict(d.ref, "both").then((o) => onOutcome(o, "Als neue Datei gespeichert"))}>
              Als neue Datei speichern
            </button>
            <button className="btn" onClick={() => void repo.discardDraft(d.ref)}>Verwerfen</button>
          </div>
        </div>
      ))}
      {entries.length === 0 && state.recovery.length === 0 && repo.orphanDrafts().length === 0 && <div className="empty">Keine Probleme.</div>}
      {entries.map((p, i) => {
        if (p.kind === "conflict") {
          const c = p.conflict!;
          return (
            <div key={i} className="diag warn" data-testid="problem-conflict">
              {p.diagnostics[0]!.message}
              <div className="actions" style={{ padding: "6px 0 0" }}>
                <button className="btn" onClick={() => setConflict(c)} data-testid="open-conflict">
                  Varianten vergleichen
                </button>
              </div>
            </div>
          );
        }
        if (p.kind === "file") {
          const f = p.file!;
          return (
            <div key={i} className="diag warn" data-testid="problem-file">
              <b>{f.name}</b>: {p.diagnostics.map((d) => d.message).join("; ")}
              {f.kind === "unrecognized" && (
                <div className="actions" style={{ padding: "6px 0 0" }}>
                  <button className="btn" onClick={() => void repo.adopt(f.ref).then((o) => onOutcome(o, T.actions.adopt))}>
                    {T.actions.adopt}
                  </button>
                </div>
              )}
            </div>
          );
        }
        const v = p.view!;
        return (
          <div key={i} className="diag warn" style={{ cursor: "pointer" }} onClick={() => onSelect(v.task.ref)} data-testid="problem-task">
            <b>{v.task.fields.title}</b> ({v.task.name}): {p.diagnostics.map((d) => d.message).join("; ")}
          </div>
        );
      })}
      {conflict && (
        <ConflictDialog
          group={conflict}
          onClose={() => setConflict(null)}
          onKeep={async (keep) => {
            const o = await repo.keepVariant(keep.ref, conflict.files.filter((f) => f !== keep).map((f) => f.ref));
            onOutcome(o, "Variante behalten");
            setConflict(null);
          }}
          onKeepBoth={async () => {
            for (const f of conflict.files.slice(1)) {
              const o = await repo.keepBoth(f.ref);
              onOutcome(o, "Beide behalten");
            }
            setConflict(null);
          }}
        />
      )}
    </div>
  );
}

function ConflictDialog({
  group,
  onClose,
  onKeep,
  onKeepBoth,
}: {
  group: ConflictGroup;
  onClose(): void;
  onKeep(t: Task): void;
  onKeepBoth(): void;
}) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  const [a, b] = group.files as [Task, Task];
  const keys = [...new Set([...Object.keys(a.data), ...Object.keys(b.data)])];
  const show = (v: unknown) => (v === undefined ? "–" : typeof v === "string" ? v : JSON.stringify(v));
  const parts = diffLines(a.body, b.body);
  return (
    <div className="modal-back" onClick={onClose}>
      <div ref={dialog} className="modal" style={{ width: "min(900px, 95vw)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Konfliktvarianten" data-testid="conflict-dialog">
        <h2>Konfliktvarianten</h2>
        <p style={{ margin: 0, fontSize: 12 }}>Es wird nichts automatisch entschieden. Die nicht gewählte Variante wandert in den Papierkorb.</p>
        <div className="variants">
          {[a, b].map((t) => (
            <div key={t.ref}>
              <b>{t.name}</b>
              <table>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className={JSON.stringify(a.data[k]) !== JSON.stringify(b.data[k]) ? "differs" : ""}>{show(t.data[k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn primary" onClick={() => onKeep(t)} data-testid="keep-variant">
                {T.actions.keepVariant}
              </button>
            </div>
          ))}
        </div>
        <div className="diff">
          {parts.map((p, i) => (
            <span key={i} className={p.added ? "add" : p.removed ? "del" : ""}>
              {p.value}
            </span>
          ))}
        </div>
        <div className="buttons">
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn" onClick={onKeepBoth} data-testid="keep-both">
            {T.actions.keepBoth} (Kopie erhält neue ID)
          </button>
        </div>
      </div>
    </div>
  );
}
