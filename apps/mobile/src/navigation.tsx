// Navigation (Plan 4.5, 4.6): untere Leiste Eingang/Heute/Alle/⋯ Mehr, Stack für Detail und Dialoge.
// „Mehr“ öffnet ein Blatt mit Erledigt und Listen; diese bleiben Reiter des Tab-Navigators, nur ohne eigenen Knopf.
// Kopfzeilen der Listen zeichnet die Liste selbst (components/list-header).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { BackHandler, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator, type BottomTabBarButtonProps, type BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import { createNativeStackNavigator, type NativeStackScreenProps } from "@react-navigation/native-stack";
import { createNavigationContainerRef, useFocusEffect, useNavigation, type LinkingOptions, type NavigatorScreenParams } from "@react-navigation/native";
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
import { GroupedSheet } from "./components/series-sheet";
import { CalendarIcon, CheckCircleIcon, ChecklistIcon, GridIcon, InboxIcon, MoreIcon } from "./components/icons";

export type Tabs = { Inbox: undefined; Today: undefined; All: undefined; More: undefined; Done: undefined; Lists: undefined };
type MainTab = "Inbox" | "Today" | "All";
const MAIN_TABS: readonly string[] = ["Inbox", "Today", "All"];
/** Ansichten hinter „Mehr“ (4.5): eigene Reiter ohne Knopf in der Leiste. */
const MORE_TABS: readonly string[] = ["Done", "Lists"];
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

/** Zurück aus einer Ansicht hinter „Mehr“ führt zur zuletzt gewählten Hauptansicht (4.5).
 *  Nur solange die Ansicht im Fokus ist; ein darüber geöffneter Stack-Bildschirm behält sein eigenes Zurück. */
const LastMainContext = createContext<{ current: MainTab }>({ current: "Today" });

function MoreTarget({ children }: { children: ReactNode }) {
  const nav = useNavigation<BottomTabNavigationProp<Tabs>>();
  const lastMain = useContext(LastMainContext);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        nav.navigate(lastMain.current);
        return true;
      });
      return () => sub.remove();
    }, [nav, lastMain]),
  );
  return children;
}

function MoreScreen() {
  return null;
}

function TabsNav({ navigation }: NativeStackScreenProps<RootStack, "Main">) {
  const c = useTheme();
  const state = useRepoState();
  const day = state.index.today.day;
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<string>("Today");
  const [moreOpen, setMoreOpen] = useState(false);
  const lastMain = useRef<MainTab>("Today");
  const moreActive = MORE_TABS.includes(active);
  const hidden = { tabBarButton: () => null, tabBarItemStyle: { display: "none" } } as const;
  const openTab = (screen: keyof Tabs) => navigation.navigate("Main", { screen });
  return (
    <LastMainContext.Provider value={lastMain}>
      <Tab.Navigator
        initialRouteName="Today"
        screenListeners={({ route }) => ({
          focus: () => {
            setActive(route.name);
            if (MAIN_TABS.includes(route.name)) lastMain.current = route.name as MainTab;
          },
        })}
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
        {/* „Mehr“ wechselt nicht selbst die Ansicht, sondern öffnet das Blatt; aktiv, solange eine Ansicht dahinter offen ist. */}
        <Tab.Screen
          name="More"
          component={MoreScreen}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setMoreOpen(true);
            },
          }}
          options={{
            title: T.views.more,
            tabBarInactiveTintColor: moreActive ? c.primary : c.fg,
            tabBarIcon: ({ color }) => <TabIcon focused={moreActive}><MoreIcon color={color} size={20} /></TabIcon>,
            tabBarButtonTestID: "tab-more",
          }}
        />
        <Tab.Screen name="Done" options={{ title: T.views.done, ...hidden }}>
          {() => <MoreTarget><ListScreen kind="done" /></MoreTarget>}
        </Tab.Screen>
        <Tab.Screen name="Lists" options={{ title: T.views.lists, ...hidden }}>
          {() => <MoreTarget><ListsScreen /></MoreTarget>}
        </Tab.Screen>
      </Tab.Navigator>
      <GroupedSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={T.views.more}
        groups={[
          {
            items: [
              { label: T.views.done, icon: <CheckCircleIcon color={c.muted} size={18} />, testID: "more-done", onPress: () => openTab("Done") },
              { label: T.views.lists, icon: <ChecklistIcon color={c.muted} size={17} />, testID: "more-lists", onPress: () => openTab("Lists") },
            ],
          },
        ]}
      />
    </LastMainContext.Provider>
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
