// Verlauf (4.4): die letzten Aktionen dieses Geräts, jede einzeln zurücknehmbar.
import { T, UNDO_LIMIT, undoHistory, type HistoryItem, type HistoryStatus, type Outcome, type Repository, type RepoState } from "@markdoist/app";

interface Props {
  repo: Repository;
  state: RepoState;
  onOutcome(o: Outcome, label?: string): void;
}

const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

const NOTE: Partial<Record<HistoryStatus, string>> = {
  undone: "Zurückgenommen",
  newer: "Erst die neuere Aktion zurücknehmen",
  changed: "Datei wurde seitdem geändert",
  missing: "Datei nicht mehr vorhanden",
};

function dayLabel(at: number | undefined, now: Date): string {
  if (at === undefined) return "Früher";
  const d = new Date(at);
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Heute";
  if (days === 1) return "Gestern";
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

export function History({ repo, state, onOutcome }: Props) {
  const now = new Date();
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const it of undoHistory(state)) {
    const label = dayLabel(it.entry.at, now);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(it);
  }
  return (
    <div className="list" data-testid="history">
      {groups.length === 0 && <div className="empty">Noch nichts im Verlauf.</div>}
      {groups.map((g) => (
        <div key={g.label} className="group">
          <div className="section">
            <span>{g.label}</span>
          </div>
          {g.items.map(({ entry: e, status }) => {
            const title = e.title ?? e.ref.replace(/^.*\//, "").replace(/\.md$/i, "");
            return (
              <div key={`${e.id}-${status}`} className={`row${status === "undone" ? " done" : ""}`} data-testid="history-row" data-title={title}>
                <div className="main">
                  <div className="sub">
                    <span className="meta">
                      <b>{e.label}</b>
                      {e.at !== undefined && <span>{new Date(e.at).toTimeString().slice(0, 5)}</span>}
                    </span>
                  </div>
                  <div className="title">{title}</div>
                  {NOTE[status] && <div className="desc">{NOTE[status]}</div>}
                </div>
                {status === "open" && (
                  <button
                    className="btn"
                    aria-label={`${T.actions.undo}: ${e.label}, ${title}`}
                    data-testid="history-undo"
                    onClick={() => void repo.undoEntry(e.id).then((o) => o.status !== "ok" && onOutcome(o))}
                  >
                    {T.actions.undo}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="empty">Nur die letzten {UNDO_LIMIT} Aktionen dieses Geräts. Ältere fallen von selbst heraus.</div>
    </div>
  );
}
