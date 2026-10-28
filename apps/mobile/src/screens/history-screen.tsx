// Verlauf (4.4): die letzten Aktionen dieses Geräts, jede einzeln zurücknehmbar.
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { T, UNDO_LIMIT, undoHistory, type HistoryItem, type HistoryStatus, type UndoEntry } from "@markdoist/app";
import { useRepo, useRepoState } from "../repo";
import { useNotify } from "../notify";
import { useTheme, type Theme } from "../theme";
import { CheckCircleIcon, CheckIcon, Glyph, PlusIcon } from "../components/icons";

const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

const BLOCKED: Partial<Record<HistoryStatus, string>> = {
  newer: "Erst die neuere Aktion zurücknehmen",
  changed: "Datei wurde seitdem geändert",
  missing: "Datei nicht mehr vorhanden",
};

function dayLabel(at: number | undefined, now: Date): string {
  if (at === undefined) return "Früher";
  const d = new Date(at);
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Heute";
  if (days === 1) return "Gestern";
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

const time = (at: number | undefined) => (at === undefined ? "" : new Date(at).toTimeString().slice(0, 5));

function KindIcon({ e, color }: { e: UndoEntry; color: string }): ReactNode {
  if (e.kind === "create") return <PlusIcon color={color} size={16} />;
  if (e.kind === "trash") return <Glyph color={color} size={15}>✕</Glyph>;
  if (e.kind === "restore") return <Glyph color={color} size={17}>↺</Glyph>;
  if (e.kind === "rename") return <Glyph color={color} size={14} bold>Aa</Glyph>;
  if (e.label === T.views.done) return <CheckCircleIcon color={color} size={17} />;
  return <Glyph color={color} size={15}>✎</Glyph>;
}

function Row({ item, first, c, onUndo }: { item: HistoryItem; first: boolean; c: Theme; onUndo(): void }) {
  const { entry: e, status } = item;
  const undone = status === "undone";
  const blocked = BLOCKED[status];
  const title = e.title ?? e.ref.replace(/^.*\//, "").replace(/\.md$/i, "");
  return (
    <View
      testID={`history-${title}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 10, borderTopWidth: first ? 0 : 1, borderTopColor: c.divider }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceHigh, alignItems: "center", justifyContent: "center" }}>
        <KindIcon e={e} color={c.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          <Text style={{ color: c.fg, fontWeight: "500" }}>{e.label}</Text>
          {e.at !== undefined ? ` · ${time(e.at)}` : ""}
        </Text>
        <Text numberOfLines={2} style={{ color: status === "open" ? c.fg : c.muted, fontSize: 16, lineHeight: 22, textDecorationLine: undone ? "line-through" : "none" }}>
          {title}
        </Text>
        {undone && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <CheckIcon color={c.onDoneContainer} size={12} weight={2} />
            <Text style={{ color: c.onDoneContainer, fontSize: 13 }}>Zurückgenommen</Text>
          </View>
        )}
        {blocked && <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{blocked}</Text>}
      </View>
      {status === "open" && (
        <Pressable
          testID={`history-undo-${title}`}
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel={`${T.actions.undo}: ${e.label}, ${title}`}
          android_ripple={{ color: c.surfaceHigh, borderless: false }}
          style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.outline }}
        >
          <Text style={{ color: c.primary, fontSize: 14, fontWeight: "500" }}>{T.actions.undo}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function HistoryScreen() {
  const repo = useRepo();
  const state = useRepoState();
  const notify = useNotify();
  const c = useTheme();
  const now = new Date();
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const it of undoHistory(state)) {
    const label = dayLabel(it.entry.at, now);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(it);
  }
  const undo = (id: string) => void repo.undoEntry(id).then((o) => o.status !== "ok" && notify(o));
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 12, paddingBottom: 32, gap: 8 }} testID="history">
      {groups.length === 0 && <Text style={{ color: c.muted, padding: 4 }}>Noch nichts im Verlauf.</Text>}
      {groups.map((g) => (
        <View key={g.label} style={{ gap: 8 }}>
          <Text style={{ color: c.muted, fontSize: 14, fontWeight: "500", marginTop: 8, marginHorizontal: 4 }}>{g.label}</Text>
          <View style={{ backgroundColor: c.surface, borderRadius: 16, overflow: "hidden" }}>
            {g.items.map((it, i) => (
              <Row key={`${it.entry.id}-${it.status}`} item={it} first={i === 0} c={c} onUndo={() => undo(it.entry.id)} />
            ))}
          </View>
        </View>
      ))}
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 12 }}>
        {`Nur die letzten ${UNDO_LIMIT} Aktionen dieses Geräts.\nÄltere fallen von selbst heraus.`}
      </Text>
    </ScrollView>
  );
}
