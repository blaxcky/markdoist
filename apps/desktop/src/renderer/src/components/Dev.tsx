// Programmieren (4.8, 4.10): Listen je App, Einträge als eigene Dateien mit Notiz. Übersicht und Board.
import { useEffect, useMemo, useState } from "react";
import { T, ageDays, createDevItemFromText, fillPendingTitles, notePlainText, startDevWorkAction, suggestDevTitle, toggleDoneAction, trashDevList, trashDoneDevItems, type CompletionPhase, type Outcome, type Repository } from "@markdoist/app";
import { DEV_DONE_LIMIT, devBoardView, devIndex, devItemsOf, devListProgress, devListsView, type DevItemOptions, type DevType, type DevTypeFilter, type Index, type ListOptions, type TaskView } from "@markdoist/core";
import { suggestTitleAuto } from "../bridge";
import { DictateButton } from "./DictateButton";
import { Menu, MenuItem } from "./Menu";
import { useCompletionFlow } from "../completion";
import { useDialog } from "../dialog";
import { IconChevronDown, IconDots, IconPencil, IconPlus, IconTrash, IconCode } from "./Icons";

/** Schlüssel der Gruppe „Ohne Liste“ anstelle einer Listenreferenz */
export const DEV_ORPHANS = "::ohne-liste";

interface Props {
  repo: Repository;
  idx: Index;
  /** Sortierung und Filter der Übersicht */
  opts: ListOptions;
  /** Sortierung der Einträge einer Liste */
  itemOpts: DevItemOptions;
  /** geöffnete Liste, `DEV_ORPHANS` oder null für die Übersicht */
  openRef: string | null;
  onOpen(ref: string | null): void;
  /** Eintrag im Detail mit Notiz öffnen */
  onOpenItem(ref: string): void;
  onOutcome(o: Outcome, label?: string): void;
  /** Eingabefeld für eine neue Liste öffnen („+“ in der Seitenleiste) */
  startAdding?: boolean;
  onStartedAdding?(): void;
}

export function Dev({ repo, idx, opts, itemOpts, openRef, onOpen, onOpenItem, onOutcome, startAdding, onStartedAdding }: Props) {
  // Eine geöffnete Liste bleibt offen, auch wenn der Filter sie inzwischen ausblendet.
  if (openRef === DEV_ORPHANS)
    return <DevDetail repo={repo} idx={idx} list={null} itemOpts={itemOpts} onBack={() => onOpen(null)} onOpenItem={onOpenItem} onOutcome={onOutcome} />;
  const open = openRef ? devIndex(idx).lists.find((v) => v.task.ref === openRef) : undefined;
  if (open)
    return <DevDetail key={open.task.ref} repo={repo} idx={idx} list={open} itemOpts={itemOpts} onBack={() => onOpen(null)} onOpenItem={onOpenItem} onOutcome={onOutcome} />;
  return <DevOverview repo={repo} idx={idx} lists={devListsView(idx, opts)} filter={opts.filter} onOpen={onOpen} onOutcome={onOutcome} startAdding={startAdding} onStartedAdding={onStartedAdding} />;
}

function DevOverview({
  repo,
  idx,
  lists,
  filter,
  onOpen,
  onOutcome,
  startAdding,
  onStartedAdding,
}: {
  repo: Repository;
  idx: Index;
  lists: TaskView[];
  filter: ListOptions["filter"];
  onOpen(ref: string): void;
  onOutcome(o: Outcome, label?: string): void;
  startAdding?: boolean;
  onStartedAdding?(): void;
}) {
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!startAdding) return;
    setAdding(true);
    onStartedAdding?.();
  }, [startAdding, onStartedAdding]);
  const [title, setTitle] = useState("");
  const orphans = devListProgress(idx, null);
  const create = () => {
    const t = title.trim();
    if (!t) return setAdding(false);
    setTitle("");
    setAdding(false);
    // Die Liste öffnet sofort; geschrieben wird im Hintergrund (4.4).
    void repo.create({ title: t, kind: "dev-list" }, onOpen).then((o) => {
      if (o.status !== "ok") onOutcome(o);
    });
  };
  return (
    <>
      <h1 className="page-title">{T.views.dev}</h1>
      <div className="page-count">
        <IconCode size={16} />
        {lists.length === 1 ? "1 Liste" : `${lists.length} Listen`}
      </div>
      <div className="list" data-testid="dev-lists">
        {lists.map((v) => (
          <DevListRow key={v.task.ref} idx={idx} view={v} onOpen={() => onOpen(v.task.ref)} />
        ))}
        {orphans.total > 0 && (
          <div className="row list-row" onClick={() => onOpen(DEV_ORPHANS)} data-testid="dev-orphans" role="option" aria-selected={false}>
            <span className="list-icon">
              <IconCode size={20} />
            </span>
            <div className="main">
              <div className="title">{T.dev.orphans}</div>
            </div>
            <span className="list-progress">{T.dev.progress(orphans.done, orphans.total)}</span>
          </div>
        )}
        {!lists.length && !adding && (
          <div className="empty" data-testid="dev-empty">
            {filter === "open" ? T.empty.listsOpen : filter === "none-open" ? T.empty.listsNoneOpen : T.empty.dev}
          </div>
        )}
        {adding ? (
          <form
            className="item-add"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <span className="plus">
              <IconPlus size={18} />
            </span>
            <input
              autoFocus
              value={title}
              placeholder={T.dev.titlePlaceholder}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => !title.trim() && setAdding(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setTitle("");
                  setAdding(false);
                }
              }}
              aria-label={T.dev.titlePlaceholder}
              data-testid="new-dev-list-title"
            />
          </form>
        ) : (
          <button className="add-inline" onClick={() => setAdding(true)} data-testid="new-dev-list">
            <span className="plus">
              <IconPlus size={18} />
            </span>
            {T.dev.newList}
          </button>
        )}
      </div>
    </>
  );
}

/** Zeile einer Programmier-Liste in Übersicht und Suche */
export function DevListRow({ idx, view, onOpen, selected }: { idx: Index; view: TaskView; onOpen(): void; selected?: boolean }) {
  const { done, total } = devListProgress(idx, view);
  const complete = total > 0 && done === total;
  return (
    <div className={`row list-row${selected ? " selected" : ""}`} onClick={onOpen} data-testid="dev-list-row" data-title={view.task.fields.title} role="option" aria-selected={!!selected}>
      <span className="list-icon">
        <IconCode size={20} />
      </span>
      <div className="main">
        <div className="title">{view.task.fields.title}</div>
      </div>
      {total > 0 && <span className={`list-progress${complete ? " complete" : ""}`}>{T.dev.progress(done, total)}</span>}
    </div>
  );
}

type Column = "open" | "work" | "done";
const COLUMN_STATUS = { open: "open", work: "in-progress", done: "done" } as const;
const columnOf = (v: TaskView): Column => (v.task.fields.status === "done" ? "done" : v.task.fields.status === "in-progress" ? "work" : "open");

/** Filter nach Art gilt für die Sitzung, über Listen hinweg (4.10). */
let sessionFilter: DevTypeFilter = "all";

function DevDetail({
  repo,
  idx,
  list,
  itemOpts,
  onBack,
  onOpenItem,
  onOutcome,
}: {
  repo: Repository;
  idx: Index;
  /** null = Einträge ohne Liste */
  list: TaskView | null;
  itemOpts: DevItemOptions;
  onBack(): void;
  onOpenItem(ref: string): void;
  onOutcome(o: Outcome, label?: string): void;
}) {
  const f = list?.task.fields;
  const ro = list?.readOnly ?? false;
  const [filter, setFilterState] = useState<DevTypeFilter>(sessionFilter);
  const setFilter = (x: DevTypeFilter) => setFilterState((sessionFilter = x));
  const board = useMemo(() => devBoardView(idx, list, itemOpts, filter), [idx, list, itemOpts, filter]);
  const live = useMemo(() => ({ open: [...board.open, ...board.work], done: board.done }), [board]);
  const refs = useMemo(() => [...live.open, ...live.done].map((v) => v.task.ref), [live]);
  // Erledigen über den Kreis wie in Listen: Haken sofort, kurze Haltezeit, dann wandert die Karte.
  const completion = useCompletionFlow({ repo, notify: onOutcome, live, refs, key: `${list?.task.ref ?? DEV_ORPHANS}|${filter}` });
  const shown = completion.shown;
  const cols: Record<Column, TaskView[]> = {
    open: shown.open.filter((v) => v.task.fields.status !== "in-progress"),
    work: shown.open.filter((v) => v.task.fields.status === "in-progress"),
    done: shown.done,
  };
  const total = devItemsOf(idx, list).length;
  const doneTotal = devItemsOf(idx, list).filter((v) => v.task.fields.status === "done").length;
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(f?.title ?? "");
  const [text, setText] = useState("");
  const [allDone, setAllDone] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  useEffect(() => setTitle(f?.title ?? ""), [f?.title]);

  // Vorläufige Titel beim Öffnen der Liste nachholen (4.10).
  useEffect(() => {
    void fillPendingTitles(repo, list, suggestTitleAuto);
  }, [repo, list?.task.ref]);

  const add = (raw: string, label?: string) => {
    const t = raw.trim();
    if (!t || !list) return;
    // Die Karte erscheint sofort mit vorläufigem Titel; Titel und Art kommen danach (4.10).
    void createDevItemFromText(repo, list, t).then((o) => {
      if (o.status !== "ok") {
        onOutcome(o);
        if (!label) setText((cur) => cur || t);
        return;
      }
      // Diktiert: kurze Bestätigung, damit klar ist, dass ohne weiteren Klick angelegt wurde (4.10).
      if (label) onOutcome({ status: "ok", message: label });
      if (o.ref) void suggestDevTitle(repo, o.ref, suggestTitleAuto);
    });
  };
  const submit = () => {
    if (!text.trim()) return;
    add(text);
    setText("");
  };

  const toggle = (v: TaskView) => {
    // Erster Klick: nur „In Arbeit“, die Karte wandert in die mittlere Spalte. Erst der zweite erledigt.
    const work = startDevWorkAction(v);
    if (work) return void repo.perform(v.task.ref, work.action, work.label).then((o) => onOutcome(o, work.label));
    const { action, label } = toggleDoneAction(v);
    completion.startAction(v.task.ref, label, () => repo.perform(v.task.ref, action, label));
  };

  const move = (ref: string, col: Column) => {
    const v = idx.tasks.find((x) => x.task.ref === ref);
    if (!v || columnOf(v) === col) return;
    const label = T.dev.moveTo(T.dev.columns[col]);
    void repo.perform(ref, { type: "setStatus", status: COLUMN_STATUS[col] }, label).then((o) => onOutcome(o, label));
  };

  const setType = (v: TaskView, devType: DevType | null) => {
    const label = `${T.dev.typeMenu}: ${devType ? T.dev.typeLabels[devType] : T.dev.noType}`;
    void repo.perform(v.task.ref, { type: "setDevType", devType }, label).then((o) => onOutcome(o, label));
  };

  const removeDone = () => {
    setMenu(false);
    const n = doneTotal;
    void trashDoneDevItems(repo, idx, list).then((o) => onOutcome(o, `${T.dev.removeDone}: ${n}`));
  };

  const today = idx.today.toString();
  const card = (v: TaskView) => (
    <DevCard
      key={v.task.ref}
      view={v}
      today={today}
      phase={completion.phase(v.task.ref)}
      dragging={drag === v.task.ref}
      onToggle={() => toggle(v)}
      onOpen={() => onOpenItem(v.task.ref)}
      onMove={(col) => move(v.task.ref, col)}
      onType={(t) => setType(v, t)}
      onRemove={() => void repo.moveToTrash(v.task.ref).then((o) => onOutcome(o, "Eintrag gelöscht"))}
      onDragStart={() => setDrag(v.task.ref)}
      onDragEnd={() => (setDrag(null), setOver(null))}
    />
  );

  const column = (col: Column) => {
    const items = col === "done" && !allDone ? cols.done.slice(0, DEV_DONE_LIMIT) : cols[col];
    return (
      <section
        key={col}
        className={`dev-col ${col}${over === col && drag ? " drop-here" : ""}`}
        aria-label={T.dev.columns[col]}
        data-testid={`dev-col-${col}`}
        onDragOver={(e) => {
          if (!drag) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (over !== col) setOver(col);
        }}
        onDragLeave={(e) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === col ? null : o));
        }}
        onDrop={(e) => {
          e.preventDefault();
          const ref = drag ?? e.dataTransfer.getData("text/plain");
          setDrag(null);
          setOver(null);
          if (ref) move(ref, col);
        }}
      >
        <h2 className="dev-col-head">
          <span className={`dev-col-dot ${col}`} aria-hidden="true" />
          {T.dev.columns[col]}
          <span className="section-count" data-testid={`dev-col-count-${col}`}>
            {cols[col].length}
          </span>
        </h2>
        <div className="dev-cards">
          {items.map(card)}
          {col === "open" && !total && <div className="empty dev-empty">{T.dev.emptyList}</div>}
        </div>
        {col === "done" && cols.done.length > DEV_DONE_LIMIT && (
          <button className="add-inline dev-more" onClick={() => setAllDone((a) => !a)} data-testid="dev-all-done">
            {allDone ? T.dev.fewerDone : T.dev.allDone(cols.done.length)}
          </button>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="list-head">
        <button className="back-btn" onClick={onBack} data-testid="dev-back">
          <IconChevronDown size={16} className="back-chevron" />
          {T.views.dev}
        </button>
      </div>
      <div className="list-title-row">
        {renaming && list ? (
          <input
            className="page-title list-title-input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              if (title.trim() && title.trim() !== f!.title)
                void repo.perform(list.task.ref, { type: "setTitle", title }, "Umbenannt").then((o) => onOutcome(o, "Umbenannt"));
              else setTitle(f!.title);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setTitle(f!.title);
                setRenaming(false);
              }
            }}
            aria-label={T.fields.title}
            data-testid="dev-title-input"
          />
        ) : (
          <h1 className="page-title" onDoubleClick={() => list && !ro && setRenaming(true)} data-testid="dev-title">
            {f?.title ?? T.dev.orphans}
          </h1>
        )}
        <span className="menu-anchor">
          <button className="icon-btn" onClick={() => setMenu((m) => !m)} data-menu-anchor title="Listenaktionen" aria-label="Listenaktionen" data-testid="dev-menu">
            <IconDots size={24} />
          </button>
          {menu && (
            <Menu label="Listenaktionen" onClose={() => setMenu(false)}>
              {list && (
                <MenuItem icon={<IconPencil size={20} />} disabled={ro} onClick={() => (setMenu(false), setRenaming(true))}>
                  {T.dev.rename}
                </MenuItem>
              )}
              <MenuItem icon={<IconTrash size={20} />} disabled={!doneTotal} testId="dev-remove-done" onClick={removeDone}>
                {T.dev.removeDone}
              </MenuItem>
              {list && (
                <>
                  <div className="menu-sep" />
                  <MenuItem icon={<IconTrash size={20} />} danger disabled={ro} testId="dev-delete-list" onClick={() => (setMenu(false), setConfirmDelete(true))}>
                    {T.dev.deleteList}
                  </MenuItem>
                </>
              )}
            </Menu>
          )}
        </span>
      </div>
      <div className="page-count">
        <IconCode size={16} />
        {total ? `${doneTotal} von ${total} erledigt` : T.dev.emptyList}
      </div>
      {!list && <div className="banner">{T.dev.orphansHint}</div>}
      {list?.diagnostics
        .filter((d) => d.severity !== "info")
        .map((d, i) => (
          <div key={i} className={`banner${d.severity === "error" ? " error" : ""}`}>
            {d.message}
          </div>
        ))}
      {list && !ro && (
        <form
          className="dev-compose"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            autoFocus
            rows={2}
            value={text}
            placeholder={T.dev.composePlaceholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
            aria-label={T.dev.composePlaceholder}
            data-testid="dev-add-item"
          />
          <div className="dev-compose-bar">
            <span className="hint">{T.dev.composeHint}</span>
            <span className="spacer" />
            <DictateButton
              key={list.task.ref}
              testId="dev-dictate"
              label={T.dictation.dictate}
              ctx={() => ({ list: list.task.fields.title })}
              onResult={(r) => add(r.text, r.cleaned || !r.cleanupError ? T.dev.created : `${T.dev.created} · ${T.dictation.notCleaned}`)}
              onError={(kind) => onOutcome({ status: "error", message: T.dictation.errors[kind] })}
            />
            <button className="btn primary" type="submit" disabled={!text.trim()} data-testid="dev-add-submit">
              {T.dev.file}
            </button>
          </div>
        </form>
      )}
      <div className="dev-filters" role="group" aria-label={T.dev.typeMenu}>
        {(["all", "bug", "feature", "idea"] as const).map((x) => (
          <button key={x} className={`chip${filter === x ? " on" : ""}`} aria-pressed={filter === x} onClick={() => setFilter(x)} data-testid={`dev-filter-${x}`}>
            {T.dev.filters[x]} <span className="chip-count">{board.counts[x]}</span>
          </button>
        ))}
      </div>
      <div className="dev-board" data-testid="dev-items">
        {column("open")}
        {column("work")}
        {column("done")}
      </div>
      {confirmDelete && list && (
        <ConfirmDelete
          title={list.task.fields.title}
          count={total}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onBack();
            void trashDevList(repo, idx, list).then((o) => onOutcome(o, "Liste gelöscht"));
          }}
        />
      )}
    </>
  );
}

/** Art-Chip einer Karte bzw. des Details (4.10) */
export function DevTypeChip({ type }: { type: DevType }) {
  return (
    <span className={`dev-type ${type}`} data-testid="dev-type">
      {T.dev.typeLabels[type]}
    </span>
  );
}

function DevCard({
  view,
  today,
  phase,
  dragging,
  onToggle,
  onOpen,
  onMove,
  onType,
  onRemove,
  onDragStart,
  onDragEnd,
}: {
  view: TaskView;
  today: string;
  phase?: CompletionPhase;
  dragging: boolean;
  onToggle(): void;
  onOpen(): void;
  onMove(col: Column): void;
  onType(t: DevType | null): void;
  onRemove(): void;
  onDragStart(): void;
  onDragEnd(): void;
}) {
  const f = view.task.fields;
  const ro = view.readOnly;
  const isDone = f.status === "done";
  const checked = isDone !== (phase !== undefined);
  const half = f.status === "in-progress" && phase === undefined;
  const [menu, setMenu] = useState(false);
  const days = ageDays(f.dateCreated, today);
  // Ein vorläufiger Titel ist der Anfang der Notiz: Der Auszug wiederholte ihn nur.
  const plain = notePlainText(view.task.body);
  const excerpt = plain === f.title ? "" : plain;
  const col = columnOf(view);
  const close = (fn: () => void) => () => (setMenu(false), fn());
  return (
    <article
      className={`dev-card${isDone ? " done" : ""}${dragging ? " dragging" : ""}`}
      draggable={!ro}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", view.task.ref);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
      data-testid="dev-item-row"
      data-text={f.title}
      data-status={f.status}
    >
      <div className="dev-card-top">
        {f.devType && <DevTypeChip type={f.devType} />}
        <span className="spacer" />
        {days !== null && <span className="dev-age">{T.dev.age(days)}</span>}
        <span className="menu-anchor">
          <button className="icon-btn small dev-card-menu" onClick={() => setMenu((m) => !m)} data-menu-anchor title="Aktionen" aria-label="Aktionen" data-testid="dev-card-menu">
            <IconDots size={18} />
          </button>
          {menu && (
            <Menu label="Aktionen" onClose={() => setMenu(false)}>
              <MenuItem onClick={close(onOpen)} testId="dev-card-open">
                Öffnen
              </MenuItem>
              <div className="menu-sep" />
              {(["open", "work", "done"] as const).map((c) => (
                <MenuItem key={c} disabled={ro || c === col} onClick={close(() => onMove(c))} testId={`dev-move-${c}`}>
                  {`${T.fields.status}: ${T.dev.columns[c]}`}
                </MenuItem>
              ))}
              <div className="menu-sep" />
              {(["bug", "feature", "idea", null] as const).map((t) => (
                <MenuItem key={t ?? "none"} disabled={ro || f.devType === t} onClick={close(() => onType(t))} testId={`dev-type-${t ?? "none"}`}>
                  {`${T.dev.typeMenu}: ${t ? T.dev.typeLabels[t] : T.dev.noType}`}
                </MenuItem>
              ))}
              <div className="menu-sep" />
              <MenuItem icon={<IconTrash size={20} />} danger disabled={ro} onClick={close(onRemove)} testId="dev-item-remove">
                {T.lists.deleteItem}
              </MenuItem>
            </Menu>
          )}
        </span>
      </div>
      <div className="dev-card-title">
        <button className={`check prio-none${checked ? " checked" : ""}${half ? " half" : ""}${phase ? " animate" : ""}`} role="checkbox" aria-checked={half ? "mixed" : checked} aria-label={f.title} title={half ? T.actions.complete : !checked ? T.dev.startWork : undefined} onClick={onToggle} disabled={ro} data-testid="dev-item-check">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.5 12.3l3 3 6-6.3" />
          </svg>
        </button>
        <button className={`dev-card-open${f.titlePending ? " pending" : ""}`} onClick={onOpen} data-testid="dev-item-open">
          <span className="title">{f.title}</span>
          {f.titlePending && <span className="dev-pending">{T.dev.titlePending}</span>}
        </button>
      </div>
      {excerpt && (
        <p className="dev-excerpt" data-testid="dev-item-note">
          {excerpt}
        </p>
      )}
    </article>
  );
}

function ConfirmDelete({ title, count, onCancel, onConfirm }: { title: string; count: number; onCancel(): void; onConfirm(): void }) {
  const ref = useDialog<HTMLDivElement>(onCancel);
  return (
    <div className="modal-back" onClick={onCancel}>
      <div ref={ref} className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={T.dev.deleteList}>
        <h2>{T.dev.deleteList}</h2>
        <p>{T.dev.deleteConfirm(title, count)} Einzelne Dateien lassen sich dort wiederherstellen.</p>
        <div className="buttons">
          <button className="btn" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="btn danger" onClick={onConfirm} data-testid="dev-confirm-delete">
            In den Papierkorb
          </button>
        </div>
      </div>
    </div>
  );
}
