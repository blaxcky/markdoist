// Navigation (Plan 4.5): untere Leiste Eingang/Heute/Alle/Erledigt, Stack für Detail und Dialoge.
import { Pressable, Text, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation, type LinkingOptions, type NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { T } from "@markdoist/app";
import { inboxView, problemsView, todayView } from "@markdoist/core";
import { ListScreen } from "./screens/list-screen";
import { DetailScreen } from "./screens/detail-screen";
import { CaptureScreen } from "./screens/capture-screen";
import { SearchScreen } from "./screens/search-screen";
import { ProblemsScreen } from "./screens/problems-screen";
import { TrashScreen } from "./screens/trash-screen";
import { SettingsScreen } from "./screens/settings-screen";
import { RecurrenceScreen } from "./screens/recurrence-screen";
import { useRepoState, systemClock } from "./repo";
import { useTheme } from "./theme";

export type Tabs = { Inbox: undefined; Today: undefined; All: undefined; Done: undefined };
export type RootStack = {
  Main: NavigatorScreenParams<Tabs> | undefined;
  Detail: { ref: string };
  Capture: undefined;
  Search: undefined;
  Problems: undefined;
  Trash: undefined;
  Settings: undefined;
  Recurrence: { ref: string };
};

const Tab = createBottomTabNavigator<Tabs>();
const Stack = createNativeStackNavigator<RootStack>();

export const linking: LinkingOptions<RootStack> = {
  prefixes: ["markdoist://"],
  config: { screens: { Capture: "capture" } },
};

function HeaderButtons() {
  const nav = useNavigation<NativeStackNavigationProp<RootStack>>();
  const state = useRepoState();
  const c = useTheme();
  const problems = problemsView(state.index).length + state.recovery.length + state.drafts.filter((d) => !state.files.has(d.ref)).length;
  const btn = (label: string, to: keyof RootStack, testID: string, color = c.fg) => (
    <Pressable onPress={() => nav.navigate(to as never)} hitSlop={8} testID={testID} accessibilityLabel={testID} style={{ paddingHorizontal: 10 }}>
      <Text style={{ fontSize: 20, color }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {problems > 0 && btn(`⚠ ${problems}`, "Problems", "nav-problems", c.warn)}
      {btn("⌕", "Search", "nav-search")}
      {btn("⋮", "Settings", "nav-settings")}
    </View>
  );
}

function TabsNav() {
  const c = useTheme();
  const state = useRepoState();
  const tz = systemClock().timeZone;
  const t = todayView(state.index, tz);
  const icon = (s: string) => ({ color }: { color: string }) => <Text style={{ color, fontSize: 18 }}>{s}</Text>;
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={{
        headerRight: () => <HeaderButtons />,
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.fg,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.outline },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
      }}
    >
      <Tab.Screen name="Inbox" options={{ title: T.views.inbox, tabBarIcon: icon("📥"), tabBarBadge: inboxView(state.index, tz).length || undefined, tabBarButtonTestID: "tab-inbox" }}>
        {() => <ListScreen kind="inbox" />}
      </Tab.Screen>
      <Tab.Screen name="Today" options={{ title: T.views.today, tabBarIcon: icon("☀"), tabBarBadge: t.due.length + t.plannedToday.length + t.plannedEarlier.length || undefined, tabBarButtonTestID: "tab-today" }}>
        {() => <ListScreen kind="today" />}
      </Tab.Screen>
      <Tab.Screen name="All" options={{ title: "Alle", tabBarIcon: icon("☰"), tabBarButtonTestID: "tab-all" }}>
        {() => <ListScreen kind="all" />}
      </Tab.Screen>
      <Tab.Screen name="Done" options={{ title: T.views.done, tabBarIcon: icon("✓"), tabBarButtonTestID: "tab-done" }}>
        {() => <ListScreen kind="done" />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const c = useTheme();
  const opts = { headerStyle: { backgroundColor: c.surface }, headerTintColor: c.fg, contentStyle: { backgroundColor: c.bg } };
  return (
    <Stack.Navigator screenOptions={opts}>
      <Stack.Screen name="Main" component={TabsNav} options={{ headerShown: false }} />
      <Stack.Screen name="Detail" component={DetailScreen} options={{ title: "Aufgabe" }} />
      <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: T.actions.capture, presentation: "modal" }} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: T.views.search }} />
      <Stack.Screen name="Problems" component={ProblemsScreen} options={{ title: T.views.problems }} />
      <Stack.Screen name="Trash" component={TrashScreen} options={{ title: T.views.trash }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Einstellungen" }} />
      <Stack.Screen name="Recurrence" component={RecurrenceScreen} options={{ title: "Wiederholung" }} />
    </Stack.Navigator>
  );
}
