// Verlauf (4.4): die Einträge des Undo-Journals und die zuletzt zurückgenommenen, neueste zuerst.
import { newerOnSameFile, type RepoState, type UndoEntry } from "./repository";

/**
 * open: lässt sich zurücknehmen; undone: schon zurückgenommen; newer: erst die neuere Aktion auf
 * derselben Datei; changed: Datei seitdem anders geändert; missing: Datei nicht mehr da.
 */
export type HistoryStatus = "open" | "undone" | "newer" | "changed" | "missing";

export interface HistoryItem {
  entry: UndoEntry;
  status: HistoryStatus;
}

export function undoHistory(state: Pick<RepoState, "undo" | "undone" | "files" | "trash">): HistoryItem[] {
  const trash = new Set(state.trash.map((m) => m.ref));
  const items: HistoryItem[] = state.undo.map((entry) => {
    if (newerOnSameFile(state.undo, entry)) return { entry, status: "newer" };
    const f = state.files.get(entry.ref);
    if (f) return { entry, status: f.hash === entry.afterHash ? "open" : "changed" };
    return { entry, status: trash.has(entry.ref) ? "open" : "missing" };
  });
  for (const entry of state.undone) items.push({ entry, status: "undone" });
  // Neueste zuerst; Einträge ohne Zeitpunkt (ältere App-Stände) behalten ihre Reihenfolge am Ende.
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (b.it.entry.at ?? -1) - (a.it.entry.at ?? -1) || b.i - a.i)
    .map((x) => x.it);
}
