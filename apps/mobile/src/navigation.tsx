// Navigation (Plan 4.5, 4.6): untere Leiste Eingang/Heute/Alle/Erledigt/Listen, Stack für Detail und Dialoge.
// Kopfzeilen der Listen zeichnet die Liste selbst (components/list-header).
import { createContext, useContext, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator, type BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createNavigationContainerRef, type LinkingOptions, type NavigatorScreenParams } from "@react-navigation/native";
import { T } from "@markdoist/app";
import { ListScreen } from "./screens/list-screen";
import { ListsScreen } from "./screens/lists-screen";
import { ChecklistScreen } from "./screens/checklist-screen";
import { DetailScreen } from "./screens/detail-screen";
import { CaptureScreen } from "./screens/capture-screen";
import { AddItemScreen } from "./screens/add-item-screen";
import { NewListScreen } from "./screens/new-list-screen";
import { SearchScreen } from "./screens/search-screen";
import { ProblemsScreen } from "./screens/problems-screen";
import { TrashScreen } from "./screens/trash-screen";
import { HistoryScreen } from "./screens/history-screen";
import { SettingsScreen } from "./screens/settings-screen";
import { RecurrenceScreen } from "./screens/recurrence-screen";
import { SeriesHistoryScreen } from "./screens/series-history-screen";
import { useRepoState } from "./repo";
import { useTheme } from "./theme";
import { FilterProvider, FilterSheet } from "./filter";
import { CalendarIcon, CheckCircleIcon, ChecklistIcon, GridIcon, InboxIcon } from "./components/icons";

export type Tabs = { Inbox: undefined; Today: undefined; All: undefined; Done: undefined; Lists: undefined };
export type RootStack = {
  Main: NavigatorScreenParams<Tabs> | undefined;
  Detail: { ref: string };
  Checklist: { ref: string };
  /** Startwerte: Erfassung erneut öffnen, wenn das Schreiben im Hintergrund scheiterte (7.6) */
  Capture: { title?: string; note?: string } | undefined;
  AddItem: { ref: string };
  NewList: { title?: string } | undefined;
  Search: undefined;
  Problems: undefined;
  Trash: undefined;
  History: undefined;
  Settings: undefined;
  Recurrence: { ref: string; continueSeries?: boolean };
  SeriesHistory: { ref: string };
};

/** Für Navigation nach dem Schließen eines Blatts, wenn dessen eigenes Navigationsobjekt nicht mehr gilt */
export const navigationRef = createNavigationContainerRef<RootStack>();

const Tab = createBottomTabNavigator<Tabs>();
const Stack = createNativeStackNavigator<RootStack>();

export const linking: LinkingOptions<RootStack> = {
  prefixes: ["markdoist://"],
  config: { screens: { Capture: "capture" } },
};

const TabPressedContext = createContext(false);

/** Tab-Knopf ohne den randlosen Standard-Ripple (wurde von der Leiste unförmig abgeschnitten);
 *  der Druckzustand färbt stattdessen die Pille hinter dem Symbol. */
function TabButton({ children, onPressIn, onPressOut, ...rest }: BottomTabBarButtonProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <PlatformPressable
      {...rest}
      pressColor="transparent"
      onPressIn={(e) => { setPressed(true); onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); onPressOut?.(e); }}
    >
      <TabPressedContext.Provider value={pressed}>{children}</TabPressedContext.Provider>
    </PlatformPressable>
  );
}

/** Symbol der unteren Leiste; aktiv mit hinterlegter Pille wie in der Vorlage. */
function TabIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  const c = useTheme();
  const pressed = useContext(TabPressedContext);
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: focused ? c.primaryContainer : pressed ? c.surfaceHigh : "transparent" }}>
      {children}
    </View>
  );
}

function TabsNav() {
  const c = useTheme();
  const state = useRepoState();
  const day = state.index.today.day;
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
        tabBarStyle: { backgroundColor: c.tabBar, borderTopWidth: 0, elevation: 0, height: 66 + insets.bottom, paddingTop: 8 },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.fg,
        tabBarLabelStyle: { fontSize: 12, marginTop: 2, fontWeight: "400" },
        tabBarIconStyle: { width: 56 },
        tabBarButton: (props) => <TabButton {...props} />,
      }}
    >
      <Tab.Screen
        name="Inbox"
        options={{ title: T.views.inbox, tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><InboxIcon color={color} size={20} filled={focused} /></TabIcon>, tabBarButtonTestID: "tab-inbox" }}
      >
        {() => <ListScreen kind="inbox" />}
      </Tab.Screen>
      <Tab.Screen
        name="Today"
        options={{ title: T.views.today, tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><CalendarIcon color={color} size={20} day={day} filled={focused} /></TabIcon>, tabBarButtonTestID: "tab-today" }}
      >
        {() => <ListScreen kind="today" />}
      </Tab.Screen>
      <Tab.Screen
        name="All"
        options={{ title: "Alle", tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><GridIcon color={color} size={20} /></TabIcon>, tabBarButtonTestID: "tab-all" }}
      >
        {() => <ListScreen kind="all" />}
      </Tab.Screen>
      <Tab.Screen
        name="Done"
        options={{ title: T.views.done, tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><CheckCircleIcon color={color} size={20} /></TabIcon>, tabBarButtonTestID: "tab-done" }}
      >
        {() => <ListScreen kind="done" />}
      </Tab.Screen>
      <Tab.Screen
        name="Lists"
        component={ListsScreen}
        options={{ title: T.views.lists, tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><ChecklistIcon color={color} size={18} /></TabIcon>, tabBarButtonTestID: "tab-lists" }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <FilterProvider>
      <RootStackNavigator />
      <FilterSheetHost />
    </FilterProvider>
  );
}

function FilterSheetHost() {
  const state = useRepoState();
  return <FilterSheet today={state.index.today} />;
}

function RootStackNavigator() {
  const c = useTheme();
  const opts = { headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTintColor: c.fg, contentStyle: { backgroundColor: c.bg } };
  const sheet = { headerShown: false, presentation: "transparentModal", animation: "fade", animationDuration: 180, contentStyle: { backgroundColor: "transparent" } } as const;
  return (
    <Stack.Navigator screenOptions={opts}>
      <Stack.Screen name="Main" component={TabsNav} options={{ headerShown: false }} />
      {/* Detail und Erfassung als Blatt über der Liste (Vorlage) */}
      <Stack.Screen name="Detail" component={DetailScreen} options={sheet} />
      <Stack.Screen name="Capture" component={CaptureScreen} options={sheet} />
      {/* Listen nutzen dasselbe Eingabeblatt */}
      <Stack.Screen name="AddItem" component={AddItemScreen} options={sheet} />
      <Stack.Screen name="NewList" component={NewListScreen} options={sheet} />
      <Stack.Screen name="Checklist" component={ChecklistScreen} options={{ title: T.views.lists }} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: T.views.search }} />
      <Stack.Screen name="Problems" component={ProblemsScreen} options={{ title: T.views.problems }} />
      <Stack.Screen name="Trash" component={TrashScreen} options={{ title: T.views.trash }} />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: T.views.history }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Einstellungen" }} />
      <Stack.Screen name="Recurrence" component={RecurrenceScreen} options={{ title: "Wiederholung" }} />
      <Stack.Screen name="SeriesHistory" component={SeriesHistoryScreen} options={{ title: "Verlauf" }} />
    </Stack.Navigator>
  );
}
