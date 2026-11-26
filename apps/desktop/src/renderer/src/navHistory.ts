// Verlauf der Ansichten für die Maustasten Zurück/Vor am Desktop (4.5).
// Ein Ort ist die Ansicht plus der darin geöffnete Unterpunkt (Liste, Programmier-Liste, Abfuhrart).

export interface NavLocation {
  view: string;
  child: string | null;
}

export interface NavHistory {
  entries: NavLocation[];
  index: number;
}

/** Höchstzahl gemerkter Orte; ältere fallen vorne heraus. */
export const NAV_HISTORY_MAX = 50;

export const emptyHistory = (): NavHistory => ({ entries: [], index: -1 });

const same = (a: NavLocation, b: NavLocation) => a.view === b.view && a.child === b.child;

/** Neuen Ort merken: verwirft die Vor-Einträge, doppelt den aktuellen Ort nicht. */
export function pushLocation(h: NavHistory, loc: NavLocation): NavHistory {
  const cur = h.entries[h.index];
  if (cur && same(cur, loc)) return h;
  const entries = [...h.entries.slice(0, h.index + 1), loc].slice(-NAV_HISTORY_MAX);
  return { entries, index: entries.length - 1 };
}

/**
 * Einen Schritt zurück (`-1`) oder vor (`+1`). `resolve` liefert den heute gültigen Ort eines Eintrags oder null,
 * wenn er nicht mehr erreichbar ist (gelöschte Liste); solche Einträge werden übersprungen, ebenso Einträge, die
 * auf den aktuellen Ort hinauslaufen. Ohne erreichbares Ziel bleibt der Verlauf unverändert (`target` null).
 */
export function step(
  h: NavHistory,
  dir: -1 | 1,
  current: NavLocation,
  resolve: (loc: NavLocation) => NavLocation | null,
): { history: NavHistory; target: NavLocation | null } {
  for (let i = h.index + dir; i >= 0 && i < h.entries.length; i += dir) {
    const loc = resolve(h.entries[i]!);
    if (!loc || same(loc, current)) continue;
    const entries = [...h.entries];
    entries[i] = loc;
    return { history: { entries, index: i }, target: loc };
  }
  return { history: h, target: null };
}
