// Einträge einer Liste anfügen (4.6): Eingabeblatt der Erfassung ohne Chips. Bleibt nach jedem Eintrag offen;
// Zurück oder ein Tipp neben das Blatt schließt es.
import { useState } from "react";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { T } from "@markdoist/app";
import { CaptureSheet } from "../components/capture-sheet";
import { useRepo } from "../repo";
import { useNotify } from "../notify";
import type { RootStack } from "../navigation";

export function AddItemScreen() {
  const { ref } = useRoute<RouteProp<RootStack, "AddItem">>().params;
  const repo = useRepo();
  const notify = useNotify();
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    // Gemeldet wird nur ein Fehlschlag; dann kommt der Text zurück ins Feld.
    void repo.perform(ref, { type: "addItem", text: t }, T.lists.addItem).then((o) => {
      if (o.status === "ok") return;
      notify(o, T.lists.addItem);
      setText((cur) => cur || t);
    });
  };
  return (
    <CaptureSheet
      value={text}
      onChangeText={setText}
      placeholder={T.lists.addItem}
      onSubmit={add}
      ready={!!text.trim()}
      keepOpen
      submitLabel={T.lists.addItem}
      testID={{ input: "add-item", submit: "add-item-send" }}
    />
  );
}
