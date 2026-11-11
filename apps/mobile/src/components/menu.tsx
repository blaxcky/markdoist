// Auswahlmenüs: Aufklappmenü oben rechts (Kopfzeile) oder Blatt von unten (Detail, Aktionen).
import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";

export interface MenuItem {
  label: string;
  onPress(): void;
  testID?: string;
  danger?: boolean;
  checked?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
  /** Grauer Zusatz rechts, z. B. das Datum einer Schnellwahl. */
  hint?: string;
}

/** Gruppenüberschrift oder Trennlinie zwischen Einträgen. */
export type MenuEntry = MenuItem | { heading: string } | "divider";

interface Props {
  open: boolean;
  onClose(): void;
  items: (MenuEntry | null | false | undefined)[];
  title?: string;
  placement?: "top" | "bottom";
  top?: number;
}

export function Menu({ open, onClose, items, title, placement = "bottom", top = 0 }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  if (!open) return null;
  const list = items.filter(Boolean) as MenuEntry[];
  const rows = list.map((it, i) =>
    it === "divider" ? (
      <View
        key={`divider-${i}`}
        style={{ height: 1, backgroundColor: c.divider, marginVertical: 6, marginHorizontal: 18 }}
      />
    ) : "heading" in it ? (
      <Text
        key={`heading-${i}`}
        style={{
          color: c.muted,
          fontSize: 13,
          fontWeight: "600",
          paddingHorizontal: 18,
          paddingTop: i === 0 ? 4 : 8,
          paddingBottom: 2,
        }}
      >
        {it.heading}
      </Text>
    ) : (
      <Pressable
        key={it.label}
        testID={it.testID}
        disabled={it.disabled}
        onPress={() => {
          onClose();
          it.onPress();
        }}
        android_ripple={{ color: c.surfaceHigh }}
        accessibilityRole="menuitem"
        accessibilityState={{ checked: it.checked, disabled: it.disabled }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 13,
          paddingHorizontal: 18,
          opacity: it.disabled ? 0.45 : 1,
        }}
      >
        {it.icon && <View style={{ width: 20, alignItems: "center" }}>{it.icon}</View>}
        <Text style={{ flex: 1, color: it.danger ? c.danger : c.fg, fontSize: 16 }}>
          {it.label}
        </Text>
        {it.hint && <Text style={{ color: c.muted, fontSize: 14 }}>{it.hint}</Text>}
        {it.checked && <Text style={{ color: c.primary, fontSize: 16, fontWeight: "700" }}>✓</Text>}
      </Pressable>
    ),
  );
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: placement === "bottom" ? c.backdrop : "transparent",
          justifyContent: placement === "bottom" ? "flex-end" : "flex-start",
        }}
        onPress={onClose}
      >
        {placement === "top" ? (
          <View
            style={{
              position: "absolute",
              right: 8,
              top: insets.top + top,
              minWidth: 220,
              backgroundColor: c.surface,
              borderRadius: 12,
              paddingVertical: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            }}
          >
            {rows}
          </View>
        ) : (
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingBottom: insets.bottom + 12,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: c.outline,
                marginBottom: 6,
              }}
            />
            {title && (
              <Text
                numberOfLines={1}
                style={{ color: c.muted, paddingHorizontal: 18, paddingVertical: 8, fontSize: 14 }}
              >
                {title}
              </Text>
            )}
            <ScrollView>{rows}</ScrollView>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}
