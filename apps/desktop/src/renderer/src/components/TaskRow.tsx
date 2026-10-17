import type { TaskView } from "@markdoist/core";
import { T } from "@markdoist/app";
import { Temporal } from "@markdoist/core";
import { shortDate } from "../format";

interface Props {
  view: TaskView;
  selected: boolean;
  today: Temporal.PlainDate;
  tz: string;
  showScheduledHint?: boolean;
  onSelect(): void;
  onToggle(): void;
}

const PRIO_MARK = { high: "!!!", normal: "!!", low: "!", none: "" } as const;

export function TaskRow({ view, selected, today, tz, showScheduledHint, onSelect, onToggle }: Props) {
  const f = view.task.fields;
  const done = f.status === "done";
  const warn = view.diagnostics.some((d) => d.severity !== "info");
  return (
    <div
      className={`row${selected ? " selected" : ""}${done ? " done" : ""}`}
      onClick={onSelect}
      data-testid="task-row"
      data-title={f.title}
      role="option"
      aria-selected={selected}
    >
      <input
        type="checkbox"
        className="check"
        checked={done}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={done ? T.actions.reopen : T.actions.complete}
        disabled={view.readOnly}
      />
      <div className="main">
        <div className="title">
          {PRIO_MARK[f.priority] && <span className={`prio-${f.priority}`}>{PRIO_MARK[f.priority]} </span>}
          {f.title}
        </div>
        <div className="sub">
          {f.inbox && !done && <span className="badge">{T.badges.inbox}</span>}
          {view.overdue && <span className="badge overdue">{T.badges.overdue}</span>}
          {view.due && <span title={T.fields.due}>⚑ {shortDate(view.due, today, tz)}</span>}
          {view.scheduled && (
            <span title={T.fields.scheduled}>
              {showScheduledHint ? "geplant " : "◷ "}
              {shortDate(view.scheduled, today, tz)}
            </span>
          )}
          {view.series && <span className="badge">↻ {T.badges.series}</span>}
          {warn && <span className="badge warn">⚠ {T.badges.warning}</span>}
          {view.readOnly && <span className="badge warn">{T.badges.readOnly}</span>}
        </div>
      </div>
    </div>
  );
}
