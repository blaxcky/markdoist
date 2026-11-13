// Blatt „Mehr“ (4.5): Sammlungen mit aufklappbaren Bereichen (Listen, Müllabfuhr, Programmieren) und das Archiv.
// Wie die Seitenleiste am Desktop; was auf- oder zugeklappt ist, bleibt gerätelokal erhalten.
import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T, type SideGroupData } from "@markdoist/app";
import { kv } from "../repo";
import { useTheme } from "../theme";
import { ChevronIcon } from "./icons";

export type MoreGroupKey = "lists" | "waste" | "dev";
type Expanded = Record<MoreGroupKey, boolean>;
const KEY = "moreExpanded";
const DEFAULT: Expanded = { lists: true, waste: false, dev: false };

export interface MoreGroup {
  key: MoreGroupKey;
  label: string;
  icon: ReactNode;
  data: SideGroupData;
  /** Übersicht öffnen */
  onOpen(): void;
  /** Unterpunkt direkt öffnen */
  onOpenChild(ref: string): void;
  testID: string;
}

export interface MoreItem {
  label: string;
  icon: ReactNode;
  meta?: string | null;
  onPress(): void;
  testID: string;
}

interface Props {
  open: boolean;
  onClose(): void;
  groups: (MoreGroup | false)[];
  archive: MoreItem[];
}

export function MoreSheet({ open, onClose, groups, archive }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<Expanded>(DEFAULT);
  useEffect(() => {
    void kv.get(KEY).then((raw) => {
      if (!raw) return;
      try {
        setExpanded({ ...DEFAULT, ...(JSON.parse(raw) as Partial<Expanded>) });
      } catch {
        // unlesbar: Standard behalten
      }
    });
  }, []);
  if (!open) return null;
  const toggle = (k: MoreGroupKey) =>
    setExpanded((o) => {
      const n = { ...o, [k]: !o[k] };
      void kv.set(KEY, JSON.stringify(n));
      return n;
    });
  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  const ripple = { color: c.surfaceHigh };
  const divider = <View style={{ height: 1, backgroundColor: c.divider, marginLeft: 50 }} />;
  const heading = (text: string) => <Text style={{ color: c.muted, fontSize: 13, fontWeight: "600", paddingHorizontal: 6 }}>{text}</Text>;
  const meta = (text: string | null | undefined) => (text ? <Text style={{ color: c.muted, fontSize: 13 }}>{text}</Text> : null);
  const shown = groups.filter((g): g is MoreGroup => !!g);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 12, paddingBottom: insets.bottom + 12, maxHeight: "85%" }}>
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.outline, marginBottom: 10 }} />
          <Text style={{ color: c.fg, fontSize: 18, fontWeight: "600", paddingHorizontal: 6, paddingBottom: 14 }}>{T.views.more}</Text>
          <ScrollView contentContainerStyle={{ gap: 18 }}>
            <View style={{ gap: 6 }}>
              {heading(T.side.collections)}
              <View style={{ backgroundColor: c.surface, borderRadius: 18, overflow: "hidden" }}>
                {shown.map((g, gi) => {
                  const hasKids = g.data.kids.length > 0;
                  const isOpen = hasKids && expanded[g.key];
                  return (
                    <View key={g.key}>
                      {gi > 0 && divider}
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Pressable
                          testID={g.testID}
                          onPress={() => go(g.onOpen)}
                          android_ripple={ripple}
                          accessibilityRole="button"
                          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 16, paddingRight: hasKids ? 4 : 16, minHeight: 56 }}
                        >
                          <View style={{ width: 20, alignItems: "center" }}>{g.icon}</View>
                          <Text style={{ flex: 1, color: c.fg, fontSize: 16 }}>{g.label}</Text>
                          {!isOpen && meta(g.data.summary)}
                        </Pressable>
                        {hasKids && (
                          <Pressable
                            testID={`${g.testID}-toggle`}
                            onPress={() => toggle(g.key)}
                            android_ripple={{ ...ripple, borderless: true, radius: 24 }}
                            accessibilityRole="button"
                            accessibilityLabel={T.side.toggle(g.label)}
                            accessibilityState={{ expanded: isOpen }}
                            style={{ width: 52, height: 56, alignItems: "center", justifyContent: "center" }}
                          >
                            <ChevronIcon color={c.muted} size={16} dir={isOpen ? "down" : "right"} />
                          </Pressable>
                        )}
                      </View>
                      {isOpen &&
                        g.data.kids.map((k) => (
                          <Pressable
                            key={k.ref}
                            testID={`${g.testID}-item`}
                            onPress={() => go(() => g.onOpenChild(k.ref))}
                            android_ripple={ripple}
                            accessibilityRole="button"
                            style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingLeft: 50, paddingRight: 16 }}
                          >
                            {k.dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.dot }} />}
                            <Text numberOfLines={1} style={{ flex: 1, color: c.fg, fontSize: 15 }}>
                              {k.title}
                            </Text>
                            {meta(k.meta)}
                          </Pressable>
                        ))}
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              {heading(T.side.archive)}
              <View style={{ backgroundColor: c.surface, borderRadius: 18, overflow: "hidden" }}>
                {archive.map((it, i) => (
                  <View key={it.label}>
                    {i > 0 && divider}
                    <Pressable
                      testID={it.testID}
                      onPress={() => go(it.onPress)}
                      android_ripple={ripple}
                      accessibilityRole="button"
                      style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, minHeight: 56 }}
                    >
                      <View style={{ width: 20, alignItems: "center" }}>{it.icon}</View>
                      <Text style={{ flex: 1, color: c.fg, fontSize: 16 }}>{it.label}</Text>
                      {meta(it.meta)}
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
