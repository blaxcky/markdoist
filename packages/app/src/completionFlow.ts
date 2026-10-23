// Abhaken mit Rückmeldung: Haken sofort zeigen, kurz halten, Zeile ausblenden und einklappen.
// Framework-frei; Desktop und Android hängen je einen kleinen Hook darüber.
import type { TaskView } from "@markdoist/core";
import type { Outcome } from "./repository";
import { toggleDoneAction } from "./listActions";

/** Mindestdauer ab dem Tipp, bevor die Zeile ausblendet: Der Haken soll sichtbar sein. */
export const COMPLETE_HOLD_MS = 250;
export const COMPLETE_FADE_MS = 150;
export const COMPLETE_COLLAPSE_MS = 220;

/** checked: Zielzustand wird angezeigt, Schreiben läuft · leaving: Zeile blendet aus und klappt ein */
export type CompletionPhase = "checked" | "leaving";

export interface CompletionState {
  pending: ReadonlyMap<string, CompletionPhase>;
  /** Liste nicht neu aufbauen, solange eine Zeile im Ablauf ist: Sie bleibt so an ihrer Stelle. */
  frozen: boolean;
}

export interface CompletionFlowOptions {
  perform(ref: string, action: ReturnType<typeof toggleDoneAction>["action"], label: string): Promise<Outcome>;
  /** Steht die Aufgabe nach dem Schreiben noch in der Live-Liste (Serie, Suche mit Erledigten)? */
  isPresent(ref: string): boolean;
  notify(o: Outcome, label: string): void;
  /** 0 bei reduzierter Bewegung */
  holdMs(): number;
  /** Sicherung, falls die Zeile ihr Ende nie meldet (z. B. Ansicht gewechselt) */
  leaveTimeoutMs?: number;
  wait?: (ms: number) => Promise<void>;
}

export interface CompletionFlow {
  getState(): CompletionState;
  subscribe(fn: () => void): () => void;
  /** Gibt false zurück, wenn die Aufgabe schon im Ablauf ist (Doppeltipp). */
  start(view: TaskView): boolean;
  /** Die Zeile hat Ausblenden und Einklappen beendet. */
  left(ref: string): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createCompletionFlow(opts: CompletionFlowOptions): CompletionFlow {
  const wait = opts.wait ?? sleep;
  const listeners = new Set<() => void>();
  let state: CompletionState = { pending: new Map(), frozen: false };

  const set = (ref: string, phase: CompletionPhase | null) => {
    const pending = new Map(state.pending);
    if (phase) pending.set(ref, phase);
    else pending.delete(ref);
    state = { pending, frozen: pending.size > 0 };
    listeners.forEach((l) => l());
  };

  const left = (ref: string) => {
    if (state.pending.get(ref) === "leaving") set(ref, null);
  };

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start(view) {
      const ref = view.task.ref;
      if (state.pending.has(ref)) return false;
      const { action, label } = toggleDoneAction(view);
      set(ref, "checked");
      // Schreiben sofort starten; die Meldung erscheint nach der Haltezeit zusammen mit dem Ausblenden.
      // Die Extrarunde wait(0) lässt die Oberfläche den Stand nach emit() erst übernehmen, bevor isPresent fragt.
      void Promise.all([opts.perform(ref, action, label), wait(opts.holdMs())]).then(
        async ([o]) => {
          await wait(0);
          opts.notify(o, label);
          // Fehlschlag: Zeile springt zurück und verschwindet nicht wie erledigt (PLAN1 7.6).
          if (o.status !== "ok" || opts.isPresent(ref)) return set(ref, null);
          set(ref, "leaving");
          void wait(opts.leaveTimeoutMs ?? 1500).then(() => left(ref));
        },
        () => set(ref, null),
      );
      return true;
    },
    left,
  };
}
