// Ansichtsgröße (4.5): Ctrl+Plus/Minus/0 in 10-%-Schritten, gerätelokal gespeichert.
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 2;

export type ZoomCommand = "in" | "out" | "reset";

/** Auf eine Nachkommastelle runden und begrenzen; Unbrauchbares wird 1. */
export function clampZoom(z: unknown): number {
  if (typeof z !== "number" || !Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
}

export function stepZoom(current: number, cmd: ZoomCommand): number {
  if (cmd === "reset") return 1;
  return clampZoom(current + (cmd === "in" ? 0.1 : -0.1));
}

/** Tastendruck aus before-input-event; Plus auf deutscher Tastatur, Ziffernblock und US-Belegung (=). */
export function zoomCommand(input: { type: string; key: string; control: boolean; meta: boolean; alt: boolean }): ZoomCommand | null {
  if (input.type !== "keyDown" || !(input.control || input.meta) || input.alt) return null;
  if (input.key === "+" || input.key === "=") return "in";
  if (input.key === "-") return "out";
  if (input.key === "0") return "reset";
  return null;
}
