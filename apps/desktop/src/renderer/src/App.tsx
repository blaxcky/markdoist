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
  todayView,
  type Filter,
  type TaskView,
} from "@markdoist/core";
import { bridge, type Settings } from "./bridge";
import { clock, createRepository, startClockWatch, useRepoState } from "./repo";
import { TaskRow } from "./components/TaskRow";
import { Detail } from "./components/Detail";
import { Capture } from "./components/Capture";
import { Problems } from "./components/Problems";
import { Trash } from "./components/Trash";

type ViewName = "inbox" | "today" | "all" | "done" | "problems" | "trash";

interface Toast {
  text: string;
  error?: boolean;
  undo?: boolean;
  id: number;
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
    const offFocus = bridge().onFocus(() => {
      r.refreshClock();
      void r.scan({ full: true });
    });
    const offClock = startClockWatch(r);
    return () => {
      offWatch();
      offFocus();
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
  const [selected, setSelected] = useState<string | null>(null);
  const [capture, setCapture] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [focusField, setFocusField] = useState<{ field: "due" | "scheduled" | "priority" | "title"; nonce: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("");
  useEffect(() => {
    void bridge().info().then((i) => setVersion(i.version));
  }, []);

  const notify = useCallback((o: Outcome, label?: string) => {
    if (o.status === "ok") setToast({ text: o.message ?? label ?? "Gespeichert", undo: true, id: Date.now() });
    else if (o.status === "blocked" || o.status === "error" || o.status === "conflict")
      setToast({ text: o.message, error: true, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 7000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = (list: TaskView[]) => list.filter((v) => matchesFilter(v, filter, idx.today));

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
      default:
        return [];
    }
     
  }, [idx, view, query, includeDone, filter, inboxNewest, tz]);

  const flat = sections.flatMap((s) => s.items);
  const selectedView = idx.tasks.find((v) => v.task.ref === selected) ?? null;
  const occurrences = view === "done" && !query ? doneView(idx).occurrences : [];
  const problems = problemsView(idx).length + state.recovery.length;
  const counts = {
    inbox: inboxView(idx, tz).length,
    today: (() => {
      const t = todayView(idx, tz);
      return t.due.length + t.plannedToday.length + t.plannedEarlier.length;
    })(),
  };

  const selectIndex = (i: number) => {
    const v = flat[Math.max(0, Math.min(flat.length - 1, i))];
    if (v) setSelected(v.task.ref);
  };

  const toggleDone = useCallback(
    (v: TaskView) => {
      const done = v.task.fields.status === "done";
      void repo
        .perform(v.task.ref, done ? { type: "reopen" } : { type: "complete" }, done ? "Wiederöffnet" : "Erledigt")
        .then((o) => notify(o, done ? "Wiederöffnet" : "Erledigt"));
    },
    [repo, notify],
  );

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
      // Offene Dialoge haben eigene Tastaturbedienung.
      if (capture || document.querySelector('[aria-modal="true"]')) return;
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
      if (ctrl && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        setQuery("");
        setView((["inbox", "today", "all", "done"] as ViewName[])[Number(e.key) - 1]!);
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
      const cur = selectedView;
      const i = cur ? flat.findIndex((v) => v.task.ref === cur.task.ref) : -1;
      switch (e.key) {
        case "n":
        case "N":
          e.preventDefault();
          setCapture(true);
          break;
        case "/":
          e.preventDefault();
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
          if (cur) setFocusField({ field: "title", nonce: Date.now() });
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
          if (cur) setFocusField({ field: "due", nonce: Date.now() });
          break;
        case "s":
        case "S":
          if (cur) setFocusField({ field: "scheduled", nonce: Date.now() });
          break;
        case "p":
        case "P":
          if (cur) setFocusField({ field: "priority", nonce: Date.now() });
          break;
        case "Delete":
          if (cur && !cur.readOnly) void repo.moveToTrash(cur.task.ref).then((o) => notify(o, "Gelöscht"));
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const nav = (name: ViewName, label: string, count?: number, testid?: string) => (
    <button
      className={`nav${view === name && !query ? " active" : ""}${name === "problems" ? " problems" : ""}`}
      onClick={() => {
        setQuery("");
        setView(name);
      }}
      data-testid={testid ?? `nav-${name}`}
    >
      <span>{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );

  const setF = <K extends keyof Filter>(k: K, v: Filter[K] | "") =>
    setFilter((f) => {
      const n = { ...f };
      if (v === "" || v === "any") delete n[k];
      else n[k] = v as Filter[K];
      return n;
    });

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Ansichten">
        <h1>{T.appName}</h1>
        {nav("inbox", T.views.inbox, counts.inbox)}
        {nav("today", T.views.today, counts.today)}
        {nav("all", T.views.all)}
        {nav("done", T.views.done)}
        {problems > 0 && nav("problems", `⚠ ${T.views.problems}`, problems)}
        {nav("trash", T.views.trash, state.trash.length)}
        <div className="spacer" />
        <button className="btn" onClick={() => setCapture(true)} data-testid="capture-button">
          + {T.actions.capture}
        </button>
        <div className="meta">
          <div title={repo.folder}>📁 {repo.folder.split("/").pop()}</div>
          <button className="btn" style={{ marginTop: 6 }} onClick={() => void bridge().folder.choose().then(setSettings)}>
            Ordner wechseln
          </button>
          {state.lastScan && (
            <div style={{ marginTop: 6 }} data-testid="last-scan">
              Abgleich: {state.lastScan.files} Dateien, {state.lastScan.ms} ms
            </div>
          )}
          {version && <div>Version {version}</div>}
          <div style={{ marginTop: 6 }}>
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
          </div>
        </div>
      </nav>
      <section className="listpane">
        <div className="toolbar">
          <input
            ref={searchRef}
            type="search"
            placeholder="Suchen (/)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                (e.target as HTMLInputElement).blur();
              }
            }}
            data-testid="search"
            aria-label="Suchen"
          />
          {query && (
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} /> inkl. erledigt
            </label>
          )}
          <button className={`btn${Object.keys(filter).length ? " primary" : ""}`} onClick={() => setShowFilters((x) => !x)} data-testid="filter-toggle">
            Filter
          </button>
          {view === "inbox" && !query && (
            <button className="btn" onClick={() => setInboxNewest((x) => !x)} title="Sortierung">
              {inboxNewest ? "Neueste zuerst" : "Älteste zuerst"}
            </button>
          )}
          <button className="btn" onClick={() => void repo.scan({ full: true })} title="Neu einlesen (F5)" data-testid="rescan">
            ⟳
          </button>
          <button className="btn" onClick={doUndo} disabled={!state.undo.length} title="Rückgängig (Ctrl+Z)" data-testid="undo">
            ↶
          </button>
        </div>
        {showFilters && (
          <div className="filters" data-testid="filters">
            <label>
              Status
              <select value={filter.status?.[0] ?? ""} onChange={(e) => setF("status", e.target.value ? [e.target.value as never] : "")}>
                <option value="">egal</option>
                <option value="open">offen</option>
                <option value="in-progress">in Arbeit</option>
                <option value="done">erledigt</option>
              </select>
            </label>
            <label>
              Priorität
              <select value={filter.priority?.[0] ?? ""} onChange={(e) => setF("priority", e.target.value ? [e.target.value as never] : "")} data-testid="filter-priority">
                <option value="">egal</option>
                <option value="high">hoch</option>
                <option value="normal">normal</option>
                <option value="low">niedrig</option>
                <option value="none">keine</option>
              </select>
            </label>
            <label>
              Eingang
              <select value={filter.inbox ?? "any"} onChange={(e) => setF("inbox", e.target.value as Filter["inbox"])} data-testid="filter-inbox">
                <option value="any">egal</option>
                <option value="yes">ja</option>
                <option value="no">nein</option>
              </select>
            </label>
            <label>
              Frist
              <select value={typeof filter.due === "string" ? filter.due : "any"} onChange={(e) => setF("due", e.target.value as never)} data-testid="filter-due">
                <option value="any">egal</option>
                <option value="none">keine</option>
                <option value="overdue">überfällig</option>
                <option value="today">heute</option>
                <option value="next7">nächste 7 Tage</option>
              </select>
            </label>
            <label>
              Geplant
              <select value={typeof filter.scheduled === "string" ? filter.scheduled : "any"} onChange={(e) => setF("scheduled", e.target.value as never)}>
                <option value="any">egal</option>
                <option value="none">keine</option>
                <option value="earlier">früher eingeplant</option>
                <option value="today">heute</option>
                <option value="next7">nächste 7 Tage</option>
              </select>
            </label>
            <label>
              Wiederholung
              <select value={filter.recurrence ?? "any"} onChange={(e) => setF("recurrence", e.target.value as never)}>
                <option value="any">egal</option>
                <option value="none">keine</option>
                <option value="calendar">Kalender</option>
                <option value="completion">ab Erledigung</option>
                <option value="invalid">fehlerhaft</option>
              </select>
            </label>
            {Object.keys(filter).length > 0 && (
              <button className="btn" onClick={() => setFilter({})}>
                zurücksetzen
              </button>
            )}
          </div>
        )}
        {state.unverified && <div className="banner">{T.unverified}</div>}
        {state.readError && <div className="banner error">{state.readError}</div>}
        {view === "problems" && !query ? (
          <Problems repo={repo} state={state} onSelect={(r) => setSelected(r)} onOutcome={notify} />
        ) : view === "trash" && !query ? (
          <Trash repo={repo} state={state} onOutcome={notify} />
        ) : (
          <div className="list" role="listbox" aria-label="Aufgaben" data-testid="list">
            {sections.map((s, i) =>
              s.items.length || (s.title && view === "today") ? (
                <div key={i} data-testid={`section-${i}`}>
                  {s.title && (
                    <div className="section">
                      {s.title} <span style={{ fontWeight: 400 }}>{s.items.length}</span>
                    </div>
                  )}
                  {s.items.map((v) => (
                    <TaskRow
                      key={v.task.ref}
                      view={v}
                      selected={v.task.ref === selected}
                      today={idx.today}
                      tz={tz}
                      showScheduledHint={s.scheduledHint && !!v.scheduled}
                      onSelect={() => setSelected(v.task.ref)}
                      onToggle={() => toggleDone(v)}
                    />
                  ))}
                </div>
              ) : null,
            )}
            {flat.length === 0 && (
              <div className="empty">{query ? "Keine Treffer." : T.empty[view as "inbox" | "today" | "all" | "done"]}</div>
            )}
            {occurrences.length > 0 && (
              <>
                <div className="section">Erledigte Vorkommen (letzte 30 Tage)</div>
                {occurrences.map((o, i) => (
                  <div key={i} className="row" onClick={() => setSelected(o.view.task.ref)}>
                    <div className="main">
                      <div className="title">{o.view.task.fields.title}</div>
                      <div className="sub">Vorkommen {describeOccurrence(o.date)} – erledigt{o.archived ? " (früherer Abschnitt)" : ""}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </section>
      <section className="detail-wrap" style={{ overflow: "auto", display: "flex" }}>
        {selectedView ? (
          <Detail
            key={selectedView.task.ref}
            repo={repo}
            view={selectedView}
            today={idx.today}
            draftText={state.drafts.find((d) => d.ref === selectedView.task.ref)?.text ?? null}
            focusField={focusField}
            onOutcome={notify}
          />
        ) : (
          <div className="empty" style={{ flex: 1 }}>
            Keine Aufgabe ausgewählt. <kbd>N</kbd> erfasst eine neue Aufgabe.
          </div>
        )}
      </section>
      {capture && (
        <Capture
          onCancel={() => setCapture(false)}
          onCapture={(title, note, edit) => {
            setCapture(false);
            void repo.create({ title, note }).then((o) => {
              notify(o, "Erfasst im Eingang");
              if (o.status === "ok" && o.ref && edit) setSelected(o.ref);
            });
          }}
        />
      )}
      {toast && (
        <div className={`toast${toast.error ? " error" : ""}`} role="status" data-testid="toast">
          <span>{toast.text}</span>
          {toast.undo && state.undo.length > 0 && (
            <button onClick={() => (setToast(null), doUndo())} data-testid="toast-undo">
              {T.actions.undo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
