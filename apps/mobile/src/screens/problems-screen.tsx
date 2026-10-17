// Probleme (4.3) und Konfliktvarianten (7.4) auf Android.
import { Pressable, ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { problemsView } from "@markdoist/core";
import { useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";
import type { RootStack } from "../navigation";

export function ProblemsScreen() {
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const entries = problemsView(state.index);
  const card = { backgroundColor: c.surface, borderRadius: 12, padding: 12, gap: 8 } as const;
  const btn = (label: string, onPress: () => void, testID?: string) => (
    <Pressable onPress={onPress} testID={testID} style={{ alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.outline }}>
      <Text style={{ color: c.fg }}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {state.recovery.map((r) => (
        <View key={r.opId} style={card}>
          <Text selectable style={{ color: c.danger, fontWeight: "600" }}>Wiederherstellung: {r.name}</Text>
          <Text selectable style={{ color: c.fg }}>{r.message}</Text>
          {r.desired !== null && <Text selectable style={{ color: c.muted, fontFamily: "monospace", fontSize: 12 }} numberOfLines={12}>{r.desired}</Text>}
          {btn("Erledigt markieren", () => void repo.resolveRecovery(r.opId))}
        </View>
      ))}
      {entries.length === 0 && state.recovery.length === 0 && <Text style={{ color: c.muted }}>Keine Probleme.</Text>}
      {entries.map((p, i) => {
        if (p.kind === "conflict") {
          const files = p.conflict!.files;
          return (
            <View key={i} style={card} testID="problem-conflict">
              <Text selectable style={{ color: c.warn }}>{p.diagnostics[0]!.message}</Text>
              {files.map((f) => (
                <View key={f.ref} style={{ gap: 4 }}>
                  <Text selectable style={{ color: c.fg, fontWeight: "600" }}>{f.name}</Text>
                  <Text selectable style={{ color: c.muted, fontSize: 12 }}>
                    {T.fields.status}: {f.fields.status} · {T.fields.priority}: {f.fields.priority} · {T.fields.due}: {String(f.data.due ?? "–")}
                  </Text>
                  {btn(T.actions.keepVariant, () => void repo.keepVariant(f.ref, files.filter((x) => x !== f).map((x) => x.ref)).then((o) => notify(o, "Variante behalten")), "keep-variant")}
                </View>
              ))}
              {btn(`${T.actions.keepBoth} (Kopie erhält neue ID)`, () => {
                for (const f of files.slice(1)) void repo.keepBoth(f.ref).then((o) => notify(o, "Beide behalten"));
              })}
            </View>
          );
        }
        if (p.kind === "file") {
          const f = p.file!;
          return (
            <View key={i} style={card} testID="problem-file">
              <Text selectable style={{ color: c.fg, fontWeight: "600" }}>{f.name}</Text>
              <Text selectable style={{ color: c.warn }}>{p.diagnostics.map((d) => d.message).join("; ")}</Text>
              {f.kind === "unrecognized" && btn(T.actions.adopt, () => void repo.adopt(f.ref).then((o) => notify(o, T.actions.adopt)))}
            </View>
          );
        }
        const v = p.view!;
        return (
          <Pressable key={i} style={card} onPress={() => nav.navigate("Detail", { ref: v.task.ref })} testID="problem-task">
            <Text style={{ color: c.fg, fontWeight: "600" }}>{v.task.fields.title}</Text>
            <Text selectable style={{ color: c.warn }}>{p.diagnostics.map((d) => d.message).join("; ")}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
