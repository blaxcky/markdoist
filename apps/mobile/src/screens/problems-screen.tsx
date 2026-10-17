// Probleme (4.3) und Konfliktvarianten (7.4) auf Android.
import { Pressable, ScrollView, Text, View } from "react-native";
import { diffLines } from "diff";
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
          {r.desired !== null && btn("Gewünschte Fassung übernehmen", () => void repo.applyRecovery(r.opId).then((o) => notify(o, "Fassung übernommen")))}
          {btn("Aktuellen Stand behalten", () => void repo.resolveRecovery(r.opId))}
        </View>
      ))}
      {repo.orphanDrafts().map((d) => (
        <View key={d.ref} style={card} testID="orphan-draft">
          <Text selectable style={{ color: c.warn, fontWeight: "600" }}>Entwurf ohne Datei ({d.ref.replace(/^tasks\//, "")})</Text>
          <Text selectable style={{ color: c.fg, fontFamily: "monospace", fontSize: 12 }} numberOfLines={8}>{d.text}</Text>
          {btn("Als neue Datei speichern", () => void repo.resolveDraftConflict(d.ref, "both").then((o) => notify(o, "Als neue Datei gespeichert")))}
          {btn("Verwerfen", () => void repo.discardDraft(d.ref))}
        </View>
      ))}
      {entries.length === 0 && state.recovery.length === 0 && repo.orphanDrafts().length === 0 && <Text style={{ color: c.muted }}>Keine Probleme.</Text>}
      {entries.map((p, i) => {
        if (p.kind === "conflict") {
          const files = p.conflict!.files;
          return (
            <View key={i} style={card} testID="problem-conflict">
              <Text selectable style={{ color: c.warn }}>{p.diagnostics[0]!.message}</Text>
              {(() => {
                const keys = [...new Set(files.flatMap((f) => Object.keys(f.data)))].filter(
                  (k) => JSON.stringify(files[0]!.data[k]) !== JSON.stringify(files[1]?.data[k]),
                );
                return keys.length ? (
                  <View style={{ gap: 2 }}>
                    <Text style={{ color: c.muted, fontSize: 12 }}>Abweichende Felder</Text>
                    {keys.map((k) => (
                      <Text key={k} selectable style={{ color: c.fg, fontSize: 12 }}>
                        {k}: {files.map((f) => (f.data[k] === undefined ? "–" : typeof f.data[k] === "string" ? f.data[k] : JSON.stringify(f.data[k]))).join("  ↔  ")}
                      </Text>
                    ))}
                  </View>
                ) : null;
              })()}
              {files[1] && files[0]!.body !== files[1].body && (
                <View style={{ borderWidth: 1, borderColor: c.outline, borderRadius: 6, padding: 6 }}>
                  {diffLines(files[0]!.body, files[1].body).map((part, j) => (
                    <Text key={j} selectable style={{ fontFamily: "monospace", fontSize: 12, color: c.fg, backgroundColor: part.added ? "rgba(46,125,50,0.2)" : part.removed ? "rgba(198,40,40,0.2)" : "transparent" }}>
                      {part.value}
                    </Text>
                  ))}
                </View>
              )}
              {files.map((f) => (
                <View key={f.ref} style={{ gap: 4 }}>
                  <Text selectable style={{ color: c.fg, fontWeight: "600" }}>{f.name}</Text>
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
