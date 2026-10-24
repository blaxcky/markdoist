// Aktionsblatt mit Gruppen und Erklärzeilen (Serien-Aktionen im Detail).
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";

export interface SheetAction {
  label: string;
  onPress(): void;
  description?: string;
  icon?: ReactNode;
  testID?: string;
  danger?: boolean;
}

export interface SheetGroup {
  heading?: string;
  items: (SheetAction | null | false | undefined)[];
}

interface Props {
  open: boolean;
  onClose(): void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  groups: SheetGroup[];
}

export function GroupedSheet({ open, onClose, title, subtitle, icon, groups }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  if (!open) return null;
  const visible = groups.map((g) => ({ ...g, items: g.items.filter(Boolean) as SheetAction[] })).filter((g) => g.items.length);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 12, paddingBottom: insets.bottom + 12, maxHeight: "85%" }}>
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.outline, marginBottom: 10 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 6, paddingBottom: 14 }}>
            {icon && <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.primaryContainer, alignItems: "center", justifyContent: "center" }}>{icon}</View>}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: c.fg, fontSize: 18, fontWeight: "600" }}>{title}</Text>
              {subtitle && <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>}
            </View>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14 }}>
            {visible.map((g, gi) => (
              <View key={gi} style={{ gap: 6 }}>
                {g.heading && <Text style={{ color: c.muted, fontSize: 13, fontWeight: "600", paddingHorizontal: 6 }}>{g.heading}</Text>}
                <View style={{ backgroundColor: c.surface, borderRadius: 18, overflow: "hidden" }}>
                  {g.items.map((it, i) => (
                    <View key={it.label}>
                      {i > 0 && <View style={{ height: 1, backgroundColor: c.divider, marginLeft: 50 }} />}
                      <Pressable
                        testID={it.testID}
                        onPress={() => {
                          onClose();
                          it.onPress();
                        }}
                        android_ripple={{ color: c.surfaceHigh }}
                        accessibilityRole="menuitem"
                        style={{ flexDirection: "row", alignItems: it.description ? "flex-start" : "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 }}
                      >
                        <View style={{ width: 20, alignItems: "center", marginTop: it.description ? 1 : 0 }}>{it.icon}</View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={{ color: it.danger ? c.danger : c.fg, fontSize: 16, fontWeight: it.danger ? "500" : "400" }}>{it.label}</Text>
                          {it.description && <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{it.description}</Text>}
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: 48, borderRadius: 24, backgroundColor: c.surfaceHigh, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.fg, fontSize: 15, fontWeight: "500" }}>Abbrechen</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
