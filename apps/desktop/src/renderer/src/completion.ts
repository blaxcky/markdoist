// Abhak-Ablauf (gemeinsam in @markdoist/app) als React-Hook: optimistischer Haken, eingefrorene Liste, Ausblenden.
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { COMPLETE_HOLD_MS, createCompletionFlow, type CompletionPhase, type Outcome, type Repository } from "@markdoist/app";
import type { TaskView } from "@markdoist/core";

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Args<T> {
  repo: Repository;
  notify(o: Outcome, label: string): void;
  /** aktuell berechnete Liste; während des Ablaufs wird der Stand vom ersten Tipp gezeigt */
  live: T;
  refs: readonly string[];
  /** Ansicht/Suche: Wechselt sie, gilt der eingefrorene Stand nicht mehr */
  key: string;
}

export function useCompletionFlow<T>({ repo, notify, live, refs, key }: Args<T>) {
  const cur = useRef({ live, refs, key, notify });
  useLayoutEffect(() => {
    cur.current = { live, refs, key, notify };
  });
  const flow = useMemo(
    () =>
      createCompletionFlow({
        perform: (ref, action, label) => repo.perform(ref, action, label),
        notify: (o, label) => cur.current.notify(o, label),
        isPresent: (ref) => cur.current.refs.includes(ref),
        holdMs: () => (reducedMotion() ? 0 : COMPLETE_HOLD_MS),
      }),
    [repo],
  );
  const state = useSyncExternalStore(flow.subscribe, flow.getState);
  const snap = useRef<{ key: string; value: T } | null>(null);
  if (!state.frozen) snap.current = null;
  return {
    shown: state.frozen && snap.current?.key === key ? snap.current.value : live,
    frozen: state.frozen,
    phase: (ref: string): CompletionPhase | undefined => state.pending.get(ref),
    start: (v: TaskView) => {
      if (!flow.getState().frozen) snap.current = { key: cur.current.key, value: cur.current.live };
      flow.start(v);
    },
    /** Listeneintrag (4.6): gleicher Ablauf, still bei Erfolg */
    startAction: (key: string, label: string, run: () => Promise<Outcome>) => {
      if (!flow.getState().frozen) snap.current = { key: cur.current.key, value: cur.current.live };
      flow.startAction(key, label, run, { quiet: true });
    },
    left: flow.left,
  };
}
