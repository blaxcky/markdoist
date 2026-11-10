// Einträge einer Liste anfügen (4.6): Eingabeblatt der Erfassung ohne Chips. Bleibt nach jedem Eintrag offen;
// Zurück oder ein Tipp neben das Blatt schließt es. Mit `dev` legt es Einträge einer Programmier-Liste an (4.10):
// nur Text mit Absätzen, dazu ein Mikrofon, das sofort aufnimmt; Titel und Art schlägt danach die KI vor.
import { useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createDevItemFromText, dictationErrorText, suggestDevTitle, T, type Outcome } from "@markdoist/app";
import { devIndex } from "@markdoist/core";
import { CaptureSheet } from "../components/capture-sheet";
import { DictateBar } from "../components/dictate-bar";
import { useDictation } from "../dictation/use-dictation";
import { suggestTitleAuto } from "../dictation/title";
import { useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import type { RootStack } from "../navigation";

export function AddItemScreen() {
  const { ref, dev } = useRoute<RouteProp<RootStack, "AddItem">>().params;
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const [text, setText] = useState("");
  const list = dev ? devIndex(state.index).lists.find((v) => v.task.ref === ref) : undefined;

  /** Programmier-Eintrag aus Text; `label` meldet den Erfolg (Diktat), sonst nur Fehlschläge. */
  const addDev = (t: string, label?: string): Promise<Outcome> => {
    if (!list) return Promise.resolve({ status: "error", message: "Liste nicht gefunden" });
    return createDevItemFromText(repo, list, t).then((o) => {
      if (o.status === "ok") {
        if (label) notify({ status: "ok", message: label });
        if (o.ref) void suggestDevTitle(repo, o.ref, suggestTitleAuto);
      }
      return o;
    });
  };

  const dictation = useDictation({
    enabled: !!list && !list.readOnly,
    ctx: () => ({ list: list?.task.fields.title }),
    // Diktiert: Der Eintrag entsteht ohne weiteren Tipp (4.10).
    onResult: (r) => void addDev(r.text, !r.cleaned && r.cleanupError ? `${T.dev.created} · ${T.dictation.notCleaned}` : T.dev.created).then((o) => o.status !== "ok" && notify(o, T.dev.addItem)),
    onError: (kind, detail) => {
      notify({ status: "error", message: dictationErrorText(kind, detail) });
      if (kind === "nokey") nav.navigate("Settings");
    },
  });

  const add = () => {
    const t = dev ? text.replace(/\s+$/, "") : text.trim();
    if (!t.trim()) return;
    setText("");
    // Gemeldet wird nur ein Fehlschlag; dann kommt der Text zurück ins Feld.
    const run: Promise<Outcome> = dev ? addDev(t) : repo.perform(ref, { type: "addItem", text: t }, T.lists.addItem);
    void run.then((o) => {
      if (o.status === "ok") return;
      notify(o, T.lists.addItem);
      setText((cur) => cur || t);
    });
  };
  return (
    <CaptureSheet
      value={text}
      onChangeText={setText}
      placeholder={dev ? T.dev.composePlaceholder : T.lists.addItem}
      onSubmit={add}
      ready={!!text.trim()}
      keepOpen
      paragraphs={dev}
      extra={
        dev && list && !list.readOnly ? (
          <DictateBar state={dictation.state} onStart={() => void dictation.start()} onStop={() => void dictation.stop()} onCancel={() => void dictation.cancel()} onRetry={() => void dictation.retry()} />
        ) : undefined
      }
      submitLabel={dev ? T.dev.file : T.lists.addItem}
      testID={{ input: "add-item", submit: "add-item-send" }}
    />
  );
}
