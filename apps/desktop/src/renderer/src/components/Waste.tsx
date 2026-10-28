// Müllabfuhr (4.7): Übersicht je Abfuhrart, Termine einer Art, ICS-Import und Vorlauf einer Terminliste.
import { useEffect, useMemo, useState } from "react";
import {
  applyWasteImport,
  describeWasteEffect,
  readWasteFile,
  reassignWasteRow,
  T,
  wasteGroupSpan,
  wasteImportMessage,
  wasteRows,
  wasteSeries,
  type Outcome,
  type Repository,
  type WasteFile,
  type WasteRow,
} from "@markdoist/app";
import {
  describeOccurrence,
  describeSeries,
  remainingListDates,
  Temporal,
  wasteView,
  type Index,
  type Series,
  type TaskAction,
  type TaskView,
} from "@markdoist/core";
import { bridge } from "../bridge";
import { useDialog } from "../dialog";
import { clock } from "../repo";
import { Menu, MenuItem } from "./Menu";
import { IconBin, IconChevronDown, IconDots, IconSkip, IconUndo } from "./Icons";

export function WasteOverview({ idx, onOpen, onImport }: { idx: Index; onOpen(ref: string): void; onImport(): void }) {
  const entries = wasteView(idx);
  return (
    <>
      <div className="waste-head">
        <h1 className="page-title">{T.views.waste}</h1>
        <button className="btn" onClick={onImport} data-testid="waste-import">
          {T.waste.import}
        </button>
      </div>
      <div className="page-count">
        <IconBin size={16} />
        {entries.length === 1 ? "1 Abfuhrart" : `${entries.length} Abfuhrarten`}
      </div>
      <div className="list" data-testid="waste-list">
        {entries.map((e) => (
          <div
            key={e.view.task.ref}
            className="row list-row"
            onClick={() => onOpen(e.view.task.ref)}
            role="option"
            aria-selected={false}
            data-testid="waste-row"
            data-title={e.view.task.fields.title}
          >
            <span className="list-icon">
              <IconBin size={20} />
            </span>
            <div className="main">
              <div className="title">{e.view.task.fields.title}</div>
            </div>
            <span className={`waste-next${e.next ? "" : " none"}`}>
              {e.next ? `${describeOccurrence(e.next)} · ${T.waste.remaining(e.remaining)}` : T.waste.noMore}
            </span>
          </div>
        ))}
        {!entries.length && <div className="empty">{T.empty.waste}</div>}
      </div>
    </>
  );
}

/** Kopf einer geöffneten Abfuhrart: zurück zur Übersicht, Titel, Termine und Vorlauf. */
export function WasteHead({ view, onBack, onEditLead }: { view: TaskView; onBack(): void; onEditLead(): void }) {
  const s = view.series;
  const lead = s ? leadDays(s) : null;
  return (
    <div className="list-head">
      <button className="back-btn" onClick={onBack} data-testid="waste-back">
        ‹ {T.views.waste}
      </button>
      <h1 className="page-title">{view.task.fields.title}</h1>
      <div className="page-count">
        <IconBin size={16} />
        <span data-testid="waste-desc">{s ? (describeSeries(s) ?? "") : "Keine Serie"}</span>
        {s?.dates && !view.readOnly && (
          <button className="link-btn" onClick={onEditLead} data-testid="waste-lead">
            {lead === null ? "ohne Vorlauf" : `geplant ${lead} ${lead === 1 ? "Tag" : "Tage"} vorher`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Vorlauf in Tagen (positiv) einer Serie mit Bezugsfeld `due`; null = kein `scheduled`. */
function leadDays(s: Series): number | null {
  return s.offsetDays === null ? null : -s.offsetDays;
}

type DateState = "erledigt" | "übersprungen" | "versäumt";

/** Kommende und vergangene Termine einer Abfuhrart unter dem aktuellen Vorkommen. */
export function WasteDates({ view, today, repo, onOutcome }: { view: TaskView; today: Temporal.PlainDate; repo: Repository; onOutcome(o: Outcome, label?: string): void }) {
  const s = view.series;
  const [menu, setMenu] = useState<string | null>(null);
  if (!s?.dates) return null;
  const k = s.instance;
  const ended = s.phase === "ended";
  const cmp = Temporal.PlainDate.compare;
  const upcoming = ended || !k ? [] : s.dates.filter((d) => cmp(d, k) > 0 && !s.C.has(d.toString()));
  // Vergangen: vor dem aktuellen Vorkommen, bei beendeter Serie bis heute.
  const past = s.dates
    .filter((d) => (ended || !k ? cmp(d, today) <= 0 : cmp(d, k) < 0))
    .map((d): [Temporal.PlainDate, DateState] => [d, s.C.has(d.toString()) ? "erledigt" : s.S.has(d.toString()) ? "übersprungen" : "versäumt"])
    .reverse();
  const canEdit = !view.readOnly && s.phase === "active";
  const setException = (date: string, skipped: boolean) =>
    void repo
      .perform(view.task.ref, { type: "setException", revision: s.revisionKey, date, skipped }, skipped ? "Termin wird übersprungen" : "Termin wieder aufgenommen")
      .then((o) => onOutcome(o, skipped ? "Termin wird übersprungen" : "Termin wieder aufgenommen"));
  return (
    <>
      <div className="group" data-testid="waste-upcoming">
        <div className="section">
          <span>{T.waste.upcoming}</span>
          <span className="section-count">{upcoming.length}</span>
        </div>
        {upcoming.map((d) => {
          const key = d.toString();
          const skipped = s.S.has(key);
          return (
            <div key={key} className={`row waste-date${skipped ? " skipped" : ""}`} data-testid={`waste-date-${key}`}>
              <div className="main">
                <div className="title">{describeOccurrence(d)}</div>
                {skipped && <div className="meta">übersprungen</div>}
              </div>
              {canEdit && (
                <span className="menu-anchor">
                  <button className="icon-btn" onClick={() => setMenu(menu === key ? null : key)} data-menu-anchor aria-label={`Termin ${describeOccurrence(d)}`} data-testid={`waste-date-menu-${key}`}>
                    <IconDots size={18} />
                  </button>
                  {menu === key && (
                    <Menu label="Termin" onClose={() => setMenu(null)}>
                      {skipped ? (
                        <MenuItem icon={<IconUndo size={20} />} testId="waste-unskip" onClick={() => (setMenu(null), setException(key, false))}>
                          {T.waste.unskip}
                        </MenuItem>
                      ) : (
                        <MenuItem icon={<IconSkip size={20} />} testId="waste-skip" onClick={() => (setMenu(null), setException(key, true))}>
                          {T.waste.skip}
                        </MenuItem>
                      )}
                    </Menu>
                  )}
                </span>
              )}
            </div>
          );
        })}
        {!upcoming.length && <div className="empty small">{ended ? T.waste.noMore : "Danach keine Termine mehr."}</div>}
      </div>
      {past.length > 0 && (
        <details className="group waste-past" data-testid="waste-past">
          <summary className="section">
            <IconChevronDown size={16} />
            <span>{T.waste.past}</span>
            <span className="section-count">{past.length}</span>
          </summary>
          {past.map(([d, state]) => (
            <div key={d.toString()} className={`row waste-date past ${state}`}>
              <div className="main">
                <div className="title">{describeOccurrence(d)}</div>
              </div>
              <span className="waste-state">{state}</span>
            </div>
          ))}
        </details>
      )}
    </>
  );
}

/** Vorlauf einer Terminliste ändern (5.7): nur Abstand, die Termine kommen aus dem Import. */
export function DateListEditor({ series, onCancel, onSave }: { series: Series; onCancel(): void; onSave(action: TaskAction): void }) {
  const dialog = useDialog<HTMLDivElement>(onCancel);
  const [lead, setLead] = useState(String(leadDays(series) ?? ""));
  const next = remainingListDates(series).slice(0, 10);
  const n = lead.trim() === "" ? null : Number(lead);
  const valid = n === null || (Number.isInteger(n) && n >= 0 && n <= 60);
  return (
    <div className="modal-back" onClick={onCancel}>
      <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-label="Termine und Vorlauf" onClick={(e) => e.stopPropagation()} data-testid="datelist-editor">
        <h2>Termine und Vorlauf</h2>
        <div className="fields" style={{ padding: 0 }}>
          <label>{T.waste.leadTime}</label>
          <div className="dateedit">
            <span>geplant</span>
            <input type="number" min={0} max={60} value={lead} style={{ width: 60 }} onChange={(e) => setLead(e.target.value)} aria-label="Tage vorher" data-testid="datelist-lead" />
            <span>Tage vor dem Termin (leer = nicht einplanen)</span>
          </div>
        </div>
        <div className="diag">
          <div>
            <b>{describeSeries(series)}</b>
          </div>
          <div>Nächste Termine: {next.length ? next.map((d) => describeOccurrence(d)).join(" · ") : "keine"}</div>
          <div style={{ color: "var(--fg-muted)" }}>Die Termine selbst kommen aus dem Kalenderimport der Müllabfuhr.</div>
        </div>
        <div className="buttons">
          <button className="btn" onClick={onCancel}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={() => onSave({ type: "changeReference", revision: series.revisionKey, field: series.field, offsetDays: n === null ? null : -n })}
            data-testid="datelist-save"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

/** Import der ICS-Datei: Datei wählen, Vorschau je Abfuhrart, übernehmen (4.7). */
export function WasteImportDialog({ repo, idx, onClose, onDone }: { repo: Repository; idx: Index; onClose(): void; onDone(message: string, error: boolean): void }) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  const [file, setFile] = useState<{ name: string; data: WasteFile } | null>(null);
  const [rows, setRows] = useState<WasteRow[]>([]);
  const [lead, setLead] = useState("7");
  const [busy, setBusy] = useState(false);
  const tz = clock().timeZone;
  useEffect(() => {
    let alive = true;
    void bridge()
      .ics.choose()
      .then((r) => {
        if (!alive) return;
        if (!r) return onClose();
        if (r.error || r.text === undefined) return onDone(`${r.name}: ${r.error ?? "nicht lesbar"}`, true);
        const data = readWasteFile(r.text, tz);
        if (!data.groups.length) return onDone(`${r.name}: keine Termine gefunden`, true);
        setFile({ name: r.name, data });
        setRows(wasteRows(data, idx, repo.previewContext()));
      });
    return () => {
      alive = false;
    };
    // Nur beim Öffnen: Die Vorschau zeigt den Stand beim Einlesen.
  }, []);
  const existing = useMemo(() => wasteSeries(idx), [idx]);
  const n = Number(lead);
  const leadOk = Number.isInteger(n) && n >= 0 && n <= 60;
  const chosen = rows.filter((r) => r.include);
  if (!file) return null;
  const update = (i: number, row: WasteRow) => setRows((rs) => rs.map((r, j) => (j === i ? row : r)));
  const notes = [
    file.data.withRule ? `${file.data.withRule} Termine mit Wiederholungsregel nicht übernommen` : "",
    file.data.cancelled ? `${file.data.cancelled} abgesagte Termine ausgelassen` : "",
    file.data.unreadable ? `${file.data.unreadable} Einträge ohne Titel oder Datum ausgelassen` : "",
  ].filter(Boolean);
  return (
    <div className="modal-back" onClick={onClose}>
      <div ref={dialog} className="modal waste-import" role="dialog" aria-modal="true" aria-label="Kalender importieren" onClick={(e) => e.stopPropagation()} data-testid="waste-import-dialog">
        <h2>Kalender importieren</h2>
        <div className="waste-file">{file.name}</div>
        {notes.map((t) => (
          <div key={t} className="diag info">
            {t}
          </div>
        ))}
        <table className="waste-rows">
          <tbody>
            {rows.map((r, i) => {
              const selectable = r.effect.kind === "new" || r.effect.kind === "update";
              const taken = new Set(rows.filter((o) => o !== r && o.target).map((o) => o.target!.task.ref));
              return (
                <tr key={r.group.key} data-testid={`waste-import-row-${i}`}>
                  <td>
                    <input type="checkbox" checked={r.include} disabled={!selectable} onChange={(e) => update(i, { ...r, include: e.target.checked })} aria-label={`${r.group.key} übernehmen`} data-testid={`waste-import-include-${i}`} />
                  </td>
                  <td className="waste-name">
                    {r.target ? (
                      <span>{r.target.task.fields.title}</span>
                    ) : (
                      <input value={r.name} onChange={(e) => update(i, { ...r, name: e.target.value })} aria-label={`Name für ${r.group.key}`} data-testid={`waste-import-name-${i}`} />
                    )}
                    <div className="waste-key">
                      {r.group.key} · {wasteGroupSpan(r.group)}
                    </div>
                  </td>
                  <td>
                    {(!r.target || r.target.task.data.waste_type !== r.group.key || existing.length > 1) && existing.length > 0 && (
                      <select
                        value={r.target?.task.ref ?? ""}
                        onChange={(e) => update(i, reassignWasteRow(r, existing.find((v) => v.task.ref === e.target.value) ?? null, file.data, repo.previewContext()))}
                        aria-label={`Zuordnung für ${r.group.key}`}
                        data-testid={`waste-import-target-${i}`}
                      >
                        <option value="">neu anlegen</option>
                        {existing
                          .filter((v) => v.task.ref === r.target?.task.ref || !taken.has(v.task.ref))
                          .map((v) => (
                            <option key={v.task.ref} value={v.task.ref}>
                              zu „{v.task.fields.title}“
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className={`waste-effect ${r.effect.kind}`} data-testid={`waste-import-effect-${i}`}>
                    {describeWasteEffect(r.effect)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="fields" style={{ padding: 0 }}>
          <label>{T.waste.leadTime}</label>
          <div className="dateedit">
            <span>neue Abfuhrarten geplant</span>
            <input type="number" min={0} max={60} value={lead} style={{ width: 60 }} onChange={(e) => setLead(e.target.value)} aria-label="Tage vorher" data-testid="waste-import-lead" />
            <span>Tage vor dem Abholtag</span>
          </div>
        </div>
        <div className="buttons">
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            disabled={busy || !chosen.length || !leadOk || chosen.some((r) => !r.target && !r.name.trim())}
            onClick={() => {
              setBusy(true);
              void applyWasteImport(repo, rows, file.data, n).then((res) => onDone(wasteImportMessage(res), res.failures.length > 0));
            }}
            data-testid="waste-import-apply"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
