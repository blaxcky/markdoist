// Snackbar mit „Rückgängig“ (4.4).
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { T, type Outcome } from "@markdoist/app";
import { useRepo } from "./repo";
import { useTheme } from "./theme";

type Notify = (o: Outcome, label?: string) => void;
const Ctx = createContext<Notify>(() => {});
export const useNotify = () => use(Ctx);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const repo = useRepo();
  const c = useTheme();
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
    <Ctx value={notify}>
      {children}
      {msg && (
        <View
          testID="snackbar"
          style={{ position: "absolute", left: 16, right: 16, bottom: 90, borderRadius: 8, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: msg.error ? c.danger : c.fg, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
        >
          <Text selectable style={{ flex: 1, color: msg.error ? "#fff" : c.bg }}>{msg.text}</Text>
          {msg.undo && (
            <Pressable
              testID="snackbar-undo"
              onPress={() => {
                setMsg(null);
                void repo.undo().then((o) => (o.status === "ok" ? setMsg({ text: o.message ?? "Rückgängig", id: Date.now() }) : o.status !== "noop" && notify(o)));
              }}
            >
              <Text style={{ color: c.primaryContainer, fontWeight: "700" }}>{T.actions.undo.toUpperCase()}</Text>
            </Pressable>
          )}
        </View>
      )}
    </Ctx>
  );
}
