// Detailansicht (4.4): Formularfelder, Serienbereich, Markdown-Editor und Vorschau.
import { useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown, T, type Outcome, type Repository } from "@markdoist/app";
import {
  describeOccurrence,
  describeRule,
  parseKey,
  Temporal,
  type Priority,
  type Status,
  type TaskAction,
  type TaskView,
} from "@markdoist/core";
import { MarkdownEditor } from "./MarkdownEditor";
import { RecurrenceEditor } from "./RecurrenceEditor";
import { splitDateValue } from "../format";

type SaveState = "idle" | "pending" | "draft" | "saved" | "failed" | "conflict";

interface Props {
  repo: Repository;
  view: TaskView;
  today: Temporal.PlainDate;
  draftText: string | null;
  focusField: { field: "due" | "scheduled" | "priority" | "title"; nonce: number } | null;
  onOutcome(o: Outcome, label?: string): void;
}

export function Detail({ repo, view, today, draftText, focusField, onOutcome }: Props) {
  const t = view.task;
  const f = t.fields;
  const ref = t.ref;
  const ro = view.readOnly;
  const s = view.series;
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [title, setTitle] = useState(f.title);
  const [save, setSave] = useState<SaveState>(draftText !== null ? "draft" : "idle");
  const [editRule, setEditRule] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);
  const schRef = useRef<HTMLInputElement>(null);
  const prioRef = useRef<HTMLSelectElement>(null);

  useEffect(() => setTitle(f.title), [f.title, ref]);
  useEffect(() => {
    if (!focusField) return;
    const el = { title: titleRef, due: dueRef, scheduled: schRef, priority: prioRef }[focusField.field].current;
    el?.focus();
  }, [focusField]);

  const act = async (action: TaskAction, label: string) => {
    const o = await repo.perform(ref, action, label);
    onOutcome(o, label);
    return o;
  };

  // Autosave: Entwurf sofort lokal sichern, Datei 1,5 s nach letzter Eingabe und beim Verlassen.
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!pending.current) return;
    pending.current = false;
    const o = await repo.commitDraft(ref);
    if (o.status === "ok" || o.status === "noop") setSave("saved");
    else if (o.status === "conflict") {
      setSave("conflict");
      onOutcome(o, "Notiz");
    } else {
      setSave("failed");
      onOutcome(o, "Notiz");
    }
  };
  useEffect(() => {
    return () => {
      void flush();
    };
    // beim Wechsel der Aufgabe speichern
  }, [ref]);  

  const onBodyChange = (text: string) => {
    pending.current = true;
    setSave("pending");
    void repo.saveDraft(ref, text).then(() => setSave((x) => (x === "pending" ? "draft" : x)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1500);
  };

  const body = draftText ?? t.body;
  const html = useMemo(() => (tab === "preview" ? renderMarkdown(body) : ""), [tab, body]);

  const setDate = (field: "due" | "scheduled", date: string, time: string) => {
    const value = date ? (time ? `${date}T${time}` : date) : null;
    void act({ type: "setDate", field, value }, field === "due" ? "Frist geändert" : "Planung geändert");
  };

  const dateEditor = (field: "due" | "scheduled") => {
    const raw = t.data[field];
    const { date, time } = splitDateValue(raw);
    const invalid = raw !== undefined && raw !== null && raw !== "" && !f[field];
    return (
      <div className="dateedit">
        <input
          ref={field === "due" ? dueRef : schRef}
          type="date"
          value={date}
          disabled={ro}
          onChange={(e) => setDate(field, e.target.value, time)}
          data-testid={`field-${field}`}
          aria-label={T.fields[field]}
        />
        {date && (time ? (
          <input type="time" value={time} disabled={ro} onChange={(e) => setDate(field, date, e.target.value)} aria-label="Uhrzeit" />
        ) : (
          <button className="btn" disabled={ro} onClick={() => setDate(field, date, "09:00")}>Uhrzeit hinzufügen</button>
        ))}
        {date && (
          <button className="btn" disabled={ro} onClick={() => setDate(field, "", "")} aria-label={`${T.fields[field]} entfernen`}>
            ✕
          </button>
        )}
        {invalid && <span className="badge warn">ungültig: {String(raw)}</span>}
      </div>
    );
  };

  const K = s?.instance?.toString() ?? "";
  const seriesActive = s && s.phase === "active";

  const onPreviewClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.classList.contains("md-check")) {
      e.preventDefault();
      if (ro) return;
      void flush().then(() => act({ type: "toggleCheckbox", line: Number(el.dataset.line) }, "Checkbox"));
    } else if (el instanceof HTMLAnchorElement) {
      e.preventDefault();
      void window.markdoist.openExternal(el.href);
    }
  };

  const history = useMemo(() => {
    if (!s && !Array.isArray(t.data.recurrence_archive)) return null;
    const sections: { label: string; done: string[]; skipped: string[] }[] = [];
    if (s) sections.push({ label: `Aktiver Abschnitt (${s.raw})`, done: [...s.C].sort().reverse(), skipped: [...s.S].sort().reverse() });
    const arch = t.data.recurrence_archive;
    if (Array.isArray(arch)) {
      for (const a of arch) {
        if (!a || typeof a !== "object" || Array.isArray(a)) continue;
        const snap = a as Record<string, unknown>;
        const list = (k: string) => (Array.isArray(snap[k]) ? (snap[k] as unknown[]).map(String) : []);
        sections.push({
          label: `Archiv (${String(snap.recurrence)}, ${snap.closed_reason === "removed" ? "entfernt" : "Regel geändert"})`,
          done: [...new Set(list("complete_instances"))].sort().reverse(),
          skipped: [...new Set(list("skipped_instances"))].sort().reverse(),
        });
      }
    }
    return sections;
  }, [s, t.data.recurrence_archive]);

  return (
    <div className="detail" data-testid="detail">
      <div className="head">
        <input
          ref={titleRef}
          className="titleinput"
          value={title}
          disabled={ro}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== f.title && void act({ type: "setTitle", title }, "Titel geändert")}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTitle(f.title);
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={T.fields.title}
          data-testid="field-title"
        />
      </div>
      {view.diagnostics
        .filter((d) => d.severity !== "info")
        .map((d, i) => (
          <div key={i} className={`diag ${d.severity === "error" ? "error" : "warn"}`}>
            {d.message}
          </div>
        ))}
      <div className="fields">
        <label>{T.fields.status}</label>
        <select
          value={f.status}
          disabled={ro}
          onChange={(e) => void act({ type: "setStatus", status: e.target.value as Status }, "Status geändert")}
          data-testid="field-status"
        >
          {(["open", "in-progress", "done"] as Status[]).map((x) => (
            <option key={x} value={x}>
              {T.status[x]}
            </option>
          ))}
        </select>
        <label>{T.fields.priority}</label>
        <select
          ref={prioRef}
          value={f.priority}
          disabled={ro}
          onChange={(e) => void act({ type: "setPriority", priority: e.target.value as Priority }, "Priorität geändert")}
          data-testid="field-priority"
        >
          {(["none", "low", "normal", "high"] as Priority[]).map((x) => (
            <option key={x} value={x}>
              {T.priority[x]}
            </option>
          ))}
        </select>
        <label>{T.fields.inbox}</label>
        <label style={{ color: "var(--fg)" }}>
          <input
            type="checkbox"
            checked={f.inbox}
            disabled={ro}
            onChange={(e) => void act({ type: "setInbox", inbox: e.target.checked }, e.target.checked ? "Zurück in den Eingang" : "Einsortiert")}
            data-testid="field-inbox"
          />{" "}
          im Eingang
        </label>
        <label>{T.fields.due}</label>
        {dateEditor("due")}
        <label>{T.fields.scheduled}</label>
        {dateEditor("scheduled")}
        <label>Wiederholung</label>
        <div className="dateedit">
          <span data-testid="series-desc">
            {s ? (s.rule ? describeRule(s.rule, s.anchor) ?? s.raw : s.raw) : "keine"}
            {s && s.anchor === "completion" && s.rule ? "" : ""}
          </span>
          <button className="btn" disabled={ro} onClick={() => setEditRule(true)} data-testid="edit-recurrence">
            {s ? "Regel bearbeiten" : "Wiederholung …"}
          </button>
          {s && (
            <button
              className="btn"
              disabled={ro}
              onClick={() => void act({ type: "removeRecurrence", revision: s.revisionKey }, "Wiederholung entfernt")}
            >
              Wiederholung entfernen
            </button>
          )}
        </div>
      </div>
      {s && (
        <div className="diag" data-testid="series-panel">
          {s.instance && (
            <div>
              Aktuelles Vorkommen: <b>{describeOccurrence(s.instance)}</b>
              {s.phase === "clarify" && s.proposal && <> – Vorschlag: {describeOccurrence(s.proposal)}</>}
            </div>
          )}
          <div className="actions" style={{ padding: "6px 0 0" }}>
            {seriesActive && (
              <>
                <button className="btn primary" disabled={ro} onClick={() => void act({ type: "completeOccurrence", revision: s.revisionKey, instance: K }, "Vorkommen erledigt")} data-testid="series-complete">
                  Vorkommen erledigen
                </button>
                <button className="btn" disabled={ro} onClick={() => void act({ type: "skipOccurrence", revision: s.revisionKey, instance: K }, "Übersprungen")} data-testid="series-skip">
                  {T.actions.skip}
                </button>
                <button className="btn" disabled={ro} onClick={() => void act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: true }, "Serie beendet")}>
                  Erledigen und Serie beenden
                </button>
                <button className="btn" disabled={ro} onClick={() => void act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: false }, "Serie beendet")}>
                  Serie ohne Erledigung beenden
                </button>
              </>
            )}
            {s.phase === "ended" && (
              <button className="btn" disabled={ro} onClick={() => void act({ type: "reopenSeries", revision: s.revisionKey }, "Serie wiederöffnet")}>
                Serie wiederöffnen
              </button>
            )}
          </div>
        </div>
      )}
      {!s && (
        <div className="actions">
          <button className="btn" disabled={ro} onClick={() => void act(f.status === "done" ? { type: "reopen" } : { type: "complete" }, f.status === "done" ? "Wiederöffnet" : "Erledigt")}>
            {f.status === "done" ? T.actions.reopen : T.actions.complete}
          </button>
          <button className="btn" disabled={ro} onClick={() => void repo.renameToTitle(ref).then((o) => onOutcome(o, "Umbenannt"))}>
            {T.actions.renameToTitle}
          </button>
          <button className="btn danger" disabled={ro} onClick={() => void repo.moveToTrash(ref).then((o) => onOutcome(o, "Gelöscht"))} data-testid="delete">
            {T.actions.delete}
          </button>
        </div>
      )}
      {s && (
        <div className="actions">
          <button className="btn" disabled={ro} onClick={() => void repo.renameToTitle(ref).then((o) => onOutcome(o, "Umbenannt"))}>
            {T.actions.renameToTitle}
          </button>
          <button className="btn danger" disabled={ro} onClick={() => void repo.moveToTrash(ref).then((o) => onOutcome(o, "Gelöscht"))}>
            {T.actions.delete}
          </button>
        </div>
      )}
      {history && history.some((h) => h.done.length || h.skipped.length) && (
        <details className="history" data-testid="history">
          <summary>Historie</summary>
          {history.map((h, i) => (
            <div key={i}>
              <div>{h.label}</div>
              <ul>
                {h.done.map((d) => (
                  <li key={`c${d}`}>Vorkommen {parseKey(d) ? describeOccurrence(parseKey(d)!) : d} – erledigt</li>
                ))}
                {h.skipped.map((d) => (
                  <li key={`s${d}`}>Vorkommen {parseKey(d) ? describeOccurrence(parseKey(d)!) : d} – übersprungen</li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
      <div className="editor-tabs">
        <button className={`btn${tab === "edit" ? " primary" : ""}`} onClick={() => setTab("edit")}>
          Bearbeiten
        </button>
        <button
          className={`btn${tab === "preview" ? " primary" : ""}`}
          onClick={() => {
            void flush();
            setTab("preview");
          }}
          data-testid="tab-preview"
        >
          Vorschau
        </button>
        <span className={`state ${save}`} data-testid="save-state">
          {save === "pending" && T.save.pending}
          {save === "draft" && T.save.draft}
          {save === "saved" && T.save.saved}
          {save === "failed" && T.save.failed}
          {save === "conflict" && T.save.conflict}
        </span>
      </div>
      {save === "conflict" && (
        <div className="diag warn" data-testid="draft-conflict">
          Die Datei wurde extern geändert, während du geschrieben hast. Dein Entwurf ist lokal gesichert.
          <div className="actions" style={{ padding: "6px 0 0" }}>
            {(["mine", "file", "both"] as const).map((ch) => (
              <button
                key={ch}
                className="btn"
                data-testid={`resolve-${ch}`}
                onClick={() =>
                  void repo.resolveDraftConflict(ref, ch).then((o) => {
                    onOutcome(o, "Konflikt gelöst");
                    setSave(o.status === "ok" || o.status === "noop" ? "saved" : o.status === "conflict" ? "conflict" : "failed");
                  })
                }
              >
                {{ mine: "Meine Version", file: "Datei-Version", both: "Beide behalten" }[ch]}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === "edit" ? (
        <MarkdownEditor value={body} docKey={ref} readOnly={ro} onChange={onBodyChange} onBlur={() => void flush()} />
      ) : (
        <div className="preview" data-testid="preview" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {editRule && (
        <RecurrenceEditor
          series={s}
          today={today}
          defaultField={f.due ? "due" : f.scheduled ? "scheduled" : "due"}
          onCancel={() => setEditRule(false)}
          onSave={(spec, opts) => {
            setEditRule(false);
            void act(
              s
                ? { type: "changeRule", revision: s.revisionKey, spec, restartCount: opts.restartCount, resetChecklists: opts.resetChecklists }
                : { type: "createSeries", spec },
              s ? "Regel geändert" : "Wiederholung angelegt",
            );
          }}
        />
      )}
    </div>
  );
}
