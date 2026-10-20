// Detailansicht (4.4): Formularfelder, Serienbereich, Markdown-Editor und Vorschau.
import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import { previewAction, renderMarkdown, T, type Outcome, type Repository } from "@markdoist/app";
import {
  describeOccurrence,
  describeRule,
  parseKey,
  Temporal,
  upcomingForExceptions,
  type Priority,
  type Status,
  type TaskAction,
  type TaskView,
} from "@markdoist/core";
import { MarkdownEditor } from "./MarkdownEditor";
import { RecurrenceEditor } from "./RecurrenceEditor";
import { Menu, MenuItem } from "./Menu";
import {
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconDescription,
  IconDone,
  IconDots,
  IconFlag,
  IconFolder,
  IconHistory,
  IconInbox,
  IconPencil,
  IconRepeat,
  IconStatus,
  IconTime,
  IconTrash,
} from "./Icons";
import { dateLabel, splitDateValue } from "../format";
import { clock } from "../repo";

type SaveState = "idle" | "pending" | "draft" | "saved" | "failed" | "conflict";

interface Props {
  repo: Repository;
  view: TaskView;
  today: Temporal.PlainDate;
  draftText: string | null;
  /** Entwurf mit bereits festgestelltem Textkonflikt (7.3) */
  draftConflict?: boolean;
  focusField: { field: "due" | "scheduled" | "priority" | "title" | "note"; nonce: number } | null;
  onOutcome(o: Outcome, label?: string): void;
  onClose(): void;
  /** Erledigen/Wiederöffnen einer Aufgabe ohne Serie */
  onToggle(): void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function Detail({ repo, view, today, draftText, draftConflict, focusField, onOutcome, onClose, onToggle, onPrev, onNext }: Props) {
  const t = view.task;
  const f = t.fields;
  const ref = t.ref;
  const ro = view.readOnly;
  const s = view.series;
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [title, setTitle] = useState(f.title);
  const [save, setSave] = useState<SaveState>(draftConflict ? "conflict" : draftText !== null ? "draft" : "idle");
  const [editRule, setEditRule] = useState<false | "edit" | "continue">(false);
  const [extraException, setExtraException] = useState("");
  const [menu, setMenu] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);
  const schRef = useRef<HTMLInputElement>(null);
  const prioRef = useRef<HTMLSelectElement>(null);

  useEffect(() => setTitle(f.title), [f.title, ref]);
  useEffect(() => {
    if (!focusField) {
      // Tastaturkürzel wirken im Dialog weiter, solange kein Eingabefeld den Fokus hat.
      if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
      return;
    }
    if (focusField.field === "note") {
      dialogRef.current?.querySelector<HTMLElement>(".cm-content")?.focus();
      return;
    }
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
    // Während des Schreibens weitergetippt: Der jüngere Text ist erst Entwurf, nicht gespeichert (R1).
    if (o.status === "ok" || o.status === "noop") setSave((x) => (pending.current ? x : "saved"));
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
    const { date, time } = splitDateValue(raw, clock().timeZone);
    const invalid = raw !== undefined && raw !== null && raw !== "" && !f[field];
    const tone = field === "due" && view.overdue ? " overdue" : date === today.toString() ? " today" : "";
    return (
      <div className={`side-value dateedit${date ? "" : " unset"}${tone}`}>
        {field === "due" ? <IconCalendar size={16} /> : <IconTime size={16} />}
        <span className="date-pick">
          <span className="date-text" aria-hidden="true">
            {date ? dateLabel({ kind: "date", date: Temporal.PlainDate.from(date), raw: date }, today, clock().timeZone).text : "Kein Datum"}
          </span>
          <input
            ref={field === "due" ? dueRef : schRef}
            type="date"
            value={date}
            disabled={ro}
            onChange={(e) => setDate(field, e.target.value, time)}
            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
            data-testid={`field-${field}`}
            aria-label={T.fields[field]}
          />
        </span>
        {date && (
          <button className="icon-btn small" disabled={ro} onClick={() => setDate(field, "", "")} aria-label={`${T.fields[field]} entfernen`} title={`${T.fields[field]} entfernen`}>
            <IconClose size={16} />
          </button>
        )}
        {date &&
          (time ? (
            <input type="time" value={time} disabled={ro} onChange={(e) => setDate(field, date, e.target.value)} aria-label="Uhrzeit" />
          ) : (
            <button className="link-btn" disabled={ro} onClick={() => setDate(field, date, "09:00")}>
              Uhrzeit hinzufügen
            </button>
          ))}
        {invalid && <span className="badge warn">ungültig: {String(raw)}</span>}
      </div>
    );
  };

  const K = s?.instance?.toString() ?? "";
  const seriesActive = s && s.phase === "active";
  // Vorschau vor dem Abschluss (5.2, 5.4): was Erledigen bzw. Wiederöffnen tatsächlich bewirkt.
  const completePreview = useMemo(
    () => (s && s.phase === "active" ? previewAction(t, { type: "completeOccurrence", revision: s.revisionKey, instance: K }, clock()).lines : []),
    [t, s, K, today],
  );
  const reopenPreview = useMemo(
    () => (s && s.phase === "ended" ? previewAction(t, { type: "reopenSeries", revision: s.revisionKey }, clock()) : null),
    [t, s, today],
  );
  const futureExceptions = s ? [...s.S].filter((d) => s.instance && d > s.instance.toString()).sort() : [];
  const upcoming = s ? upcomingForExceptions(s) : [];
  const extraSkipped = futureExceptions.filter((d) => !upcoming.some((u) => u.date.toString() === d));

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

  const checkDisabled = ro || (!!s && !seriesActive);
  const onCheck = () => {
    if (s) {
      if (seriesActive) void act({ type: "completeOccurrence", revision: s.revisionKey, instance: K }, "Vorkommen erledigt");
    } else onToggle();
  };
  const folderName = repo.folder.split("/").filter(Boolean).pop() ?? repo.folder;

  return (
    <div
      className="modal-back detail-back"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className="detail" role="dialog" aria-modal="true" data-detail aria-label={f.title || T.fields.title} data-testid="detail" tabIndex={-1}>
        <header className="detail-head">
          <div className="crumb">
            {f.inbox ? <IconInbox size={16} /> : <IconFolder size={16} />}
            <span>{f.inbox ? T.views.inbox : folderName}</span>
          </div>
          <div className="detail-tools">
            <button className="icon-btn" onClick={onPrev} disabled={!onPrev} title="Vorherige Aufgabe (↑)" aria-label="Vorherige Aufgabe">
              <IconChevronUp size={24} />
            </button>
            <button className="icon-btn" onClick={onNext} disabled={!onNext} title="Nächste Aufgabe (↓)" aria-label="Nächste Aufgabe">
              <IconChevronDown size={24} />
            </button>
            <span className="menu-anchor">
              <button className="icon-btn" onClick={() => setMenu((m) => !m)} data-menu-anchor title="Weitere Aktionen" aria-label="Weitere Aktionen" data-testid="detail-more">
                <IconDots size={24} />
              </button>
              {menu && (
                <Menu label="Aufgabenaktionen" onClose={() => setMenu(false)}>
                  {!s && (
                    <MenuItem icon={<IconDone size={20} />} disabled={ro} onClick={() => (setMenu(false), onToggle())}>
                      {f.status === "done" ? T.actions.reopen : T.actions.complete}
                    </MenuItem>
                  )}
                  <MenuItem icon={<IconPencil size={20} />} disabled={ro} onClick={() => (setMenu(false), void repo.renameToTitle(ref).then((o) => onOutcome(o, "Umbenannt")))}>
                    {T.actions.renameToTitle}
                  </MenuItem>
                  <div className="menu-sep" />
                  <MenuItem icon={<IconTrash size={20} />} danger disabled={ro} testId="delete" onClick={() => (setMenu(false), void repo.moveToTrash(ref).then((o) => onOutcome(o, "Gelöscht")))}>
                    {T.actions.delete}
                  </MenuItem>
                </Menu>
              )}
            </span>
            <button className="icon-btn" onClick={onClose} title="Schließen (Escape)" aria-label="Schließen">
              <IconClose size={24} />
            </button>
          </div>
        </header>
        <div className="detail-body">
          <div className="detail-main">
            <div className="detail-title">
              <button
                className={`check big prio-${f.priority}${f.status === "done" ? " checked" : ""}`}
                role="checkbox"
                aria-checked={f.status === "done"}
                aria-label={s ? "Vorkommen erledigen" : f.status === "done" ? T.actions.reopen : T.actions.complete}
                disabled={checkDisabled}
                onClick={onCheck}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7.5 12.3l3 3 6-6.3" />
                </svg>
              </button>
              <input
                ref={titleRef}
                className={`titleinput${f.status === "done" ? " done" : ""}`}
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
            {view.diagnostics.map((d, i) => (
              <div key={i} className={`diag ${d.severity === "error" ? "error" : d.severity === "info" ? "info" : "warn"}`}>
                {d.message}
              </div>
            ))}
            <div className="desc-head">
              <IconDescription size={16} />
              <span className="desc-label">Beschreibung</span>
              <div className="seg" role="tablist" aria-label="Notiz">
                <button role="tab" aria-selected={tab === "edit"} className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}>
                  Bearbeiten
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "preview"}
                  className={tab === "preview" ? "on" : ""}
                  onClick={() => {
                    void flush();
                    setTab("preview");
                  }}
                  data-testid="tab-preview"
                >
                  Vorschau
                </button>
              </div>
              <span className={`state ${save}`} data-testid="save-state">
                {save === "pending" && T.save.pending}
                {save === "draft" && T.save.draft}
                {save === "saved" && T.save.saved}
                {save === "failed" && T.save.failed}
                {save === "conflict" && T.save.conflict}
              </span>
            </div>
            {save === "failed" && (
              <div className="diag error" data-testid="save-failed">
                Speichern fehlgeschlagen. Dein Entwurf ist lokal gesichert.
                <div className="actions">
                  <button
                    className="btn"
                    data-testid="retry-save"
                    onClick={() =>
                      void repo.retryDraft(ref).then((o) => {
                        onOutcome(o, "Notiz");
                        setSave(o.status === "ok" || o.status === "noop" ? "saved" : o.status === "conflict" ? "conflict" : "failed");
                      })
                    }
                  >
                    Erneut speichern
                  </button>
                  <button className="btn" data-testid="save-as-new" onClick={() => void repo.saveDraftAsNew(ref).then((o) => onOutcome(o, "Als neue Datei gespeichert"))}>
                    Als neue Datei speichern
                  </button>
                </div>
              </div>
            )}
            {save === "conflict" && (
              <div className="diag warn" data-testid="draft-conflict">
                Die Datei wurde extern geändert, während du geschrieben hast. Dein Entwurf ist lokal gesichert.
                {/* Datei-Version und eigener Entwurf bleiben sichtbar (7.3) */}
                <details>
                  <summary>Unterschied Datei-Version → mein Entwurf</summary>
                  <div className="diff" data-testid="draft-conflict-diff">
                    {diffLines(t.body, body).map((p, i) => (
                      <span key={i} className={p.added ? "add" : p.removed ? "del" : ""}>
                        {p.value}
                      </span>
                    ))}
                  </div>
                </details>
                <div className="actions">
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
            {s && (
              <div className="series" data-testid="series-panel">
                <div className="series-head">
                  <IconRepeat size={16} />
                  <span>Serie</span>
                  {s.instance && (
                    <span className="series-instance">
                      Aktuelles Vorkommen: <b>{describeOccurrence(s.instance)}</b>
                      {s.phase === "clarify" && s.proposal && <> – Vorschlag: {describeOccurrence(s.proposal)}</>}
                    </span>
                  )}
                </div>
                <div className="actions">
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
                  {s.phase === "ended" && reopenPreview?.preview.result === "change" && (
                    <button className="btn" disabled={ro} onClick={() => void act({ type: "reopenSeries", revision: s.revisionKey }, "Serie wiederöffnet")} data-testid="series-reopen">
                      Serie wiederöffnen
                    </button>
                  )}
                  {s.phase === "ended" && reopenPreview?.preview.result === "blocked" && (
                    <button className="btn" disabled={ro} onClick={() => setEditRule("continue")} data-testid="series-continue">
                      Serie mit neuer Regel fortsetzen
                    </button>
                  )}
                </div>
                {seriesActive && completePreview.length > 0 && (
                  <ul className="preview-lines" data-testid="complete-preview" aria-label="Beim Erledigen">
                    <li className="preview-head">Beim Erledigen:</li>
                    {completePreview.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
                {reopenPreview && (
                  <ul className="preview-lines" data-testid="reopen-preview" aria-label="Beim Wiederöffnen">
                    <li className="preview-head">Beim Wiederöffnen:</li>
                    {reopenPreview.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
                {seriesActive && s.anchor === "calendar" && (
                  <details className="exceptions" data-testid="exceptions">
                    <summary>Ausnahmen (künftige Termine überspringen)</summary>
                    {upcoming.map((u) => (
                      <label key={u.date.toString()} className="exception">
                        <input
                          type="checkbox"
                          checked={u.skipped}
                          disabled={ro}
                          data-testid={`exception-${u.date}`}
                          onChange={(e) =>
                            void act(
                              { type: "setException", revision: s.revisionKey, date: u.date.toString(), skipped: e.target.checked },
                              e.target.checked ? "Termin wird übersprungen" : "Ausnahme entfernt",
                            )
                          }
                        />{" "}
                        {describeOccurrence(u.date)} überspringen
                      </label>
                    ))}
                    {extraSkipped.map((d) => (
                      <label key={d} className="exception">
                        <input
                          type="checkbox"
                          checked
                          disabled={ro}
                          data-testid={`exception-${d}`}
                          onChange={() => void act({ type: "setException", revision: s.revisionKey, date: d, skipped: false }, "Ausnahme entfernt")}
                        />{" "}
                        {parseKey(d) ? describeOccurrence(parseKey(d)!) : d} überspringen
                      </label>
                    ))}
                    <div className="dateedit">
                      <input type="date" value={extraException} disabled={ro} onChange={(e) => setExtraException(e.target.value)} aria-label="Weiteren Termin überspringen" data-testid="exception-date" />
                      <button
                        className="btn"
                        disabled={ro || !extraException}
                        onClick={() =>
                          void act({ type: "setException", revision: s.revisionKey, date: extraException, skipped: true }, "Termin wird übersprungen").then(
                            (o) => o.status === "ok" && setExtraException(""),
                          )
                        }
                        data-testid="exception-add"
                      >
                        Diesen Termin überspringen
                      </button>
                    </div>
                  </details>
                )}
              </div>
            )}
            {history && history.some((h) => h.done.length || h.skipped.length) && (
              <details className="history" data-testid="history">
                <summary>
                  <IconHistory size={16} /> Historie
                </summary>
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
          </div>
          <aside className="detail-side" aria-label="Eigenschaften">
            <div className="side-field">
              <div className="side-label">{T.fields.inbox}</div>
              <label className="side-value toggle">
                <IconInbox size={16} />
                <span>{f.inbox ? "Im Eingang" : "Einsortiert"}</span>
                <input
                  type="checkbox"
                  checked={f.inbox}
                  disabled={ro}
                  onChange={(e) => void act({ type: "setInbox", inbox: e.target.checked }, e.target.checked ? "Zurück in den Eingang" : "Einsortiert")}
                  data-testid="field-inbox"
                  aria-label="im Eingang"
                />
              </label>
            </div>
            <div className="side-field">
              <div className="side-label">{T.fields.status}</div>
              <div className="side-value">
                <IconStatus size={16} />
                <select
                  value={f.status}
                  disabled={ro}
                  onChange={(e) => void act({ type: "setStatus", status: e.target.value as Status }, "Status geändert")}
                  data-testid="field-status"
                  aria-label={T.fields.status}
                >
                  {/* Bei Serien kein „Erledigt“: Erledigen und Beenden nur über die Serienknöpfe (Entscheidung 18.10.2026). */}
                  {(["open", "in-progress", "done"] as Status[]).filter((x) => !(s && x === "done" && f.status !== "done")).map((x) => (
                    <option key={x} value={x} disabled={!!s && x === "done"}>
                      {T.status[x]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="side-field">
              <div className="side-label">{T.fields.due}</div>
              {dateEditor("due")}
            </div>
            <div className="side-field">
              <div className="side-label">{T.fields.scheduled}</div>
              {dateEditor("scheduled")}
            </div>
            <div className="side-field">
              <div className="side-label">{T.fields.priority}</div>
              <div className={`side-value prio-${f.priority}`}>
                <IconFlag size={16} filled={f.priority !== "none"} />
                <select
                  ref={prioRef}
                  value={f.priority}
                  disabled={ro}
                  onChange={(e) => void act({ type: "setPriority", priority: e.target.value as Priority }, "Priorität geändert")}
                  data-testid="field-priority"
                  aria-label={T.fields.priority}
                >
                  {(["none", "low", "normal", "high"] as Priority[]).map((x) => (
                    <option key={x} value={x}>
                      {T.priority[x]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="side-field">
              <div className="side-label">Wiederholung</div>
              <div className="side-value column">
                <span className="side-text" data-testid="series-desc">
                  <IconRepeat size={16} />
                  {s ? (s.rule ? describeRule(s.rule, s.anchor) ?? s.raw : s.raw) : "keine"}
                </span>
                <div className="side-links">
                  <button className="link-btn" disabled={ro} onClick={() => setEditRule("edit")} data-testid="edit-recurrence">
                    {s ? "Regel bearbeiten" : "Wiederholung …"}
                  </button>
                  {s && (
                    <button className="link-btn" disabled={ro} onClick={() => void act({ type: "removeRecurrence", revision: s.revisionKey }, "Wiederholung entfernt")}>
                      Entfernen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
        {editRule && (
          <RecurrenceEditor
            task={t}
            series={s}
            continueSeries={editRule === "continue"}
            today={today}
            defaultField={f.due ? "due" : f.scheduled ? "scheduled" : "due"}
            onCancel={() => setEditRule(false)}
            onSave={(action) => {
              setEditRule(false);
              void act(action, s ? "Regel geändert" : "Wiederholung angelegt");
            }}
          />
        )}
      </div>
    </div>
  );

}
