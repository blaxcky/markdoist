// Bereiche der Seitenleiste (Desktop) und des Blatts „Mehr“ (Android), 4.5:
// Listen, Müllabfuhr und Programmieren lassen sich aufklappen und zeigen ihre Unterpunkte.
import { devListProgress, devListsView, listProgress, listsView, wasteView, type Index, type Temporal } from "@markdoist/core";
import { T } from "./texts";

/** Höchstens so viele Listen je Bereich; alle zeigt ein Klick auf den Bereich selbst */
export const SIDE_LIMIT = 3;

export interface SideChild {
  ref: string;
  title: string;
  /** Kurzinfo rechts: offene Einträge bzw. nächster Abholtag */
  meta: string | null;
  /** Farbpunkt einer Abfuhrart */
  dot?: string;
}

export interface SideGroupData {
  kids: SideChild[];
  /** Zahl aller Unterpunkte */
  total: number;
  /** Zusammenfassung am zugeklappten Bereich */
  summary: string | null;
}

export interface SideCollections {
  lists: SideGroupData;
  waste: SideGroupData;
  dev: SideGroupData;
}

const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** „Fr 13.11.“ */
export function shortDay(d: Temporal.PlainDate): string {
  return `${WD[d.dayOfWeek - 1]} ${String(d.day).padStart(2, "0")}.${String(d.month).padStart(2, "0")}.`;
}

/** Farbe der Tonne zu einer Abfuhrart, erkannt am Namen; sonst neutral. */
export function wasteColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("bio")) return "#8a5a2b";
  if (t.includes("papier") || t.includes("pappe")) return "#246fe0";
  if (t.includes("gelb") || t.includes("verpack") || t.includes("wertstoff") || t.includes("plastik")) return "#e0b000";
  if (t.includes("glas")) return "#2e9d5b";
  if (t.includes("rest")) return "#5f5f5f";
  return "#a8a29e";
}

const count = (n: number) => (n > 0 ? String(n) : null);

/** Unterpunkte der drei Bereiche: Listen und Programmier-Listen zuletzt geänderte zuerst, Abfuhrarten nach nächstem Termin. */
export function sideCollections(idx: Index, limit = SIDE_LIMIT): SideCollections {
  const lists = listsView(idx);
  const dev = devListsView(idx);
  const waste = wasteView(idx);
  return {
    lists: {
      total: lists.length,
      summary: count(lists.length),
      kids: lists.slice(0, limit).map((v) => ({ ref: v.task.ref, title: v.task.fields.title, meta: count(listProgress(v).open) })),
    },
    dev: {
      total: dev.length,
      summary: count(dev.length),
      kids: dev.slice(0, limit).map((v) => ({ ref: v.task.ref, title: v.task.fields.title, meta: count(devListProgress(idx, v).open) })),
    },
    // Abfuhrarten sind wenige; alle stehen da. Zugeklappt kein Abholtag am Bereich, das wäre zu viel.
    waste: {
      total: waste.length,
      summary: null,
      kids: waste.map((e) => ({ ref: e.view.task.ref, title: e.view.task.fields.title, meta: e.next ? shortDay(e.next) : T.side.noDates, dot: wasteColor(e.wasteType) })),
    },
  };
}
