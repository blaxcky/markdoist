// Neue Liste (4.6): Eingabeblatt der Erfassung mit dem Namen; danach öffnet sich die Liste.
import { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { CaptureSheet } from "../components/capture-sheet";
import { useRepo } from "../repo";
import { useNotify } from "../notify";
import type { RootStack } from "../navigation";

export function NewListScreen() {
  const repo = useRepo();
  const notify = useNotify();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !!title.trim() && !busy;
  const create = async () => {
    if (!ready) return;
    setBusy(true);
    const o = await repo.create({ title: title.trim(), kind: "list" });
    setBusy(false);
    if (o.status === "ok" && o.ref) nav.replace("Checklist", { ref: o.ref });
    else notify(o, T.lists.newList);
  };
  return (
    <CaptureSheet
      value={title}
      onChangeText={setTitle}
      placeholder={T.lists.titlePlaceholder}
      onSubmit={() => void create()}
      ready={ready}
      submitLabel={T.lists.newList}
      testID={{ input: "new-list-title", submit: "new-list-create" }}
    />
  );
}
