// Snackbar mit „Rückgängig“ (4.4). Sie steht über dem Plus-Button, nicht darauf.
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { T, type Outcome } from "@markdoist/app";
import { useRepo } from "./repo";
import { useTheme } from "./theme";

type Notify = (o: Outcome, label?: string) => void;
const Ctx = createContext<Notify>(() => {});
export const useNotify = () => use(Ctx);

/** meldet einen Abstand an und gibt die Abmeldung zurück */
const InsetCtx = createContext<(px: number) => () => void>(() => () => {});

/** Platz unten, den die Snackbar freilassen muss (Tableiste, Plus-Button), solange der Bildschirm fokussiert ist. */
export function useSnackbarInset(px: number) {
  const register = use(InsetCtx);
  useFocusEffect(useCallback(() => register(px), [register, px]));
}

export function NotifyProvider({ children }: { children: ReactNode }) {
  const repo = useRepo();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // Beim Tabwechsel kann der neue Bildschirm sich vor der Abmeldung des alten anmelden: zuletzt Angemeldeter gilt.
  const [registered, setRegistered] = useState<{ id: number; px: number }[]>([]);
  const seq = useRef(0);
  const register = useCallback((px: number) => {
    const id = ++seq.current;
    setRegistered((l) => [...l, { id, px }]);
    return () => setRegistered((l) => l.filter((e) => e.id !== id));
  }, []);
  const inset = registered.at(-1)?.px;
  const [msg, setMsg] = useState<{ text: string; error?: boolean; undo?: boolean; id: number } | null>(null);
  const notify = useCallback<Notify>((o, label) => {
    // „Rückgängig“ nur, wenn die Aktion einen Undo-Eintrag angelegt hat (4.4).
    if (o.status === "ok") setMsg({ text: o.message ?? label ?? "Gespeichert", undo: o.undoable === true, id: Date.now() });
    else if (o.status !== "noop") setMsg({ text: o.message, error: true, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.error ? 7000 : 5000);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <InsetCtx value={register}>
      <Ctx value={notify}>
        {children}
        {msg && (
          // Neue Meldung blendet über die alte (key), ein anderer Abstand gleitet (layout).
          <Animated.View
            key={msg.id}
            entering={reduced ? undefined : FadeInDown.duration(180)}
            exiting={reduced ? undefined : FadeOut.duration(150)}
            layout={reduced ? undefined : LinearTransition.duration(180)}
            testID="snackbar"
            style={{ position: "absolute", left: 8, right: 8, bottom: inset ?? insets.bottom + 16, borderRadius: 8, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: msg.error ? c.danger : c.fg, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
          >
            <Text selectable style={{ flex: 1, color: msg.error ? "#fff" : c.bg }}>{msg.text}</Text>
            {msg.undo && (
              <Pressable
                testID="snackbar-undo"
                hitSlop={8}
                onPress={() => {
                  setMsg(null);
                  void repo.undo().then((o) => (o.status === "ok" ? setMsg({ text: o.message ?? "Rückgängig", id: Date.now() }) : o.status !== "noop" && notify(o)));
                }}
              >
                <Text style={{ color: c.primaryContainer, fontWeight: "700" }}>{T.actions.undo.toUpperCase()}</Text>
              </Pressable>
            )}
          </Animated.View>
        )}
      </Ctx>
    </InsetCtx>
  );
}
