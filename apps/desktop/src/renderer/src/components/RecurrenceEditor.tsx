// Wiederholungseditor (Abschnitt 6, M6): einfache Optionen, Monatsende-Abfrage,
// erweiterte Regeleingabe mit Validierung, Vorschau der nächsten 10 Termine.
import { useMemo, useState } from "react";
import { useDialog } from "../dialog";
import {
  defaultForm,
  formFromSeries,
  needsMonthEndChoice,
  previewAction,
  previewForm,
  ruleFormAction,
  type RuleForm,
} from "@markdoist/app";
import { describeOccurrence, parseKey, Temporal, type Series, type Task, type TaskAction, type Weekday } from "@markdoist/core";
import { clock } from "../repo";

const WD: [Weekday, string][] = [
  ["MO", "Mo"],
  ["TU", "Di"],
  ["WE", "Mi"],
  ["TH", "Do"],
  ["FR", "Fr"],
  ["SA", "Sa"],
  ["SU", "So"],
];

interface Props {
  task: Task;
  series: Series | null;
  /** „Serie mit neuer Regel fortsetzen“: Zählung beginnt neu (5.4) */
  continueSeries?: boolean;
  today: Temporal.PlainDate;
  defaultField: "due" | "scheduled";
  onCancel(): void;
  onSave(action: TaskAction): void;
}

export function RecurrenceEditor({ task, series, continueSeries, today, defaultField, onCancel, onSave }: Props) {
  const [f, setF] = useState<RuleForm>(() => {
    const form = series ? formFromSeries(series, today) : defaultForm(today, defaultField);
    if (continueSeries) form.restartCount = true;
    return form;
  });
  // Künftige Ausnahmen des alten Abschnitts werden nur nach ausdrücklicher Auswahl übernommen (5.1).
  const futureExceptions = series ? [...series.S].filter((d) => d > today.toString()).sort() : [];
  const [carry, setCarry] = useState<string[]>([]);
  const dialog = useDialog<HTMLDivElement>(onCancel);
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const preview = useMemo(() => previewForm(f, today, !!series), [f, today, series]);
  const action = useMemo(() => ruleFormAction(f, series, carry), [f, series, carry]);
  const effect = useMemo(() => (preview.ok ? previewAction(task, action, clock()) : null), [preview.ok, task, action]);
  const simple = f.mode === "simple";
  const toggleDay = (d: Weekday) =>
    set("weekdays", f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d]);

  return (
    <div className="modal-back" onClick={onCancel}>
      <div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-label="Wiederholung" onClick={(e) => e.stopPropagation()} data-testid="recurrence-editor">
        <h2>{continueSeries ? "Serie mit neuer Regel fortsetzen" : "Wiederholung"}</h2>
        <div className="fields" style={{ padding: 0 }}>
          <label>Art</label>
          <select value={f.anchor} onChange={(e) => set("anchor", e.target.value as RuleForm["anchor"])} data-testid="rec-anchor">
            <option value="calendar">Kalender (fester Rhythmus)</option>
            <option value="completion">Ab Erledigung</option>
          </select>
          <label>Eingabe</label>
          <select value={f.mode} onChange={(e) => set("mode", e.target.value as RuleForm["mode"])} data-testid="rec-mode">
            <option value="simple">Einfach</option>
            <option value="advanced">Erweitert (RRULE)</option>
          </select>
          {simple ? (
            <>
              <label>{f.anchor === "completion" ? "Abstand" : "Rhythmus"}</label>
              <div className="dateedit">
                {f.anchor === "completion" ? (
                  <>
                    <input type="number" min={1} value={f.interval} style={{ width: 60 }} onChange={(e) => set("interval", +e.target.value)} aria-label="Anzahl" />
                    <select value={f.freq} onChange={(e) => set("freq", e.target.value as RuleForm["freq"])} aria-label="Einheit">
                      <option value="daily">Tage</option>
                      <option value="weekly">Wochen</option>
                      <option value="monthly">Monate</option>
                      <option value="yearly">Jahre</option>
                    </select>
                    <span>nach Erledigung</span>
                  </>
                ) : (
                  <>
                    <select value={f.freq} onChange={(e) => set("freq", e.target.value as RuleForm["freq"])} data-testid="rec-freq">
                      <option value="daily">täglich</option>
                      <option value="weekdays">werktags (Mo–Fr)</option>
                      <option value="weekly">wöchentlich</option>
                      <option value="monthly">monatlich</option>
                      <option value="yearly">jährlich</option>
                    </select>
                    {f.freq !== "weekdays" && (
                      <>
                        <span>alle</span>
                        <input type="number" min={1} value={f.interval} style={{ width: 60 }} onChange={(e) => set("interval", +e.target.value)} aria-label="Intervall" data-testid="rec-interval" />
                      </>
                    )}
                  </>
                )}
              </div>
              {f.anchor === "calendar" && f.freq === "weekly" && (
                <>
                  <label>Wochentage</label>
                  <div className="dateedit">
                    {WD.map(([d, l]) => (
                      <label key={d} style={{ color: "var(--fg)" }}>
                        <input type="checkbox" checked={f.weekdays.includes(d)} onChange={() => toggleDay(d)} /> {l}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {f.anchor === "calendar" && f.freq === "monthly" && (
                <>
                  <label>Monatlich</label>
                  <div className="dateedit">
                    <select value={f.monthlyMode} onChange={(e) => set("monthlyMode", e.target.value as RuleForm["monthlyMode"])}>
                      <option value="day">am Tag</option>
                      <option value="last-day">am letzten Tag</option>
                      <option value="nth-weekday">am n-ten Wochentag</option>
                    </select>
                    {f.monthlyMode === "day" && (
                      <input type="number" min={1} max={31} value={f.monthDay} style={{ width: 60 }} onChange={(e) => set("monthDay", +e.target.value)} aria-label="Tag" data-testid="rec-monthday" />
                    )}
                    {f.monthlyMode === "nth-weekday" && (
                      <>
                        <select value={f.nth} onChange={(e) => set("nth", +e.target.value)} aria-label="Ordinal">
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>{`${n}.`}</option>
                          ))}
                          <option value={-1}>letzten</option>
                        </select>
                        <select value={f.nthWeekday} onChange={(e) => set("nthWeekday", e.target.value as Weekday)} aria-label="Wochentag">
                          {WD.map(([d, l]) => (
                            <option key={d} value={d}>{l}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </>
              )}
              {needsMonthEndChoice(f) && (
                <>
                  <label>Monatsende</label>
                  <div className="dateedit" data-testid="rec-monthend">
                    <label style={{ color: "var(--fg)" }}>
                      <input type="radio" checked={f.monthEnd === "skip"} onChange={() => set("monthEnd", "skip")} /> Monate ohne diesen Tag auslassen
                    </label>
                    <label style={{ color: "var(--fg)" }}>
                      <input type="radio" checked={f.monthEnd === "last"} onChange={() => set("monthEnd", "last")} /> stattdessen am letzten Tag des Monats
                    </label>
                  </div>
                </>
              )}
              <label>Ende</label>
              <div className="dateedit">
                <select value={f.end} onChange={(e) => set("end", e.target.value as RuleForm["end"])} data-testid="rec-end">
                  <option value="never">nie</option>
                  <option value="until">am Datum</option>
                  <option value="count">{f.anchor === "completion" ? "nach n Erledigungen" : "nach n Terminen"}</option>
                </select>
                {f.end === "until" && <input type="date" value={f.until} onChange={(e) => set("until", e.target.value)} aria-label="Enddatum" />}
                {f.end === "count" && (
                  <input type="number" min={1} value={f.count} style={{ width: 60 }} onChange={(e) => set("count", +e.target.value)} aria-label="Anzahl" data-testid="rec-count" />
                )}
                {series && f.end === "count" && <span>ab dieser Änderung</span>}
              </div>
            </>
          ) : (
            <>
              <label>Regel</label>
              <input value={f.advanced} onChange={(e) => set("advanced", e.target.value)} spellCheck={false} data-testid="rec-advanced" aria-label="RRULE" />
            </>
          )}
          <label>Start</label>
          <div className="dateedit">
            <input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} aria-label="Start" data-testid="rec-start" />
            {f.startTime ? (
              <>
                <input type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} aria-label="Uhrzeit" />
                <button className="btn" onClick={() => set("startTime", "")}>Uhrzeit entfernen</button>
              </>
            ) : (
              <button className="btn" onClick={() => set("startTime", "09:00")}>Uhrzeit hinzufügen</button>
            )}
          </div>
          <label>Bezugsfeld</label>
          <select value={f.field} onChange={(e) => set("field", e.target.value as RuleForm["field"])}>
            <option value="due">Frist</option>
            <option value="scheduled">Geplant</option>
          </select>
          <label>Abstand</label>
          <div className="dateedit">
            <input type="number" value={f.offset} placeholder="–" style={{ width: 70 }} onChange={(e) => set("offset", e.target.value)} aria-label="Abstand in Tagen" />
            <span>Tage für {f.field === "due" ? "Geplant" : "Frist"} (negativ = davor, leer = keiner)</span>
          </div>
          {series && (
            <>
              <label>Zählung</label>
              <label style={{ color: "var(--fg)" }}>
                <input type="checkbox" checked={f.restartCount} onChange={(e) => set("restartCount", e.target.checked)} data-testid="rec-restart" /> ab jetzt neu zählen („noch N-mal“)
              </label>
              {futureExceptions.length > 0 && (
                <>
                  <label>Ausnahmen</label>
                  <div data-testid="rec-carry">
                    {futureExceptions.map((d) => (
                      <label key={d} style={{ display: "block", color: "var(--fg)" }}>
                        <input
                          type="checkbox"
                          checked={carry.includes(d)}
                          onChange={(e) => setCarry((c) => (e.target.checked ? [...c, d] : c.filter((x) => x !== d)))}
                          data-testid={`rec-carry-${d}`}
                        />{" "}
                        {parseKey(d) ? describeOccurrence(parseKey(d)!) : d} weiterhin überspringen
                      </label>
                    ))}
                  </div>
                </>
              )}
              <label>Checklisten</label>
              <label style={{ color: "var(--fg)" }}>
                <input type="checkbox" checked={f.resetChecklists} onChange={(e) => set("resetChecklists", e.target.checked)} /> Haken zurücksetzen
              </label>
            </>
          )}
        </div>
        <div className="diag" data-testid="rec-preview">
          {preview.ok ? (
            <>
              <div>
                <b>{preview.description ?? preview.rule}</b>
                {preview.description && <span style={{ color: "var(--fg-muted)" }}> ({preview.rule})</span>}
              </div>
              <div>
                Nächste Termine: {preview.dates.map((d) => describeOccurrence(d)).join(" · ")}
                {preview.exhausted ? " (Ende)" : ""}
              </div>
              {effect && (
                <ul className="preview-lines" data-testid="rec-effect">
                  {effect.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <span style={{ color: "var(--danger)" }}>{preview.message}</span>
          )}
        </div>
        <div className="buttons">
          <button className="btn" onClick={onCancel}>Abbrechen</button>
          <button
            className="btn primary"
            disabled={!preview.ok || effect?.preview.result === "blocked"}
            onClick={() => (effect?.preview.result === "noop" ? onCancel() : onSave(action))}
            data-testid="rec-save"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
