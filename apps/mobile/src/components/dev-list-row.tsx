// Zeile einer Programmier-Liste (4.8) in der Übersicht und in der Suche; ohne `view` die Gruppe „Ohne Liste“.
import { Pressable, Text } from "react-native";
import { T } from "@markdoist/app";
import { devListProgress, type Index, type TaskView } from "@markdoist/core";
import { useTheme } from "../theme";
import { CodeIcon } from "./icons";

export function DevListRow({ idx, view, first, last, onOpen }: { idx: Index; view: TaskView | null; first?: boolean; last?: boolean; onOpen(): void }) {
  const c = useTheme();
  const { done, total } = devListProgress(idx, view);
  const title = view?.task.fields.title ?? T.dev.orphans;
  return (
    <Pressable
      onPress={onOpen}
      android_ripple={{ color: c.surfaceHigh }}
      testID={view ? `dev-list-${title}` : "dev-orphans"}
      accessibilityRole="button"
      accessibilityLabel={total ? `${title}, ${done} von ${total} erledigt` : title}
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
      <CodeIcon color={c.muted} size={15} />
      <Text numberOfLines={2} style={{ flex: 1, color: c.fg, fontSize: 16, lineHeight: 22, fontStyle: view ? "normal" : "italic" }}>
        {title}
      </Text>
      {total > 0 && (
        <Text style={{ color: total === done ? c.primary : c.muted, fontSize: 13, fontVariant: ["tabular-nums"] }} testID={`dev-progress-${title}`}>
          {T.dev.progress(done, total)}
        </Text>
      )}
    </Pressable>
  );
}
