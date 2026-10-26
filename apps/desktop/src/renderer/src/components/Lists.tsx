// Listen (4.6): einfache Abhaklisten ohne Termine. Übersicht und geöffnete Liste.
import { useEffect, useRef, useState } from "react";
import { T, type Outcome, type Repository } from "@markdoist/app";
import { findCheckboxes, listsView, type Checkbox, type Index, type TaskAction, type TaskView } from "@markdoist/core";
import { Menu, MenuItem } from "./Menu";
import { IconChevronDown, IconClose, IconDots, IconGrip, IconList, IconPencil, IconPlus, IconTrash, IconUndo } from "./Icons";

interface Props {
  repo: Repository;
  idx: Index;
  /** geöffnete Liste oder null für die Übersicht */
  openRef: string | null;
  onOpen(ref: string | null): void;
  onOutcome(o: Outcome, label?: string): void;
  onEditMarkdown(ref: string): void;
}

export function Lists({ repo, idx, openRef, onOpen, onOutcome, onEditMarkdown }: Props) {
  const lists = listsView(idx);
  const open = openRef ? lists.find((v) => v.task.ref === openRef) : undefined;
  if (open) return <ListDetail key={open.task.ref} repo={repo} view={open} onBack={() => onOpen(null)} onOutcome={onOutcome} onEditMarkdown={onEditMarkdown} />;
  return <ListOverview repo={repo} lists={lists} onOpen={onOpen} onOutcome={onOutcome} />;
}

/** Fortschritt „abgehakt/gesamt“ einer Liste */
export function listProgress(v: TaskView): { done: number; total: number } {
  const items = findCheckboxes(v.task.body);
  return { done: items.filter((c) => c.checked).length, total: items.length };
}

function ListOverview({ repo, lists, onOpen, onOutcome }: { repo: Repository; lists: TaskView[]; onOpen(ref: string): void; onOutcome(o: Outcome, label?: string): void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const create = () => {
    const t = title.trim();
    if (!t) return setAdding(false);
    setTitle("");
    setAdding(false);
    void repo.create({ title: t, kind: "list" }).then((o) => {
      if (o.status === "ok" && o.ref) onOpen(o.ref);
      else onOutcome(o);
    });
  };
  return (
    <>
      <h1 className="page-title">{T.views.lists}</h1>
      <div className="page-count">
        <IconList size={16} />
        {lists.length === 1 ? "1 Liste" : `${lists.length} Listen`}
      </div>
      <div className="list" data-testid="lists">
        {lists.map((v) => (
          <ListRow key={v.task.ref} view={v} onOpen={() => onOpen(v.task.ref)} />
        ))}
        {!lists.length && !adding && <div className="empty">{T.empty.lists}</div>}
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
              placeholder={T.lists.titlePlaceholder}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => !title.trim() && setAdding(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setTitle("");
                  setAdding(false);
                }
              }}
              aria-label={T.lists.titlePlaceholder}
              data-testid="new-list-title"
            />
          </form>
        ) : (
          <button className="add-inline" onClick={() => setAdding(true)} data-testid="new-list">
            <span className="plus">
              <IconPlus size={18} />
            </span>
            {T.lists.newList}
          </button>
        )}
      </div>
    </>
  );
}

/** Zeile einer Liste in Übersicht und Suche */
export function ListRow({ view, onOpen, selected }: { view: TaskView; onOpen(): void; selected?: boolean }) {
  const { done, total } = listProgress(view);
  const complete = total > 0 && done === total;
  return (
    <div className={`row list-row${selected ? " selected" : ""}`} onClick={onOpen} data-testid="list-row" data-title={view.task.fields.title} role="option" aria-selected={!!selected}>
      <span className="list-icon">
        <IconList size={20} />
      </span>
      <div className="main">
        <div className="title">{view.task.fields.title}</div>
      </div>
      {total > 0 && <span className={`list-progress${complete ? " complete" : ""}`}>{T.lists.progress(done, total)}</span>}
    </div>
  );
}

function ListDetail({ repo, view, onBack, onOutcome, onEditMarkdown }: { repo: Repository; view: TaskView; onBack(): void; onOutcome(o: Outcome, label?: string): void; onEditMarkdown(ref: string): void }) {
  const ref = view.task.ref;
  const f = view.task.fields;
  const ro = view.readOnly;
  const items = findCheckboxes(view.task.body);
  const open = items.filter((c) => !c.checked);
  const checked = items.filter((c) => c.checked);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(f.title);
  const [text, setText] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [dragLine, setDragLine] = useState<number | null>(null);
  const [dropBefore, setDropBefore] = useState<number | "end" | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => setTitle(f.title), [f.title]);

  /** Schreibt eine Aktion; Erfolgsmeldung nur mit Text (Abhaken und Tippen sollen nicht melden). */
  const act = (action: TaskAction, label?: string) =>
    repo.perform(ref, action, label ?? T.lists.editItem).then((o) => {
      if (o.status !== "ok" || label) onOutcome(o, label);
      return o;
    });

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void act({ type: "addItem", text: t }).then((o) => o.status !== "ok" && setText((cur) => cur || t));
  };

  // Weiterer Inhalt außer Einträgen (Notizen, Überschriften): bleibt erhalten, ist hier aber nicht sichtbar.
  const itemLines = new Set(items.flatMap((c) => Array.from({ length: c.end - c.line }, (_, i) => c.line + i)));
  const otherContent = view.task.body.split("\n").some((l, i) => !itemLines.has(i) && l.trim() !== "");

  const drop = (target: Checkbox | null) => {
    const from = items.find((c) => c.line === dragLine);
    setDragLine(null);
    setDropBefore(null);
    if (!from || (target && target.line === from.line)) return;
    void act({ type: "moveItem", line: from.line, before: target ? target.line : null, expect: from.text, expectBefore: target?.text });
  };

  const row = (c: Checkbox) => (
    <ItemRow
      key={`${c.line}:${c.text}`}
      item={c}
      readOnly={ro}
      draggable={!ro && !c.checked && c.depth === 0}
      dragging={dragLine === c.line}
      dropHere={dropBefore === c.line}
      onToggle={() => void act({ type: "toggleCheckbox", line: c.line, expect: c.text })}
      onEdit={(t) => void act({ type: "editItem", line: c.line, text: t, expect: c.text })}
      onRemove={() => void act({ type: "removeItem", line: c.line, expect: c.text }, "Eintrag gelöscht")}
      onDragStart={() => setDragLine(c.line)}
      onDragOver={() => dragLine !== null && c.depth === 0 && !c.checked && setDropBefore(c.line)}
      onDrop={() => drop(c)}
      onDragEnd={() => (setDragLine(null), setDropBefore(null))}
    />
  );

  return (
    <>
      <div className="list-head">
        <button className="back-btn" onClick={onBack} data-testid="lists-back">
          <IconChevronDown size={16} className="back-chevron" />
          {T.views.lists}
        </button>
      </div>
      <div className="list-title-row">
        {renaming ? (
          <input
            className="page-title list-title-input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              if (title.trim() && title.trim() !== f.title) void act({ type: "setTitle", title }, "Umbenannt");
              else setTitle(f.title);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setTitle(f.title);
                setRenaming(false);
              }
            }}
            aria-label={T.fields.title}
            data-testid="list-title-input"
          />
        ) : (
          <h1 className="page-title" onDoubleClick={() => !ro && setRenaming(true)} data-testid="list-title">
            {f.title}
          </h1>
        )}
        <span className="menu-anchor">
          <button className="icon-btn" onClick={() => setMenu((m) => !m)} data-menu-anchor title="Listenaktionen" aria-label="Listenaktionen" data-testid="list-menu">
            <IconDots size={24} />
          </button>
          {menu && (
            <Menu label="Listenaktionen" onClose={() => setMenu(false)}>
              <MenuItem icon={<IconPencil size={20} />} disabled={ro} onClick={() => (setMenu(false), setRenaming(true))}>
                {T.lists.rename}
              </MenuItem>
              <MenuItem icon={<IconTrash size={20} />} disabled={ro || !checked.length} testId="remove-checked" onClick={() => (setMenu(false), void act({ type: "removeCheckedItems" }, `${T.lists.removeChecked}: ${checked.length}`))}>
                {T.lists.removeChecked}
              </MenuItem>
              <MenuItem icon={<IconUndo size={20} />} disabled={ro || !checked.length} testId="reset-items" onClick={() => (setMenu(false), void act({ type: "resetItems" }, T.lists.resetAll))}>
                {T.lists.resetAll}
              </MenuItem>
              <MenuItem icon={<IconList size={20} />} onClick={() => (setMenu(false), onEditMarkdown(ref))}>
                {T.lists.editMarkdown}
              </MenuItem>
              <div className="menu-sep" />
              <MenuItem
                icon={<IconTrash size={20} />}
                danger
                disabled={ro}
                testId="delete-list"
                onClick={() => {
                  setMenu(false);
                  void repo.moveToTrash(ref).then((o) => {
                    onOutcome(o, "Liste gelöscht");
                    if (o.status === "ok") onBack();
                  });
                }}
              >
                {T.lists.deleteList}
              </MenuItem>
            </Menu>
          )}
        </span>
      </div>
      <div className="page-count">
        <IconList size={16} />
        {items.length ? `${checked.length} von ${items.length} abgehakt` : T.lists.emptyList}
      </div>
      {view.diagnostics
        .filter((d) => d.severity !== "info")
        .map((d, i) => (
          <div key={i} className={`banner${d.severity === "error" ? " error" : ""}`}>
            {d.message}
          </div>
        ))}
      <div className="list checklist" data-testid="checklist">
        {open.map(row)}
        {!ro && (
          <form
            className={`item-add${dropBefore === "end" ? " drop-here" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            onDragOver={(e) => {
              if (dragLine === null) return;
              e.preventDefault();
              setDropBefore("end");
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(null);
            }}
          >
            <span className="plus">
              <IconPlus size={18} />
            </span>
            <input ref={addRef} autoFocus value={text} placeholder={T.lists.addItem} onChange={(e) => setText(e.target.value)} aria-label={T.lists.addItem} data-testid="add-item" />
          </form>
        )}
        {checked.length > 0 && (
          <div className="group checked-group">
            <button className="section checked-toggle" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} data-testid="checked-toggle">
              {collapsed ? <IconChevronDown size={16} className="chevron-closed" /> : <IconChevronDown size={16} />}
              <span>{T.lists.checked}</span>
              <span className="section-count">{checked.length}</span>
            </button>
            {!collapsed && checked.map(row)}
          </div>
        )}
        {otherContent && <div className="list-note">{T.lists.otherContent}</div>}
      </div>
    </>
  );
}

function ItemRow({
  item,
  readOnly,
  draggable,
  dragging,
  dropHere,
  onToggle,
  onEdit,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  item: Checkbox;
  readOnly: boolean;
  draggable: boolean;
  dragging: boolean;
  dropHere: boolean;
  onToggle(): void;
  onEdit(text: string): void;
  onRemove(): void;
  onDragStart(): void;
  onDragOver(): void;
  onDrop(): void;
  onDragEnd(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);
  const save = () => {
    setEditing(false);
    const t = text.trim();
    if (!t) onRemove();
    else if (t !== item.text) onEdit(t);
  };
  return (
    <div
      className={`row item-row${item.checked ? " done" : ""}${dragging ? " dragging" : ""}${dropHere ? " drop-here" : ""}`}
      style={item.depth ? { paddingLeft: item.depth * 28 } : undefined}
      draggable={draggable && !editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.text);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      data-testid="item-row"
      data-text={item.text}
    >
      {draggable && (
        <span className="grip" title={T.lists.dragHandle} aria-hidden="true">
          <IconGrip size={18} />
        </span>
      )}
      <button className={`check prio-none${item.checked ? " checked" : ""}`} role="checkbox" aria-checked={item.checked} aria-label={item.text} onClick={onToggle} disabled={readOnly} data-testid="item-check">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.5 12.3l3 3 6-6.3" />
        </svg>
      </button>
      <div className="main">
        {editing ? (
          <input
            className="item-input"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setText(item.text);
                setEditing(false);
              }
            }}
            aria-label={T.lists.editItem}
            data-testid="item-input"
          />
        ) : (
          <div className="title" onClick={() => !readOnly && setEditing(true)}>
            {item.text}
          </div>
        )}
      </div>
      {!readOnly && !editing && (
        <div className="row-actions">
          <button className="icon-btn" title={T.lists.deleteItem} aria-label={T.lists.deleteItem} onClick={onRemove} tabIndex={-1} data-testid="item-remove">
            <IconClose size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
