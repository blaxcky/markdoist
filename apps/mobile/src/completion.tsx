// Abhak-Ablauf (gemeinsam in @markdoist/app) als Hook: optimistischer Haken, eingefrorene Liste, weiches Einklappen.
import { createContext, use, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ComponentProps, type RefObject } from "react";
import Animated, { Easing, LinearTransition, useReducedMotion } from "react-native-reanimated";
import type { FlashListRef } from "@shopify/flash-list";
import { COMPLETE_COLLAPSE_MS, COMPLETE_HOLD_MS, createCompletionFlow, type CompletionPhase, type Outcome, type Repository } from "@markdoist/app";
import type { TaskView } from "@markdoist/core";

export const COLLAPSE = LinearTransition.duration(COMPLETE_COLLAPSE_MS).easing(Easing.bezier(0.77, 0, 0.175, 1));
const CollapseCtx = createContext(false);

/**
 * Zellbehälter für FlashList: Nur während des Einklappens gleiten die Zellen an ihre neue Stelle.
 * Sonst würde jede Neuvermessung der Liste mitanimiert.
 */
export function CollapseCell({ index: _index, ...props }: ComponentProps<typeof Animated.View> & { index?: number }) {
  return <Animated.View {...props} layout={use(CollapseCtx) ? COLLAPSE : undefined} />;
}
export const CollapseProvider = CollapseCtx;

interface Args<T> {
  repo: Repository;
  notify(o: Outcome, label: string): void;
  /** aktuell berechnete Liste; während des Ablaufs bleibt der Stand vom ersten Tipp stehen */
  live: T[];
  refs: readonly string[];
  /** FlashList: vor dem Einklappen auf Layout-Animation vorbereiten (ScrollView braucht das nicht) */
  list?: RefObject<FlashListRef<T> | null>;
}

export function useCompletionFlow<T>({ repo, notify, live, refs, list }: Args<T>) {
  const reduced = useReducedMotion();
  const cur = useRef({ live, refs, notify, reduced });
  useLayoutEffect(() => {
    cur.current = { live, refs, notify, reduced };
  });
  const flow = useMemo(
    () =>
      createCompletionFlow({
        perform: (ref, action, label) => repo.perform(ref, action, label),
        notify: (o, label) => cur.current.notify(o, label),
        isPresent: (ref) => cur.current.refs.includes(ref),
        holdMs: () => (cur.current.reduced ? 0 : COMPLETE_HOLD_MS),
      }),
    [repo],
  );
  // Einklappen in zwei Schritten: erst die Zellen auf Übergang stellen (arming, Liste noch eingefroren),
  // im nächsten Bild die Liste freigeben (collapsing), danach wieder ohne Übergang (idle).
  const [stage, setStage] = useState<"idle" | "arming" | "collapsing">("idle");
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // Zeilen, die nach dem Schreiben stehen bleiben (Serie, Listeneintrag): Bis die Liste freigegeben ist,
  // zeigen sie weiter den Zielzustand, sonst blitzte im eingefrorenen Stand kurz der alte Haken auf.
  const settled = useRef(new Set<string>());
  useEffect(() => {
    let frozen = false;
    let pending = flow.getState().pending;
    return flow.subscribe(() => {
      const s = flow.getState();
      for (const [k, p] of pending) if (p === "checked" && !s.pending.has(k)) settled.current.add(k);
      pending = s.pending;
      const next = s.frozen;
      if (frozen && !next && !cur.current.reduced) setStage("arming");
      frozen = next;
      rerender();
    });
  }, [flow]);
  useEffect(() => {
    if (stage === "arming") {
      const f = requestAnimationFrame(() => {
        list?.current?.prepareForLayoutAnimationRender();
        setStage("collapsing");
      });
      return () => cancelAnimationFrame(f);
    }
    if (stage === "collapsing") {
      const t = setTimeout(() => setStage("idle"), COMPLETE_COLLAPSE_MS + 100);
      return () => clearTimeout(t);
    }
  }, [stage, list]);
  const state = flow.getState();
  const hold = state.frozen || stage === "arming";
  const snap = useRef<T[] | null>(null);
  // Ausgeblendete Zeilen bleiben unsichtbar, solange der eingefrorene Stand noch gezeigt wird (arming).
  const gone = useRef(new Set<string>());
  if (!hold) {
    snap.current = null;
    gone.current.clear();
    settled.current.clear();
  }
  return {
    shown: hold && snap.current ? snap.current : live,
    collapsing: stage !== "idle",
    phase: (ref: string): CompletionPhase | undefined => state.pending.get(ref) ?? (gone.current.has(ref) ? "leaving" : settled.current.has(ref) ? "checked" : undefined),
    start: (v: TaskView) => {
      if (!snap.current) snap.current = cur.current.live;
      flow.start(v);
    },
    /** Listeneintrag (4.6): gleicher Ablauf, still bei Erfolg */
    startAction: (key: string, label: string, run: () => Promise<Outcome>) => {
      if (!snap.current) snap.current = cur.current.live;
      flow.startAction(key, label, run, { quiet: true });
    },
    left: (ref: string) => {
      gone.current.add(ref);
      flow.left(ref);
    },
  };
}
