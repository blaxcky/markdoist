// Detailansicht (4.4): links Titel, Serienkarte und Notiz, rechts die Eigenschaften.
// Serienkarte wie auf Android (Vorkommen-Streifen, „Danach“, Überspringen), aber für Maus und Tastatur:
// Tooltips statt Erklärtexten, seltene Serienaktionen im Aufklappmenü, Verlauf klappt in der Karte auf.
import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import {
  pastSkippedCount,
  previewAction,
  renderMarkdown,
  seriesHistory,
  seriesStrip,
  skippedBeyondStrip,
  stripByMonth,
  T,
  type Outcome,
  type Repository,
  type StripCell,
} from "@markdoist/app";
import {
  describeOccurrence,
  describeRule,
  formatGermanDate,
  parseKey,
  Temporal,
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
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconDescription,
  IconDone,
  IconDots,
  IconFlag,
  IconFolder,
  IconInbox,
  IconList,
  IconPencil,
  IconRepeat,
  IconSkip,
  IconStatus,
  IconStop,
  IconTime,
  IconTrash,
} from "./Icons";
import { dateLabel, splitDateValue } from "../format";
import { clock } from "../repo";

type SaveState = "idle" | "pending" | "draft" | "saved" | "failed" | "conflict";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

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

/** Ein Vorkommen im Streifen; künftige sind Umschalter fürs Überspringen (Tooltip nennt Datum und Wirkung). */
function StripDay({ cell, label, ro, onToggle }: { cell: StripCell; label: string; ro: boolean; onToggle?(): void }) {
  const occ = describeOccurrence(cell.date);
  const skipped = cell.kind === "skipped" || cell.kind === "future-skipped";
  const content = (
    <>
      <span className="strip-label">{label}</span>
      <span className="strip-dot">{cell.kind === "done" ? <IconCheck size={16} /> : cell.date.day}</span>
    </>
  );
  if (onToggle) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={skipped}
        aria-label={`${occ} überspringen`}
        title={skipped ? `${occ} wird übersprungen – klicken zum Zurücknehmen` : `${occ} – klicken zum Überspringen`}
        className={`strip-day ${cell.kind}`}
        disabled={ro}
        onClick={onToggle}
        data-testid={`exception-${cell.date}`}
      >
        {content}
      </button>
    );
  }
  const state = { done: "erledigt", skipped: "übersprungen", current: "aktuelles Vorkommen", future: "", "future-skipped": "" }[cell.kind];
  return (
    <div className={`strip-day ${cell.kind}`} title={`${occ}: ${state}`} aria-label={`${occ}: ${state}`} role="img" data-testid={cell.kind === "current" ? "series-current" : undefined}>
      {content}
    </div>
  );
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
  const [menu, setMenu] = useState<false | "task" | "series">(false);
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

  // Datum als Text („Heute“, „Mi 14. Okt“) über dem unsichtbaren nativen Feld; Uhrzeit und Entfernen erscheinen beim Überfahren.
  const dateEditor = (field: "due" | "scheduled") => {
    const raw = t.data[field];
    const { date, time } = splitDateValue(raw, clock().timeZone);
    const invalid = raw !== undefined && raw !== null && raw !== "" && !f[field];
    const tone = field === "due" && view.overdue ? " overdue" : date === today.toString() ? " today" : "";
    return (
      <div className={`side-value dateedit${date ? "" : " unset"}${tone}`}>
        {field === "due" ? <IconCalendar size={16} /> : <IconTime size={16} />}
        <span className="date-pick" title={date ? formatGermanDate(Temporal.PlainDate.from(date)) : undefined}>
          <span className="date-text" aria-hidden="true">
            {date ? dateLabel({ kind: "date", date: Temporal.PlainDate.from(date), raw: date }, today, clock().timeZone).text : "Hinzufügen"}
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
        {date && time && <input type="time" value={time} disabled={ro} onChange={(e) => setDate(field, date, e.target.value)} aria-label="Uhrzeit" />}
        <span className="hover-tools">
          {date && !time && (
            <button className="icon-btn small" disabled={ro} onClick={() => setDate(field, date, "09:00")} aria-label="Zeit hinzufügen" title="Uhrzeit hinzufügen">
              <IconTime size={16} />
            </button>
          )}
          {date && (
            <button className="icon-btn small" disabled={ro} onClick={() => setDate(field, "", "")} aria-label={`${T.fields[field]} entfernen`} title={`${T.fields[field]} entfernen`}>
              <IconClose size={16} />
            </button>
          )}
        </span>
        {invalid && <span className="badge warn">ungültig: {String(raw)}</span>}
      </div>
    );
  };

  const K = s?.instance?.toString() ?? "";
  const seriesActive = s && s.phase === "active";
  // Vorschau vor dem Abschluss (5.2, 5.4): was Erledigen bzw. Wiederöffnen tatsächlich bewirkt.
  const complete = useMemo(
    () => (s && s.phase === "active" ? previewAction(t, { type: "completeOccurrence", revision: s.revisionKey, instance: K }, clock()) : null),
    [t, s, K, today],
  );
  const reopenPreview = useMemo(
    () => (s && s.phase === "ended" ? previewAction(t, { type: "reopenSeries", revision: s.revisionKey }, clock()) : null),
    [t, s, today],
  );
  const strip = useMemo(() => (s ? seriesStrip(s) : []), [s]);
  const extraSkipped = s ? skippedBeyondStrip(s, strip) : [];
  const byMonth = stripByMonth(strip);
  const history = useMemo(() => (s ? seriesHistory(s) : null), [s]);
  const preview = complete?.preview ?? null;
  const nextDate = preview?.result === "change" && !preview.ended ? preview.instance : null;
  // Hinweise der Vorschau ohne das, was „Nächstes Vorkommen“ und die Terminfelder schon zeigen.
  const hidden = [`${T.preview.nextOccurrence}:`, `${T.preview.firstOccurrence}:`, `${T.fields.due}:`, `${T.fields.scheduled}:`];
  const notes = (complete?.lines ?? []).filter((l) => l !== T.preview.ends && !hidden.some((h) => l.startsWith(h)));
  const occ = s?.instance ? describeOccurrence(s.instance) : "";
  const ruleText = s ? (s.rule ? (describeRule(s.rule, s.anchor) ?? s.raw) : s.raw) : "";
  const phaseNote = !s ? "" : s.phase === "ended" ? "beendet" : s.phase === "clarify" ? "Fortschreibung klären" : s.phase === "active" ? "" : "gesperrt";
  const toggleException = (d: string, skipped: boolean) =>
    s && void act({ type: "setException", revision: s.revisionKey, date: d, skipped: !skipped }, skipped ? "Ausnahme entfernt" : "Termin wird übersprungen");

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

  // Frühere Abschnitte (Regeländerung, entfernte Wiederholung) als Zusammenfassung.
  const archive = useMemo(() => {
    const arch = t.data.recurrence_archive;
    if (!Array.isArray(arch)) return [];
    return arch
      .filter((a) => !!a && typeof a === "object" && !Array.isArray(a))
      .map((a) => {
        const snap = a as Record<string, unknown>;
        const list = (k: string) => (Array.isArray(snap[k]) ? [...new Set((snap[k] as unknown[]).map(String))].sort() : []);
        const done = list("complete_instances");
        const skipped = list("skipped_instances");
        const all = [...done, ...skipped].sort();
        return { rule: String(snap.recurrence ?? "?"), removed: snap.closed_reason === "removed", done: done.length, skipped: skipped.length, from: parseKey(all[0] ?? ""), to: parseKey(all[all.length - 1] ?? "") };
      })
      .reverse();
  }, [t.data.recurrence_archive]);
  const archiveList =
    archive.length > 0 ? (
      <div className="history-archive">
        <div className="history-archive-head">Frühere Abschnitte</div>
        {archive.map((a, i) => (
          <div key={i} className="history-archive-row">
            <span>{a.rule}</span>
            <span className="muted">
              {a.removed ? "entfernt" : "Regel geändert"}
              {a.from && a.to ? ` · ${describeOccurrence(a.from)} – ${describeOccurrence(a.to)}` : ""} · {a.done} erledigt, {a.skipped} übersprungen
            </span>
          </div>
        ))}
      </div>
    ) : null;

  const checkDisabled = ro || (!!s && !seriesActive);
  const onCheck = () => {
    if (s) {
      if (seriesActive) void act({ type: "completeOccurrence", revision: s.revisionKey, instance: K }, "Vorkommen erledigt");
    } else onToggle();
  };
  const checkLabel = s ? `Vorkommen ${occ} erledigen` : f.status === "done" ? T.actions.reopen : T.actions.complete;
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
            {f.isList ? <IconList size={16} /> : f.inbox ? <IconInbox size={16} /> : <IconFolder size={16} />}
            <span>{f.isList ? T.views.lists : f.inbox ? T.views.inbox : folderName}</span>
          </div>
          <div className="detail-tools">
            <button className="icon-btn" onClick={onPrev} disabled={!onPrev} title="Vorherige Aufgabe (↑)" aria-label="Vorherige Aufgabe">
              <IconChevronUp size={24} />
            </button>
            <button className="icon-btn" onClick={onNext} disabled={!onNext} title="Nächste Aufgabe (↓)" aria-label="Nächste Aufgabe">
              <IconChevronDown size={24} />
            </button>
            <span className="menu-anchor">
              <button className="icon-btn" onClick={() => setMenu((m) => (m === "task" ? false : "task"))} data-menu-anchor title="Weitere Aktionen" aria-label="Weitere Aktionen" data-testid="detail-more">
                <IconDots size={24} />
              </button>
              {menu === "task" && (
                <Menu label="Aufgabenaktionen" onClose={() => setMenu(false)}>
                  {!s && !f.isList && (
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
              {!f.isList && (
              <button
                className={`check big prio-${f.priority}${f.status === "done" ? " checked" : ""}`}
                role="checkbox"
                aria-checked={f.status === "done"}
                aria-label={checkLabel}
                title={`${checkLabel} (Leertaste)`}
                disabled={checkDisabled}
                onClick={onCheck}
                data-testid={seriesActive ? "series-complete" : undefined}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7.5 12.3l3 3 6-6.3" />
                </svg>
              </button>
              )}
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

            {s && (
              <section className="series-card" data-testid="series-panel" aria-label="Serie">
                <div className="series-card-head">
                  <span className="series-card-title">
                    Serie{phaseNote && <span className="series-phase"> · {phaseNote}</span>}
                  </span>
                  {!ro && (
                    <span className="menu-anchor">
                      <button className="icon-btn" onClick={() => setMenu((m) => (m === "series" ? false : "series"))} data-menu-anchor title="Serien-Aktionen" aria-label="Serien-Aktionen" data-testid="series-menu">
                        <IconDots size={20} />
                      </button>
                      {menu === "series" && (
                        <Menu label="Serien-Aktionen" className="series-menu" onClose={() => setMenu(false)}>
                          <div className="menu-info">
                            <IconRepeat size={18} />
                            <div>
                              <div className="menu-info-title">{ruleText}</div>
                              {occ && <div className="menu-info-sub">{s.phase === "ended" ? "zuletzt" : "aktuell"} {occ}</div>}
                            </div>
                          </div>
                          <div className="menu-sep" />
                          <MenuItem icon={<IconPencil size={20} />} testId="series-edit" onClick={() => (setMenu(false), setEditRule("edit"))}>
                            Regel bearbeiten …
                          </MenuItem>
                          {seriesActive && s.anchor === "calendar" && (
                            <div className="menu-form">
                              <span className="menu-icon">
                                <IconSkip size={20} />
                              </span>
                              <label className="menu-form-body">
                                <span>Termin überspringen</span>
                                <span className="menu-form-row">
                                  <input type="date" value={extraException} onChange={(e) => setExtraException(e.target.value)} aria-label="Weiteren Termin überspringen" data-testid="exception-date" />
                                  <button
                                    className="btn"
                                    disabled={!extraException}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      void act({ type: "setException", revision: s.revisionKey, date: extraException, skipped: true }, "Termin wird übersprungen").then((o) => {
                                        if (o.status === "ok") {
                                          setExtraException("");
                                          setMenu(false);
                                        }
                                      });
                                    }}
                                    data-testid="exception-add"
                                  >
                                    Überspringen
                                  </button>
                                </span>
                              </label>
                            </div>
                          )}
                          {seriesActive && (
                            <>
                              <div className="menu-sep" />
                              <MenuItem
                                icon={<IconDone size={20} />}
                                sub={`${occ} zählt als erledigt, danach keine Termine mehr.`}
                                testId="series-end-complete"
                                onClick={() => (setMenu(false), void act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: true }, "Serie beendet"))}
                              >
                                Erledigen und Serie beenden
                              </MenuItem>
                              <MenuItem
                                icon={<IconStop size={20} />}
                                sub={`Ohne ${occ} zu erledigen. Die Aufgabe wird abgeschlossen.`}
                                testId="series-end"
                                onClick={() => (setMenu(false), void act({ type: "endSeries", revision: s.revisionKey, instance: K, completeCurrent: false }, "Serie beendet"))}
                              >
                                Serie beenden
                              </MenuItem>
                            </>
                          )}
                          <div className="menu-sep" />
                          <MenuItem
                            icon={<IconRepeat size={20} />}
                            danger
                            sub="Die Aufgabe bleibt als einmalige Aufgabe. Der Verlauf wird archiviert."
                            testId="series-remove"
                            onClick={() => (setMenu(false), void act({ type: "removeRecurrence", revision: s.revisionKey }, "Wiederholung entfernt"))}
                          >
                            Wiederholung entfernen
                          </MenuItem>
                        </Menu>
                      )}
                    </span>
                  )}
                </div>

                {strip.length > 0 && (
                  <div className="strip" data-testid="exceptions">
                    {strip.map((cell) => {
                      const future = cell.kind === "future" || cell.kind === "future-skipped";
                      return (
                        <StripDay
                          key={cell.date.toString()}
                          cell={cell}
                          ro={ro}
                          label={byMonth ? MONTHS_SHORT[cell.date.month - 1]! : WD_SHORT[cell.date.dayOfWeek - 1]!}
                          onToggle={future ? () => toggleException(cell.date.toString(), cell.kind === "future-skipped") : undefined}
                        />
                      );
                    })}
                  </div>
                )}
                {extraSkipped.length > 0 && (
                  <div className="strip-extra">
                    <span>Später übersprungen:</span>
                    {extraSkipped.map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="checkbox"
                        aria-checked
                        className="strip-chip"
                        disabled={ro}
                        title="Klicken zum Zurücknehmen"
                        onClick={() => toggleException(d, true)}
                        data-testid={`exception-${d}`}
                      >
                        {parseKey(d) ? describeOccurrence(parseKey(d)!) : d}
                      </button>
                    ))}
                  </div>
                )}
                {s.phase === "clarify" && s.proposal && <div className="series-note warn">Vorschlag für das nächste Vorkommen: {describeOccurrence(s.proposal)}</div>}

                {seriesActive && (
                  <div className="series-next">
                    <div className="series-next-text" data-testid="complete-preview">
                      {nextDate ? (
                        <div>
                          <span className="muted">{T.preview.nextOccurrence}:</span> <strong>{formatGermanDate(nextDate)}</strong>
                        </div>
                      ) : preview?.ended ? (
                        <div className="muted">{T.preview.ends}</div>
                      ) : null}
                      {notes.map((l) => (
                        <div key={l} className="series-note">
                          {l}
                        </div>
                      ))}
                    </div>
                    <button className="btn" disabled={ro} onClick={() => void act({ type: "skipOccurrence", revision: s.revisionKey, instance: K }, "Übersprungen")} title={`${occ} überspringen`} data-testid="series-skip">
                      <IconSkip size={16} />
                      {T.actions.skip}
                    </button>
                  </div>
                )}
                {s.phase === "ended" && (
                  <div className="series-next">
                    <div className="series-next-text" data-testid="reopen-preview">
                      {reopenPreview?.lines.map((l) => (
                        <div key={l} className="series-note">
                          {l}
                        </div>
                      ))}
                    </div>
                    {reopenPreview?.preview.result === "change" && (
                      <button className="btn primary" disabled={ro} onClick={() => void act({ type: "reopenSeries", revision: s.revisionKey }, "Serie wiederöffnet")} data-testid="series-reopen">
                        Serie wiederöffnen
                      </button>
                    )}
                    {reopenPreview?.preview.result === "blocked" && (
                      <button className="btn" disabled={ro} onClick={() => setEditRule("continue")} data-testid="series-continue">
                        <IconRepeat size={16} />
                        Mit neuer Regel fortsetzen
                      </button>
                    )}
                  </div>
                )}

                {(s.C.size > 0 || s.S.size > 0 || archive.length > 0) && (
                  <details className="series-history" data-testid="history">
                    <summary>
                      <span className="series-count">
                        <b>{s.C.size}</b> erledigt · <b>{pastSkippedCount(s)}</b> übersprungen
                      </span>
                      <span className="series-history-link">
                        Verlauf <IconChevronDown size={16} />
                      </span>
                    </summary>
                    <div className="history-legend">
                      <span>
                        <i className="lg done" /> erledigt
                      </span>
                      <span>
                        <i className="lg skipped" /> übersprungen
                      </span>
                      {s.phase !== "ended" && s.instance && (
                        <span>
                          <i className="lg current" /> aktuell
                        </span>
                      )}
                    </div>
                    <div className="history-months">
                      {history?.months.map((m) => (
                        <div key={`${m.year}-${m.month}`} className="history-month">
                          <div className="history-month-name">
                            {MONTHS[m.month - 1]} {m.year}
                          </div>
                          <div className="history-grid">
                            {WD_SHORT.map((w) => (
                              <span key={w} className="wd">
                                {w}
                              </span>
                            ))}
                            {m.cells.map((d, i) => {
                              const mk = d ? history.mark(d) : null;
                              return (
                                <span key={i} className={`hd${mk ? ` ${mk}` : ""}`} title={d && mk ? `${describeOccurrence(d)}: ${{ done: "erledigt", skipped: "übersprungen", current: "aktuelles Vorkommen", upcoming: "geplant" }[mk]}` : undefined}>
                                  {d?.day}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {archiveList}
                  </details>
                )}
              </section>
            )}
            {!s && archiveList && (
              <details className="series-history standalone" data-testid="history">
                <summary>
                  <span className="series-count">Frühere Wiederholungen</span>
                  <span className="series-history-link">
                    anzeigen <IconChevronDown size={16} />
                  </span>
                </summary>
                {archiveList}
              </details>
            )}

            <div className="desc-head">
              <IconDescription size={16} />
              <span className="desc-label">Beschreibung</span>
              <span className={`state ${save}`} data-testid="save-state">
                {save === "pending" && T.save.pending}
                {save === "draft" && T.save.draft}
                {save === "saved" && T.save.saved}
                {save === "failed" && T.save.failed}
                {save === "conflict" && T.save.conflict}
              </span>
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
          </div>
          {/* Listen haben keine Termine, Priorität oder Eingang (4.6). */}
          {!f.isList && (
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
                  {/* Bei Serien kein „Erledigt“: Erledigen und Beenden nur über die Serienaktionen (Entscheidung 18.10.2026). */}
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
              <button className={`side-value side-button${s ? "" : " unset"}`} disabled={ro} onClick={() => setEditRule("edit")} title={s ? "Regel bearbeiten" : "Wiederholung festlegen"} data-testid="edit-recurrence">
                <IconRepeat size={16} />
                <span className="side-text" data-testid="series-desc">
                  {s ? ruleText : "Hinzufügen"}
                </span>
                {s && <span className="side-sub">{s.anchor === "calendar" ? "nach Kalender" : "ab Erledigung"}</span>}
              </button>
            </div>
          </aside>
          )}
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
