// Neue Liste (4.6) bzw. Programmier-Liste (4.8, `dev`): Eingabeblatt der Erfassung mit dem Namen; danach öffnet sich die Liste.
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
  const params = useRoute<RouteProp<RootStack, "NewList">>().params;
  const dev = !!params?.dev;
  const [title, setTitle] = useState(params?.title ?? "");
  const sent = useRef(false);
  const ready = !!title.trim();
  // Die Liste öffnet sofort; geschrieben wird im Hintergrund (4.4).
  const create = () => {
    if (!ready || sent.current) return;
    sent.current = true;
    const name = title.trim();
    let shown = false;
    void repo
      .create({ title: name, kind: dev ? "dev-list" : "list" }, (ref) => {
        shown = true;
        if (dev) nav.replace("DevList", { ref });
        else nav.replace("Checklist", { ref });
      })
      .then((o) => {
        if (o.status === "ok") return;
        notify(o, dev ? T.dev.newList : T.lists.newList);
        if (!shown) sent.current = false;
        else if (o.status !== "noop" && navigationRef.isReady()) navigationRef.navigate("NewList", { title: name, dev });
      });
  };
  return (
    <CaptureSheet
      value={title}
      onChangeText={setTitle}
      placeholder={dev ? T.dev.titlePlaceholder : T.lists.titlePlaceholder}
      onSubmit={create}
      ready={ready}
      submitLabel={dev ? T.dev.newList : T.lists.newList}
      testID={{ input: "new-list-title", submit: "new-list-create" }}
    />
  );
}
