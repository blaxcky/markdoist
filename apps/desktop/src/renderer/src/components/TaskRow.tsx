import { useState } from "react";
import type { TaskView } from "@markdoist/core";
import { T } from "@markdoist/app";
import { Temporal } from "@markdoist/core";
import { dateLabel } from "../format";
import { IconCalendar, IconComment, IconDots, IconInbox, IconPencil, IconRepeat, IconTime, IconTrash, IconWarning, IconDone } from "./Icons";
import { Menu, MenuItem } from "./Menu";

interface Props {
  view: TaskView;
  selected: boolean;
  today: Temporal.PlainDate;
  tz: string;
  showScheduledHint?: boolean;
  onSelect(): void;
  onToggle(): void;
  /** Detail öffnen und ein Feld fokussieren */
  onEdit(field?: "due" | "note"): void;
  onFile(): void;
  onDelete(): void;
}

export function TaskRow({ view, selected, today, tz, showScheduledHint, onSelect, onToggle, onEdit, onFile, onDelete }: Props) {
  const f = view.task.fields;
  const done = f.status === "done";
  const warn = view.diagnostics.some((d) => d.severity !== "info");
  const [menu, setMenu] = useState(false);
  const due = view.due ? dateLabel(view.due, today, tz, view.overdue) : null;
  const sch = view.scheduled ? dateLabel(view.scheduled, today, tz) : null;
  const ro = view.readOnly;
  return (
    <div
      className={`row${selected ? " selected" : ""}${done ? " done" : ""}${menu ? " menu-open" : ""}`}
      onClick={onSelect}
      data-testid="task-row"
      data-title={f.title}
      role="option"
      aria-selected={selected}
    >
      <button
        className={`check prio-${f.priority}${done ? " checked" : ""}`}
        role="checkbox"
        aria-checked={done}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={done ? T.actions.reopen : T.actions.complete}
        disabled={ro}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.5 12.3l3 3 6-6.3" />
        </svg>
      </button>
      <div className="main">
        <div className="title">{f.title}</div>
        {view.task.body.trim() && <div className="desc">{firstLine(view.task.body)}</div>}
        <div className="sub">
          <div className="meta">
            {due && (
              <span className={`date tone-${due.tone}`} title={T.fields.due}>
                <IconCalendar size={12} />
                {due.text}
                {view.series && <IconRepeat size={12} />}
              </span>
            )}
            {sch && (
              <span className={`date sched tone-${sch.tone === "overdue" ? "later" : sch.tone}`} title={T.fields.scheduled}>
                <IconTime size={12} />
                {showScheduledHint ? "geplant " : ""}
                {sch.text}
                {view.series && !due && <IconRepeat size={12} />}
              </span>
            )}
            {view.series && !due && !sch && (
              <span className="date tone-later">
                <IconRepeat size={12} /> {T.badges.series}
              </span>
            )}
            {warn && (
              <span className="flagged warn">
                <IconWarning size={12} /> {T.badges.warning}
              </span>
            )}
            {ro && <span className="flagged warn">{T.badges.readOnly}</span>}
          </div>
          {f.inbox && !done && (
            <span className="project">
              {T.badges.inbox} <IconInbox size={12} />
            </span>
          )}
        </div>
      </div>
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="Details öffnen" aria-label="Details öffnen" onClick={() => onEdit()} tabIndex={-1}>
          <IconPencil size={24} />
        </button>
        <button className="icon-btn" title="Frist setzen" aria-label="Frist setzen" onClick={() => onEdit("due")} disabled={ro} tabIndex={-1}>
          <IconCalendar size={24} />
        </button>
        <button className="icon-btn" title="Notiz öffnen" aria-label="Notiz öffnen" onClick={() => onEdit("note")} tabIndex={-1}>
          <IconComment size={24} />
        </button>
        <span className="menu-anchor">
          <button className="icon-btn" title="Weitere Aktionen" aria-label="Weitere Aktionen" onClick={() => setMenu((m) => !m)} data-menu-anchor tabIndex={-1}>
            <IconDots size={24} />
          </button>
          {menu && (
            <Menu label="Aufgabenaktionen" onClose={() => setMenu(false)}>
              <MenuItem icon={<IconDone size={20} />} disabled={ro} onClick={() => (setMenu(false), onToggle())}>
                {done ? T.actions.reopen : T.actions.complete}
              </MenuItem>
              <MenuItem icon={<IconInbox size={20} />} disabled={ro} onClick={() => (setMenu(false), onFile())}>
                {f.inbox ? T.actions.file : T.actions.toInbox}
              </MenuItem>
              <div className="menu-sep" />
              <MenuItem icon={<IconTrash size={20} />} danger disabled={ro} onClick={() => (setMenu(false), onDelete())}>
                {T.actions.delete}
              </MenuItem>
            </Menu>
          )}
        </span>
      </div>
    </div>
  );
}

function firstLine(body: string): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return (line ?? "").replace(/^[#>*\-+\s]+(\[[ xX]\]\s*)?/, "");
}
