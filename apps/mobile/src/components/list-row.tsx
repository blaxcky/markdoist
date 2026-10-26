// Zeile einer Liste (4.6) in der Listenübersicht und in der Suche.
import { Pressable, Text } from "react-native";
import { T } from "@markdoist/app";
import { findCheckboxes, type TaskView } from "@markdoist/core";
import { useTheme } from "../theme";
import { ChecklistIcon } from "./icons";

export function listProgress(v: TaskView): { done: number; total: number } {
  const items = findCheckboxes(v.task.body);
  return { done: items.filter((c) => c.checked).length, total: items.length };
}

export function ListRow({ view, first, last, onOpen }: { view: TaskView; first?: boolean; last?: boolean; onOpen(): void }) {
  const c = useTheme();
  const { done, total } = listProgress(view);
  const title = view.task.fields.title;
  return (
    <Pressable
      onPress={onOpen}
      android_ripple={{ color: c.surfaceHigh }}
      testID={`list-${title}`}
      accessibilityRole="button"
      accessibilityLabel={total ? `${title}, ${done} von ${total} abgehakt` : title}
      style={{
        marginHorizontal: 8,
        marginBottom: last ? 0 : 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: c.surface,
        borderTopLeftRadius: first ? 12 : 0,
        borderTopRightRadius: first ? 12 : 0,
        borderBottomLeftRadius: last ? 12 : 0,
        borderBottomRightRadius: last ? 12 : 0,
      }}
    >
      <ChecklistIcon color={c.muted} size={18} />
      <Text numberOfLines={2} style={{ flex: 1, color: c.fg, fontSize: 16, lineHeight: 22 }}>
        {title}
      </Text>
      {total > 0 && (
        <Text style={{ color: total === done ? c.primary : c.muted, fontSize: 13, fontVariant: ["tabular-nums"] }} testID={`progress-${title}`}>
          {T.lists.progress(done, total)}
        </Text>
      )}
    </Pressable>
  );
}

