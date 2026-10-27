// Neue Liste (4.6): Eingabeblatt der Erfassung mit dem Namen; danach öffnet sich die Liste.
import { useRef, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { CaptureSheet } from "../components/capture-sheet";
import { useRepo } from "../repo";
import { useNotify } from "../notify";
import { navigationRef, type RootStack } from "../navigation";

export function NewListScreen() {
  const repo = useRepo();
  const notify = useNotify();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const [title, setTitle] = useState(useRoute<RouteProp<RootStack, "NewList">>().params?.title ?? "");
  const sent = useRef(false);
  const ready = !!title.trim();
  // Die Liste öffnet sofort; geschrieben wird im Hintergrund (4.4).
  const create = () => {
    if (!ready || sent.current) return;
    sent.current = true;
    const name = title.trim();
    let shown = false;
    void repo
      .create({ title: name, kind: "list" }, (ref) => {
        shown = true;
        nav.replace("Checklist", { ref });
      })
      .then((o) => {
        if (o.status === "ok") return;
        notify(o, T.lists.newList);
        if (!shown) sent.current = false;
        else if (o.status !== "noop" && navigationRef.isReady()) navigationRef.navigate("NewList", { title: name });
      });
  };
  return (
    <CaptureSheet
      value={title}
      onChangeText={setTitle}
      placeholder={T.lists.titlePlaceholder}
      onSubmit={create}
      ready={ready}
      submitLabel={T.lists.newList}
      testID={{ input: "new-list-title", submit: "new-list-create" }}
    />
  );
}
