// Programmieren (4.8): Listen je App, Einträge als eigene Dateien mit Notiz. Übersicht und geöffnete Liste.
import { useEffect, useMemo, useState } from "react";
import { T, toggleDoneAction, trashDevList, trashDoneDevItems, createDevItem, type CompletionPhase, type Outcome, type Repository } from "@markdoist/app";
import { devIndex, devItemsView, devListProgress, devListsView, type DevItemOptions, type Index, type ListOptions, type TaskView } from "@markdoist/core";
import { Menu, MenuItem } from "./Menu";
import { useCompletionFlow } from "../completion";
import { useDialog } from "../dialog";
import { IconChevronDown, IconClose, IconComment, IconDots, IconPencil, IconPlus, IconTrash, IconCode } from "./Icons";

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
}

export function Dev({ repo, idx, opts, itemOpts, openRef, onOpen, onOpenItem, onOutcome }: Props) {
  // Eine geöffnete Liste bleibt offen, auch wenn der Filter sie inzwischen ausblendet.
  if (openRef === DEV_ORPHANS)
    return <DevDetail repo={repo} idx={idx} list={null} itemOpts={itemOpts} onBack={() => onOpen(null)} onOpenItem={onOpenItem} onOutcome={onOutcome} />;
  const open = openRef ? devIndex(idx).lists.find((v) => v.task.ref === openRef) : undefined;
  if (open)
    return <DevDetail key={open.task.ref} repo={repo} idx={idx} list={open} itemOpts={itemOpts} onBack={() => onOpen(null)} onOpenItem={onOpenItem} onOutcome={onOutcome} />;
  return <DevOverview repo={repo} idx={idx} lists={devListsView(idx, opts)} filter={opts.filter} onOpen={onOpen} onOutcome={onOutcome} />;
}

function DevOverview({ repo, idx, lists, filter, onOpen, onOutcome }: { repo: Repository; idx: Index; lists: TaskView[]; filter: ListOptions["filter"]; onOpen(ref: string): void; onOutcome(o: Outcome, label?: string): void }) {
  const [adding, setAdding] = useState(false);
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
  const live = useMemo(() => devItemsView(idx, list, itemOpts), [idx, list, itemOpts]);
  const refs = useMemo(() => [...live.open, ...live.done].map((v) => v.task.ref), [live]);
  // Abhaken wie in Listen: Haken sofort, kurze Haltezeit, dann wandert der Eintrag nach „Erledigt“.
  const completion = useCompletionFlow({ repo, notify: onOutcome, live, refs, key: list?.task.ref ?? DEV_ORPHANS });
  const { open, done } = completion.shown;
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(f?.title ?? "");
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setTitle(f?.title ?? ""), [f?.title]);

  const add = () => {
    const t = text.trim();
    if (!t || !list) return;
    setText("");
    // Der Eintrag erscheint sofort; geschrieben wird im Hintergrund (4.4).
    void createDevItem(repo, list, t).then((o) => {
      if (o.status !== "ok") {
        onOutcome(o);
        setText((cur) => cur || t);
      }
    });
  };

  const toggle = (v: TaskView) => {
    const { action, label } = toggleDoneAction(v);
    completion.startAction(v.task.ref, label, () => repo.perform(v.task.ref, action, label));
  };

  const row = (v: TaskView) => (
    <DevItemRow
      key={v.task.ref}
      view={v}
      phase={completion.phase(v.task.ref)}
      onToggle={() => toggle(v)}
      onOpen={() => onOpenItem(v.task.ref)}
      onRemove={() => void repo.moveToTrash(v.task.ref).then((o) => onOutcome(o, "Eintrag gelöscht"))}
    />
  );

  const removeDone = () => {
    setMenu(false);
    const n = done.length;
    void trashDoneDevItems(repo, idx, list).then((o) => onOutcome(o, `${T.dev.removeDone}: ${n}`));
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
              <MenuItem icon={<IconTrash size={20} />} disabled={!done.length} testId="dev-remove-done" onClick={removeDone}>
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
        {open.length + done.length ? `${done.length} von ${open.length + done.length} erledigt` : T.dev.emptyList}
      </div>
      {!list && <div className="banner">{T.dev.orphansHint}</div>}
      {list?.diagnostics
        .filter((d) => d.severity !== "info")
        .map((d, i) => (
          <div key={i} className={`banner${d.severity === "error" ? " error" : ""}`}>
            {d.message}
          </div>
        ))}
      <div className="list checklist" data-testid="dev-items">
        {open.map(row)}
        {list && !ro && (
          <form
            className="item-add"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <span className="plus">
              <IconPlus size={18} />
            </span>
            <input autoFocus value={text} placeholder={T.dev.addItem} onChange={(e) => setText(e.target.value)} aria-label={T.dev.addItem} data-testid="dev-add-item" />
          </form>
        )}
        {done.length > 0 && (
          <div className="group checked-group">
            <button className="section checked-toggle" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} data-testid="dev-done-toggle">
              {collapsed ? <IconChevronDown size={16} className="chevron-closed" /> : <IconChevronDown size={16} />}
              <span>{T.dev.done}</span>
              <span className="section-count">{done.length}</span>
            </button>
            {!collapsed && done.map(row)}
          </div>
        )}
      </div>
      {confirmDelete && list && (
        <ConfirmDelete
          title={list.task.fields.title}
          count={open.length + done.length}
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

function DevItemRow({ view, phase, onToggle, onOpen, onRemove }: { view: TaskView; phase?: CompletionPhase; onToggle(): void; onOpen(): void; onRemove(): void }) {
  const f = view.task.fields;
  const ro = view.readOnly;
  const isDone = f.status === "done";
  // Während des Ablaufs zeigt der Haken den Zielzustand.
  const checked = isDone !== (phase !== undefined);
  const hasNote = view.task.body.trim() !== "";
  return (
    <div className={`row item-row${isDone ? " done" : ""}`} data-testid="dev-item-row" data-text={f.title}>
      <button className={`check prio-none${checked ? " checked" : ""}${phase ? " animate" : ""}`} role="checkbox" aria-checked={checked} aria-label={f.title} onClick={onToggle} disabled={ro} data-testid="dev-item-check">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.5 12.3l3 3 6-6.3" />
        </svg>
      </button>
      <div className="main dev-item-main" onClick={onOpen} data-testid="dev-item-open">
        <div className="title">{f.title}</div>
      </div>
      {hasNote && (
        <span className="dev-note" title={T.dev.hasNote} aria-label={T.dev.hasNote} data-testid="dev-item-note">
          <IconComment size={18} />
        </span>
      )}
      {!ro && (
        <div className="row-actions">
          <button className="icon-btn" title={T.lists.deleteItem} aria-label={T.lists.deleteItem} onClick={onRemove} tabIndex={-1} data-testid="dev-item-remove">
            <IconClose size={20} />
          </button>
        </div>
      )}
    </div>
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
