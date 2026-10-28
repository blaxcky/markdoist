import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { T, type Outcome, type Repository } from "@markdoist/app";
import {
  allOpenView,
  doneView,
  describeOccurrence,
  inboxView,
  matchesFilter,
  problemsView,
  search,
  SORT_LABELS,
  sortViews,
  todayView,
  type Filter,
  type SortChoice,
  type TaskView,
} from "@markdoist/core";
import { bridge, type Settings } from "./bridge";
import { clock, createRepository, startClockWatch, useRepoState } from "./repo";
import { TaskRow } from "./components/TaskRow";
import { useCompletionFlow } from "./completion";
import { Detail } from "./components/Detail";
import { Capture } from "./components/Capture";
import { Problems } from "./components/Problems";
import { Trash } from "./components/Trash";
import { History } from "./components/History";
import { ListRow, Lists } from "./components/Lists";
import { DateListEditor, WasteDates, WasteHead, WasteImportDialog, WasteOverview } from "./components/Waste";
import { Menu, MenuItem } from "./components/Menu";
import { useDialog } from "./dialog";
import {
  IconBell,
  IconChevronDown,
  IconClose,
  IconDisplay,
  IconDone,
  IconFolder,
  IconHelp,
  IconInbox,
  IconBin,
  IconList,
  IconPlus,
  IconPlusCircle,
  IconRefresh,
  IconSearch,
  IconSidebar,
  IconTasks,
  IconToday,
  IconTodayOutline,
  IconTrash,
  IconUndo,
  IconUpcoming,
  IconWarning,
} from "./components/Icons";

type ViewName = "inbox" | "today" | "all" | "done" | "lists" | "waste" | "problems" | "trash" | "history";
type FocusField = "due" | "scheduled" | "priority" | "title" | "note";

interface Toast {
  text: string;
  error?: boolean;
  id: number;
  /** blendet gerade aus */
  out?: boolean;
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [repo, setRepo] = useState<Repository | null>(null);

  useEffect(() => {
    void bridge().settings.get().then(setSettings);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const dark =
      settings.theme === "dark" ||
      (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => {
      if (settings.theme === "system") document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [settings]);

  useEffect(() => {
    if (!settings?.folder) return;
    const r = createRepository(settings.folder);
    setRepo(r);
    void r.open();
    const offWatch = bridge().onStorageChanged((overflow) => void r.scan({ full: overflow }));
    // Zurückholen des Fensters: nach längerer Pause vollständig abgleichen, sonst schnell (7.1). Der erste Fokus
    // beim Öffnen des Fensters zählt nicht; dafür läuft der Startabgleich.
    let leftAt: number | null = null;
    const onBlur = () => (leftAt ??= Date.now());
    window.addEventListener("blur", onBlur);
    const offFocus = bridge().onFocus(() => {
      if (leftAt === null) return;
      const away = Date.now() - leftAt;
      leftAt = null;
      void r.resume(away);
    });
    const offClock = startClockWatch(r);
    return () => {
      offWatch();
      offFocus();
      window.removeEventListener("blur", onBlur);
      offClock();
      r.close();
    };
  }, [settings?.folder]);

  if (!settings) return null;
  if (!settings.folder || !repo) {
    return (
      <div className="app">
        <div className="welcome" data-testid="welcome">
          <h1>{T.appName}</h1>
          <p>{T.empty.noFolder}</p>
          <button className="btn primary" onClick={() => void bridge().folder.choose().then(setSettings)} data-testid="choose-folder">
            {T.actions.chooseFolder}
          </button>
        </div>
      </div>
    );
  }
  return <Main key={settings.folder} repo={repo} settings={settings} setSettings={setSettings} />;
}

function Main({ repo, settings, setSettings }: { repo: Repository; settings: Settings; setSettings(s: Settings): void }) {
  const state = useRepoState(repo);
  const idx = state.index;
  const tz = clock().timeZone;
  const [view, setView] = useState<ViewName>("today");
  const [query, setQuery] = useState("");
  const [includeDone, setIncludeDone] = useState(false);
  const [filter, setFilter] = useState<Filter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [inboxNewest, setInboxNewest] = useState(true);
  const [sort, setSort] = useState<SortChoice>("default");
  const [selected, setSelected] = useState<string | null>(null);
  /** geöffnete Liste in der Ansicht „Listen“ (4.6) */
  const [openList, setOpenList] = useState<string | null>(null);
  /** geöffnete Abfuhrart in der Ansicht „Müllabfuhr“ (4.7) */
  const [openWaste, setOpenWaste] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [editLead, setEditLead] = useState(false);
  /** Detaildialog zur ausgewählten Aufgabe offen */
  const [open, setOpen] = useState(false);
  const [capture, setCapture] = useState(false);
  const [captureAgain, setCaptureAgain] = useState<{ title: string; note: string } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [focusField, setFocusField] = useState<{ field: FocusField; nonce: number } | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [userMenu, setUserMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  useEffect(() => {
    void bridge().info().then((i) => setVersion(i.version));
  }, []);

  const notify = useCallback((o: Outcome, label?: string) => {
    // Was im Verlauf landet, braucht keine Bestätigung; ein Hinweis der Aktion erscheint trotzdem (4.4).
    if (o.status === "ok") {
      if (o.message || o.undoable !== true) setToast({ text: o.message ?? label ?? "Gespeichert", id: Date.now() });
    }
    else if (o.status === "blocked" || o.status === "error" || o.status === "conflict")
      setToast({ text: o.message, error: true, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    // Erst ausblenden (.toast.out), dann entfernen.
    const t = toast.out ? setTimeout(() => setToast(null), 150) : setTimeout(() => setToast({ ...toast, out: true }), toast.error ? 7000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = (list: TaskView[]) => sortViews(list.filter((v) => matchesFilter(v, filter, idx.today)), sort, tz);

  type Section = { title: string | null; items: TaskView[]; scheduledHint?: boolean };
  const sections: Section[] = useMemo(() => {
    if (query.trim()) return [{ title: `${T.views.search}: „${query}“`, items: filtered(search(idx, query, { includeDone })) }];
    switch (view) {
      case "inbox":
        return [{ title: null, items: filtered(inboxView(idx, tz, inboxNewest)) }];
      case "today": {
        const t = todayView(idx, tz);
        return [
          { title: T.today.due, items: filtered(t.due), scheduledHint: true },
          { title: T.today.plannedToday, items: filtered(t.plannedToday) },
          { title: T.today.plannedEarlier, items: filtered(t.plannedEarlier) },
        ];
      }
      case "all":
        return [{ title: null, items: filtered(allOpenView(idx, tz)) }];
      case "done":
        return [{ title: null, items: filtered(doneView(idx).tasks) }];
      case "waste": {
        // Geöffnete Abfuhrart: das aktuelle Vorkommen als normale Aufgabenzeile (4.7).
        const v = openWaste ? idx.tasks.find((t) => t.task.ref === openWaste) : undefined;
        return [{ title: null, items: v && v.task.fields.status !== "done" ? [v] : [] }];
      }
      default:
        return [];
    }
     
  }, [idx, view, query, includeDone, filter, inboxNewest, tz, sort, openWaste]);

  const flat = sections.flatMap((s) => s.items);
  // Abhaken: Haken sofort, Liste bleibt stehen, bis die Zeile ausgeblendet und eingeklappt ist.
  const completion = useCompletionFlow({ repo, notify, live: sections, refs: flat.map((v) => v.task.ref), key: `${view}|${query}` });
  const shown = completion.shown;
  const selectedView = idx.tasks.find((v) => v.task.ref === selected) ?? null;
  // Extern umbenannt: Auswahl über die ID nachführen (7.1).
  useEffect(() => {
    if (!selected || selectedView) return;
    const moved = repo.resolveRef(selected);
    if (moved && moved !== selected) setSelected(moved);
  }, [selected, selectedView, repo]);
  const occurrences = view === "done" && !query ? doneView(idx).occurrences : [];
  const problems = useMemo(
    () => problemsView(idx).length + state.recovery.length + repo.pendingDrafts(5000).length,
    [idx, state.recovery, state.drafts, state.files, repo],
  );
  const counts = useMemo(() => {
    const t = todayView(idx, tz);
    return { inbox: inboxView(idx, tz).length, today: t.due.length + t.plannedToday.length + t.plannedEarlier.length };
  }, [idx, tz]);

  const selectIndex = (i: number) => {
    const v = flat[Math.max(0, Math.min(flat.length - 1, i))];
    if (v) {
      setFocusField(null);
      setSelected(v.task.ref);
    }
  };
  /** Aufgabe auswählen und im Detaildialog öffnen, optional mit Fokus auf ein Feld; eine Liste öffnet die Listenansicht */
  const openTask = (ref: string, field?: FocusField) => {
    if (idx.tasks.find((v) => v.task.ref === ref)?.task.fields.isList) {
      setQuery("");
      setOpen(false);
      setView("lists");
      setOpenList(ref);
      return;
    }
    setSelected(ref);
    setFocusField(field ? { field, nonce: Date.now() } : null);
    setOpen(true);
  };
  const selIndex = selectedView ? flat.findIndex((v) => v.task.ref === selectedView.task.ref) : -1;

  // Aktion und Ziel beim Bedienereignis festhalten: bei Serien das angezeigte Vorkommen (R6).
  const toggleDone = completion.start;

  const doUndo = useCallback(() => {
    void repo.undo().then((o) => {
      if (o.status === "ok") setToast({ text: o.message ?? "Rückgängig", id: Date.now() });
      else if (o.status !== "noop") notify(o);
    });
  }, [repo, notify]);

  // Tastaturbedienung (4.5). In Eingabefeldern sind Buchstaben-, Leertasten- und Entf-Aktionen aus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const inField = el.closest("input, textarea, select, .cm-editor, [contenteditable]") !== null;
      const ctrl = e.ctrlKey || e.metaKey;
      // Offene Menüs bedienen sich selbst; Aufgabenkürzel dürfen dort nicht die ausgewählte Aufgabe treffen (R9).
      if (el.closest('[role="menu"]')) return;
      // Leertaste und Enter auf einer fokussierten Schaltfläche lösen diese aus, nicht die Auswahl.
      if ((e.key === " " || e.key === "Enter") && el.closest("button, a, summary")) return;
      // Offene Dialoge haben eigene Tastaturbedienung; im Detaildialog gelten die Aufgabenkürzel weiter.
      if (capture || help || document.querySelector('[aria-modal="true"]:not([data-detail])')) return;
      const detailOpen = open && !!selectedView;
      if (ctrl && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setCapture(true);
        return;
      }
      if (ctrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (ctrl && ["1", "2", "3", "4", "5", "6"].includes(e.key)) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
        const next = (["inbox", "today", "all", "done", "lists", "waste"] as ViewName[])[Number(e.key) - 1]!;
        if (next === "lists") setOpenList(null);
        if (next === "waste") setOpenWaste(null);
        setView(next);
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        void repo.scan({ full: true });
        return;
      }
      // Aufgaben-Undo: Ctrl+Z außerhalb von Eingabefeldern, Ctrl+Alt+Z überall.
      if (ctrl && e.key.toLowerCase() === "z" && (!inField || e.altKey)) {
        e.preventDefault();
        doUndo();
        return;
      }
      if (inField) {
        if (e.key === "Escape") (el as HTMLElement).blur();
        return;
      }
      // In der Listenansicht wirken keine Aufgabenkürzel; Escape führt zur Übersicht zurück.
      if (view === "lists" && !query && !detailOpen) {
        if (e.key === "Escape" && openList) setOpenList(null);
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          setCapture(true);
        }
        return;
      }
      // Müllabfuhr: In der Übersicht nur Erfassen; in einer Abfuhrart führt Escape zur Übersicht zurück.
      if (view === "waste" && !query && !detailOpen) {
        if (!openWaste) {
          if (e.key === "n" || e.key === "N") {
            e.preventDefault();
            setCapture(true);
          }
          return;
        }
        if (e.key === "Escape") {
          setOpenWaste(null);
          return;
        }
      }
      // Listen in Suchergebnissen: Enter öffnet, Aufgabenaktionen gelten nicht.
      if (selectedView?.task.fields.isList && !["ArrowDown", "ArrowUp", "j", "k", "Enter", "/", "n", "N"].includes(e.key)) return;
      const cur = selectedView;
      const i = selIndex;
      switch (e.key) {
        case "Escape":
          if (detailOpen) {
            e.preventDefault();
            setOpen(false);
          }
          break;
        case "n":
        case "N":
          e.preventDefault();
          setCapture(true);
          break;
        case "/":
          e.preventDefault();
          setOpen(false);
          searchRef.current?.focus();
          break;
        case "ArrowDown":
        case "j":
          e.preventDefault();
          selectIndex(i + 1);
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          selectIndex(i < 0 ? 0 : i - 1);
          break;
        case "Enter":
          if (cur) openTask(cur.task.ref, detailOpen ? "title" : undefined);
          break;
        case " ":
          if (cur && !cur.readOnly) {
            e.preventDefault();
            toggleDone(cur);
          }
          break;
        case "e":
        case "E":
          if (cur && !cur.readOnly) void repo.perform(cur.task.ref, { type: "setInbox", inbox: false }, "Einsortiert").then((o) => notify(o, "Einsortiert"));
          break;
        case "d":
        case "D":
          if (cur) {
            e.preventDefault();
            openTask(cur.task.ref, "due");
          }
          break;
        case "s":
        case "S":
          if (cur) {
            e.preventDefault();
            openTask(cur.task.ref, "scheduled");
          }
          break;
        case "p":
        case "P":
          if (cur) {
            e.preventDefault();
            openTask(cur.task.ref, "priority");
          }
          break;
        case "Delete":
          if (cur && !cur.readOnly) void repo.moveToTrash(cur.task.ref).then((o) => notify(o, "Gelöscht"));
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const viewTitle = query.trim() ? `${T.views.search}: „${query.trim()}“` : T.views[view];
  const activeDisplay = Object.keys(filter).length + (sort !== "default" ? 1 : 0);
  const listsPage = view === "lists" && !query;
  const wastePage = view === "waste" && !query;
  const wasteTask = wastePage && openWaste ? (idx.tasks.find((v) => v.task.ref === openWaste) ?? null) : null;
  const listView = !((view === "problems" || view === "trash" || view === "history" || view === "lists" || view === "waste") && !query);

  const nav = (name: ViewName, label: string, icon: React.ReactNode, count?: number, testid?: string) => (
    <button
      className={`nav${view === name && !query ? " active" : ""}${name === "problems" ? " problems" : ""}`}
      onClick={() => {
        setQuery("");
        setOpen(false);
        if (name === "lists") setOpenList(null);
        if (name === "waste") setOpenWaste(null);
        setView(name);
      }}
      data-testid={testid ?? `nav-${name}`}
      aria-current={view === name && !query ? "page" : undefined}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  );

  const setF = <K extends keyof Filter>(k: K, v: Filter[K] | "") =>
    setFilter((f) => {
      const n = { ...f };
      if (v === "" || v === "any") delete n[k];
      else n[k] = v as Filter[K];
      return n;
    });

  const folderName = repo.folder.split("/").filter(Boolean).pop() ?? repo.folder;
  const day = idx.today.day;

  return (
    <div className={`app${sidebar ? "" : " no-sidebar"}`}>
      {sidebar && (
        <nav className="sidebar" aria-label="Ansichten">
          <div className="side-head">
            <span className="menu-anchor">
              <button className="user" onClick={() => setUserMenu((x) => !x)} data-menu-anchor aria-haspopup="menu" aria-expanded={userMenu} data-testid="user-menu">
                <span className="avatar" aria-hidden="true">
                  {folderName.slice(0, 1).toUpperCase()}
                </span>
                <span className="user-name">{T.appName}</span>
                <IconChevronDown size={16} />
              </button>
              {userMenu && (
                <Menu label="Einstellungen" align="left" className="user-menu" onClose={() => setUserMenu(false)}>
                  <div className="menu-info" title={repo.folder}>
                    <IconFolder size={20} />
                    <div>
                      <div className="menu-info-title">{folderName}</div>
                      <div className="menu-info-sub">{repo.folder}</div>
                    </div>
                  </div>
                  <div className="menu-sep" />
                  <MenuItem icon={<IconFolder size={20} />} onClick={() => (setUserMenu(false), void bridge().folder.choose().then(setSettings))}>
                    Ordner wechseln
                  </MenuItem>
                  <MenuItem icon={<IconRefresh size={20} />} hint="F5" onClick={() => (setUserMenu(false), void repo.scan({ full: true }))}>
                    {T.actions.rescan}
                  </MenuItem>
                  <label className="menu-row">
                    <span className="menu-icon">
                      <IconDisplay size={20} />
                    </span>
                    <span className="menu-label">Darstellung</span>
                    <select
                      value={settings.theme}
                      onChange={(e) => void bridge().settings.setTheme(e.target.value as Settings["theme"]).then(setSettings)}
                      aria-label="Darstellung"
                      data-testid="theme"
                    >
                      <option value="system">System</option>
                      <option value="light">Hell</option>
                      <option value="dark">Dunkel</option>
                    </select>
                  </label>
                  <div className="menu-sep" />
                  <div className="menu-foot">
                    {state.lastScan && (
                      <div data-testid="last-scan">
                        Abgleich: {state.lastScan.files} Dateien, {state.lastScan.ms} ms
                      </div>
                    )}
                    {version && <div>Version {version}</div>}
                  </div>
                </Menu>
              )}
            </span>
            <button className="icon-btn" title={T.views.problems} aria-label={T.views.problems} onClick={() => (setQuery(""), setOpen(false), setView("problems"))} data-testid="bell">
              <IconBell size={24} />
              {problems > 0 && <span className="dot" />}
            </button>
            <button className="icon-btn" title="Seitenleiste ausblenden" aria-label="Seitenleiste ausblenden" onClick={() => setSidebar(false)}>
              <IconSidebar size={24} />
            </button>
          </div>
          <button className="add-task" onClick={() => setCapture(true)} data-testid="capture-button">
            <IconPlusCircle size={24} />
            <span>Aufgabe hinzufügen</span>
          </button>
          <label className={`nav search${query ? " active" : ""}`}>
            <span className="nav-icon">
              <IconSearch size={24} />
            </span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Suchen"
              value={query}
              onChange={(e) => {
                setOpen(false);
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              data-testid="search"
              aria-label="Suchen"
            />
          </label>
          {nav("inbox", T.views.inbox, <IconInbox size={24} />, counts.inbox)}
          {nav("today", T.views.today, view === "today" && !query ? <IconToday size={24} day={day} /> : <IconTodayOutline size={24} day={day} />, counts.today)}
          {nav("all", T.views.all, <IconUpcoming size={24} />)}
          {nav("done", T.views.done, <IconDone size={24} />)}
          {nav("lists", T.views.lists, <IconList size={24} />)}
          {nav("waste", T.views.waste, <IconBin size={24} />)}
          <div className="side-section" title={repo.folder}>
            {folderName}
          </div>
          {problems > 0 && nav("problems", T.views.problems, <IconWarning size={24} />, problems)}
          {nav("history", T.views.history, <IconUndo size={24} />)}
          {nav("trash", T.views.trash, <IconTrash size={24} />, state.trash.length)}
          <div className="spacer" />
          <button className="help" onClick={() => setHelp(true)} data-testid="help">
            <IconHelp size={24} />
            <span>Hilfe &amp; Tastenkürzel</span>
          </button>
        </nav>
      )}
      <main className="content">
        <header className="topbar">
          {!sidebar && (
            <button className="icon-btn" title="Seitenleiste einblenden" aria-label="Seitenleiste einblenden" onClick={() => setSidebar(true)}>
              <IconSidebar size={24} />
            </button>
          )}
          <div className="topbar-spacer" />
          <button className="icon-btn" onClick={doUndo} disabled={!state.undo.length} title="Rückgängig (Ctrl+Z)" aria-label="Rückgängig" data-testid="undo">
            <IconUndo size={24} />
          </button>
          <button className="icon-btn" onClick={() => void repo.scan({ full: true })} title="Neu einlesen (F5)" aria-label="Neu einlesen" data-testid="rescan">
            <IconRefresh size={24} />
          </button>
          {listView && (
            <span className="menu-anchor">
              <button
                className={`display-btn${showFilters || activeDisplay ? " active" : ""}`}
                onClick={() => setShowFilters((x) => !x)}
                data-menu-anchor
                aria-expanded={showFilters}
                data-testid="filter-toggle"
              >
                <IconDisplay size={24} />
                <span>Anzeige{activeDisplay ? `: ${activeDisplay}` : ""}</span>
              </button>
              {showFilters && (
                <Menu label="Anzeige" className="display-menu" onClose={() => setShowFilters(false)} testId="filters">
                  <div className="display-title">Sortierung</div>
                  <label className="display-row">
                    <span>Sortieren nach</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value as SortChoice)} aria-label="Sortierung" data-testid="sort">
                      {(Object.keys(SORT_LABELS) as SortChoice[]).map((k) => (
                        <option key={k} value={k}>
                          {k === "default" ? "Standard" : SORT_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {view === "inbox" && !query && (
                    <label className="display-row">
                      <span>Eingang</span>
                      <select value={inboxNewest ? "new" : "old"} onChange={(e) => setInboxNewest(e.target.value === "new")} aria-label="Reihenfolge im Eingang">
                        <option value="new">Neueste zuerst</option>
                        <option value="old">Älteste zuerst</option>
                      </select>
                    </label>
                  )}
                  {query && (
                    <label className="display-row">
                      <span>Erledigte einbeziehen</span>
                      <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
                    </label>
                  )}
                  <div className="display-title">Filter</div>
                  <MultiCheck
                    label="Status"
                    testId="filter-status"
                    value={filter.status ?? []}
                    options={[["open", "offen"], ["in-progress", "in Arbeit"], ["done", "erledigt"]]}
                    onChange={(v) => setF("status", v.length ? v : "")}
                  />
                  <MultiCheck
                    label="Priorität"
                    testId="filter-priority"
                    value={filter.priority ?? []}
                    options={[["high", "hoch"], ["normal", "normal"], ["low", "niedrig"], ["none", "keine"]]}
                    onChange={(v) => setF("priority", v.length ? v : "")}
                  />
                  <label className="display-row">
                    <span>Eingang</span>
                    <select value={filter.inbox ?? "any"} onChange={(e) => setF("inbox", e.target.value as Filter["inbox"])} data-testid="filter-inbox">
                      <option value="any">egal</option>
                      <option value="yes">ja</option>
                      <option value="no">nein</option>
                    </select>
                  </label>
                  <label className="display-row">
                    <span>Frist</span>
                    <select
                      value={typeof filter.due === "object" ? "range" : (filter.due ?? "any")}
                      onChange={(e) => setF("due", (e.target.value === "range" ? { from: idx.today.toString(), to: idx.today.add({ days: 30 }).toString() } : e.target.value) as never)}
                      data-testid="filter-due"
                    >
                      <option value="any">egal</option>
                      <option value="none">keine</option>
                      <option value="overdue">überfällig</option>
                      <option value="today">heute</option>
                      <option value="next7">nächste 7 Tage</option>
                      <option value="range">Zeitraum …</option>
                    </select>
                  </label>
                  {typeof filter.due === "object" && <RangeInputs value={filter.due} onChange={(r) => setF("due", r as never)} />}
                  <label className="display-row">
                    <span>Geplant</span>
                    <select
                      value={typeof filter.scheduled === "object" ? "range" : (filter.scheduled ?? "any")}
                      onChange={(e) => setF("scheduled", (e.target.value === "range" ? { from: idx.today.toString(), to: idx.today.add({ days: 30 }).toString() } : e.target.value) as never)}
                    >
                      <option value="any">egal</option>
                      <option value="none">keine</option>
                      <option value="earlier">früher eingeplant</option>
                      <option value="today">heute</option>
                      <option value="next7">nächste 7 Tage</option>
                      <option value="range">Zeitraum …</option>
                    </select>
                  </label>
                  {typeof filter.scheduled === "object" && <RangeInputs value={filter.scheduled} onChange={(r) => setF("scheduled", r as never)} />}
                  <label className="display-row">
                    <span>Wiederholung</span>
                    <select value={filter.recurrence ?? "any"} onChange={(e) => setF("recurrence", e.target.value as never)}>
                      <option value="any">egal</option>
                      <option value="none">keine</option>
                      <option value="calendar">Kalender</option>
                      <option value="completion">ab Erledigung</option>
                      <option value="invalid">fehlerhaft</option>
                    </select>
                  </label>
                  {activeDisplay > 0 && (
                    <button
                      className="display-reset"
                      onClick={() => {
                        setFilter({});
                        setSort("default");
                      }}
                    >
                      Zurücksetzen
                    </button>
                  )}
                </Menu>
              )}
            </span>
          )}
        </header>
        <div className="scroll">
          <div className="page">
            {!listsPage && !wastePage && <h1 className="page-title">{viewTitle}</h1>}
            {listView && (
              <div className="page-count">
                <IconTasks size={16} />
                {flat.length === 1 ? "1 Aufgabe" : `${flat.length} Aufgaben`}
              </div>
            )}
            {state.unverified && !state.loading && !state.scanProgress && <div className="banner">{T.unverified}</div>}
            {state.scanProgress && state.scanProgress.total > 0 && (
              <div className="banner" data-testid="scan-progress">
                Prüfe Dateien {state.scanProgress.done}/{state.scanProgress.total}{" "}
                <button className="link-btn" onClick={() => repo.cancelScan()}>
                  Abbrechen
                </button>
              </div>
            )}
            {state.readError && (
              <div className="banner error" data-testid="read-error">
                {state.readError}
                {state.stale && " – letzter bekannter Stand, schreibgeschützt bis zum nächsten erfolgreichen Abgleich"}
              </div>
            )}
            {listsPage ? (
              <Lists
                repo={repo}
                idx={idx}
                openRef={openList}
                onOpen={setOpenList}
                onOutcome={notify}
                onEditMarkdown={(ref) => {
                  setSelected(ref);
                  setFocusField(null);
                  setOpen(true);
                }}
              />
            ) : wastePage && !wasteTask ? (
              <WasteOverview idx={idx} onOpen={setOpenWaste} onImport={() => setImporting(true)} />
            ) : view === "problems" && !query ? (
              <Problems repo={repo} state={state} onSelect={(r) => openTask(r)} onOutcome={notify} />
            ) : view === "trash" && !query ? (
              <Trash repo={repo} state={state} onOutcome={notify} />
            ) : view === "history" && !query ? (
              <History repo={repo} state={state} onOutcome={notify} />
            ) : (
              <>
              {wasteTask && <WasteHead view={wasteTask} onBack={() => setOpenWaste(null)} onEditLead={() => setEditLead(true)} />}
              <div className="list" role="listbox" aria-label="Aufgaben" data-testid="list">
                {shown.map((s, i) =>
                  s.items.length ? (
                    <div key={i} className="group" data-testid={`section-${i}`}>
                      {s.title && (
                        <div className="section">
                          <span>{s.title}</span>
                          <span className="section-count">{s.items.length}</span>
                        </div>
                      )}
                      {s.items.map((v) =>
                        v.task.fields.isList ? (
                          <ListRow key={v.task.ref} view={v} selected={v.task.ref === selected} onOpen={() => openTask(v.task.ref)} />
                        ) : (
                        <TaskRow
                          key={v.task.ref}
                          view={v}
                          selected={v.task.ref === selected}
                          today={idx.today}
                          tz={tz}
                          showScheduledHint={s.scheduledHint && !!v.scheduled}
                          phase={completion.phase(v.task.ref)}
                          onLeft={() => completion.left(v.task.ref)}
                          onSelect={() => openTask(v.task.ref)}
                          onToggle={() => toggleDone(v)}
                          onEdit={(field) => openTask(v.task.ref, field)}
                          onFile={() =>
                            void repo
                              .perform(v.task.ref, { type: "setInbox", inbox: !v.task.fields.inbox }, v.task.fields.inbox ? "Einsortiert" : "Zurück in den Eingang")
                              .then((o) => notify(o, v.task.fields.inbox ? "Einsortiert" : "Zurück in den Eingang"))
                          }
                          onDelete={() => void repo.moveToTrash(v.task.ref).then((o) => notify(o, "Gelöscht"))}
                        />
                        ),
                      )}
                    </div>
                  ) : null,
                )}
                {!state.loading && !wasteTask && shown.every((s) => s.items.length === 0) && (
                  <div className="empty">{query ? "Keine Treffer." : T.empty[view as "inbox" | "today" | "all" | "done"]}</div>
                )}
                {!query && view !== "done" && view !== "waste" && (
                  <button className="add-inline" onClick={() => setCapture(true)}>
                    <span className="plus">
                      <IconPlus size={18} />
                    </span>
                    Aufgabe hinzufügen
                  </button>
                )}
                {occurrences.length > 0 && (
                  <div className="group">
                    <div className="section">
                      <span>Erledigte Vorkommen (letzte 30 Tage)</span>
                    </div>
                    {occurrences.map((o, i) => (
                      <div key={i} className="row done" onClick={() => openTask(o.view.task.ref)}>
                        <span className="check checked prio-none" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M7.5 12.3l3 3 6-6.3" />
                          </svg>
                        </span>
                        <div className="main">
                          <div className="title">{o.view.task.fields.title}</div>
                          <div className="sub">
                            <div className="meta">
                              Vorkommen {describeOccurrence(o.date)} – erledigt{o.archived ? " (früherer Abschnitt)" : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {wasteTask && <WasteDates view={wasteTask} today={idx.today} repo={repo} onOutcome={notify} />}
              </>
            )}
          </div>
        </div>
      </main>
      {open && selectedView && (
        <Detail
          key={selectedView.task.ref}
          repo={repo}
          view={selectedView}
          today={idx.today}
          draftText={state.drafts.find((d) => d.ref === selectedView.task.ref)?.text ?? null}
          draftConflict={!!state.drafts.find((d) => d.ref === selectedView.task.ref)?.conflictHash}
          focusField={focusField}
          onOutcome={notify}
          onClose={() => setOpen(false)}
          onToggle={() => toggleDone(selectedView)}
          onPrev={selIndex > 0 ? () => selectIndex(selIndex - 1) : undefined}
          onNext={selIndex >= 0 && selIndex < flat.length - 1 ? () => selectIndex(selIndex + 1) : undefined}
        />
      )}
      {capture && (
        <Capture
          initial={captureAgain}
          onCancel={() => (setCapture(false), setCaptureAgain(null))}
          onCapture={(title, note, edit) => {
            setCapture(false);
            setCaptureAgain(null);
            // Die Aufgabe steht sofort in der Liste; geschrieben wird im Hintergrund (4.4).
            void repo.create({ title, note }, (ref) => edit && openTask(ref)).then((o) => {
              notify(o, "Erfasst im Eingang");
              if (o.status !== "ok" && o.status !== "noop") {
                setCaptureAgain({ title, note });
                setCapture(true);
              }
            });
          }}
        />
      )}
      {importing && (
        <WasteImportDialog
          repo={repo}
          idx={idx}
          onClose={() => setImporting(false)}
          onDone={(text, error) => {
            setImporting(false);
            setToast({ text, error, id: Date.now() });
          }}
        />
      )}
      {editLead && wasteTask?.series && (
        <DateListEditor
          series={wasteTask.series}
          onCancel={() => setEditLead(false)}
          onSave={(action) => {
            setEditLead(false);
            void repo.perform(wasteTask.task.ref, action, "Vorlauf geändert").then((o) => notify(o, "Vorlauf geändert"));
          }}
        />
      )}
      {help && <Help onClose={() => setHelp(false)} />}
      {toast && (
        <div key={toast.id} className={`toast${toast.error ? " error" : ""}${toast.out ? " out" : ""}`} role="status" data-testid="toast">
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["N / Ctrl+N", "Aufgabe erfassen"],
  ["/ oder Ctrl+F", "Suchen"],
  ["↑ ↓ oder J K", "Aufgabe wählen"],
  ["Enter", "Details öffnen"],
  ["Escape", "Details schließen"],
  ["Leertaste", "Erledigen / wiederöffnen"],
  ["E", "Einsortieren"],
  ["D", "Frist setzen"],
  ["S", "Einplanen"],
  ["P", "Priorität setzen"],
  ["Entf", "Löschen"],
  ["Ctrl+Z", "Rückgängig"],
  ["Ctrl+1 … 6", "Eingang, Heute, Alle offenen, Erledigt, Listen, Müllabfuhr"],
  ["F5", "Neu einlesen"],
];

function Help({ onClose }: { onClose(): void }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="modal-back" onClick={onClose}>
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label="Tastenkürzel" onClick={(e) => e.stopPropagation()} data-testid="help-dialog">
        <div className="modal-head">
          <h2>Tastenkürzel</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconClose size={24} />
          </button>
        </div>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([k, d]) => (
              <tr key={k}>
                <td>{d}</td>
                <td>
                  <kbd>{k}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RangeInputs({ value, onChange }: { value: { from: string; to: string }; onChange(r: { from: string; to: string }): void }) {
  return (
    <div className="display-range">
      <input type="date" value={value.from} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} aria-label="von" />
      <input type="date" value={value.to} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} aria-label="bis" />
    </div>
  );
}

/** Mehrfachauswahl eines Filtermerkmals: ODER innerhalb, UND zu den anderen Merkmalen (4.3). */
function MultiCheck<V extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: V[];
  options: [V, string][];
  onChange(v: V[]): void;
  testId: string;
}) {
  return (
    <fieldset className="multicheck" data-testid={testId}>
      <legend>{label}</legend>
      {options.map(([v, l]) => (
        <label key={v}>
          <input
            type="checkbox"
            checked={value.includes(v)}
            onChange={(e) => onChange(e.target.checked ? [...value, v] : value.filter((x) => x !== v))}
            data-testid={`${testId}-${v}`}
          />{" "}
          {l}
        </label>
      ))}
    </fieldset>
  );
}
