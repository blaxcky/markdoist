// Einträge einer Liste anfügen (4.6): Eingabeblatt der Erfassung ohne Chips. Bleibt nach jedem Eintrag offen;
// Zurück oder ein Tipp neben das Blatt schließt es. Mit `dev` legt es Einträge einer Programmier-Liste an (4.8).
import { useState } from "react";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { createDevItem, T, type Outcome } from "@markdoist/app";
import { devIndex } from "@markdoist/core";
import { CaptureSheet } from "../components/capture-sheet";
import { useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import type { RootStack } from "../navigation";

export function AddItemScreen() {
  const { ref, dev } = useRoute<RouteProp<RootStack, "AddItem">>().params;
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    // Gemeldet wird nur ein Fehlschlag; dann kommt der Text zurück ins Feld.
    const list = dev ? devIndex(state.index).lists.find((v) => v.task.ref === ref) : undefined;
    const run: Promise<Outcome> = !dev
      ? repo.perform(ref, { type: "addItem", text: t }, T.lists.addItem)
      : list
        ? createDevItem(repo, list, t)
        : Promise.resolve({ status: "error", message: "Liste nicht gefunden" });
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
      placeholder={dev ? T.dev.addItem : T.lists.addItem}
      onSubmit={add}
      ready={!!text.trim()}
      keepOpen
      submitLabel={T.lists.addItem}
      testID={{ input: "add-item", submit: "add-item-send" }}
    />
  );
}
