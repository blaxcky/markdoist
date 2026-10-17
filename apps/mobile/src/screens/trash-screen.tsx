// Papierkorb (F004): Wiederherstellen, Leeren nur ausdrücklich und endgültig.
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { T } from "@markdoist/app";
import { useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import { useTheme } from "../theme";

export function TrashScreen() {
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const empty = async () => {
    const list = await repo.trashHashes();
    Alert.alert(T.actions.emptyTrash, `${list.length} Datei(en) werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.`, [
      { text: "Abbrechen", style: "cancel" },
      { text: "Endgültig löschen", style: "destructive", onPress: () => void repo.emptyTrash(list).then((o) => notify(o, T.actions.emptyTrash)) },
    ]);
  };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 8 }}>
      {state.trash.length === 0 && <Text style={{ color: c.muted }}>Der Papierkorb ist leer.</Text>}
      {state.trash.map((m) => (
        <View key={m.ref} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.outline }}>
          <Text style={{ flex: 1, color: c.fg }} numberOfLines={2}>{m.name}</Text>
          <Pressable onPress={() => void repo.restoreFromTrash(m.ref).then((o) => notify(o, T.actions.restore))} testID={`restore-${m.name}`} style={{ padding: 8 }}>
            <Text style={{ color: c.primary }}>{T.actions.restore}</Text>
          </Pressable>
        </View>
      ))}
      {state.trash.length > 0 && (
        <Pressable onPress={() => void empty()} style={{ marginTop: 16, alignSelf: "flex-start", padding: 10, borderRadius: 20, borderWidth: 1, borderColor: c.danger }}>
          <Text style={{ color: c.danger }}>{T.actions.emptyTrash}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
