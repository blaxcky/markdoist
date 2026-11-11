// Bereiche der Seitenleiste (4.5): zuklappbare Abschnitte und aufklappbare Bereiche mit Unterpunkten.
import { useEffect, useState, type ReactNode } from "react";
import { T, type SideGroupData } from "@markdoist/app";
import { IconChevronDown, IconPlus } from "./Icons";

export type SideKey = "collections" | "archive" | "lists" | "waste" | "dev";
type SideOpen = Record<SideKey, boolean>;

const STORE = "markdoist.sidebar";
const DEFAULT_OPEN: SideOpen = { collections: true, archive: true, lists: true, waste: false, dev: true };

/** Auf- und Zugeklapptes bleibt gerätelokal erhalten. */
export function useSideOpen(): [SideOpen, (k: SideKey) => void] {
  const [open, setOpen] = useState<SideOpen>(() => {
    try {
      const raw = localStorage.getItem(STORE);
      return raw ? { ...DEFAULT_OPEN, ...(JSON.parse(raw) as Partial<SideOpen>) } : DEFAULT_OPEN;
    } catch {
      return DEFAULT_OPEN;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(open));
    } catch {
      // ohne Speicher gilt die Wahl nur für die Sitzung
    }
  }, [open]);
  return [open, (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))];
}

const Chevron = ({ open }: { open: boolean }) => <IconChevronDown size={18} className={`side-chevron${open ? "" : " closed"}`} />;

/** Überschrift eines Abschnitts; ein Klick klappt ihn zu. */
export function SideSection({ label, open, onToggle, testid, children }: { label: string; open: boolean; onToggle(): void; testid: string; children: ReactNode }) {
  return (
    <>
      <button className="side-section" onClick={onToggle} aria-expanded={open} data-testid={testid}>
        <span className="side-section-label">{label}</span>
        <Chevron open={open} />
      </button>
      {open && children}
    </>
  );
}

interface GroupProps {
  label: string;
  icon: ReactNode;
  /** der Bereich ist die aktuelle Ansicht */
  active: boolean;
  onOpen(): void;
  data: SideGroupData;
  /** geöffneter Unterpunkt */
  activeRef: string | null;
  onOpenChild(ref: string): void;
  open: boolean;
  onToggle(): void;
  add?: { label: string; onClick(): void };
  testid: string;
}

/** Bereich mit Unterpunkten: Name öffnet die Übersicht, der Pfeil klappt auf. */
export function SideGroup({ label, icon, active, onOpen, data, activeRef, onOpenChild, open, onToggle, add, testid }: GroupProps) {
  const hasKids = data.kids.length > 0;
  // Ein offener Unterpunkt, der sichtbar ist, trägt die Markierung; sonst der Bereich selbst.
  const shownRef = open && active && data.kids.some((k) => k.ref === activeRef) ? activeRef : null;
  const current = active && !shownRef;
  return (
    <>
      <div className={`side-group${current ? " active" : ""}`}>
        <button className="nav" onClick={onOpen} data-testid={testid} aria-current={current ? "page" : undefined}>
          <span className="nav-icon">{icon}</span>
          <span className="nav-label">{label}</span>
          {(!open || !hasKids) && data.summary && <span className="count">{data.summary}</span>}
        </button>
        {add && (
          <button className="side-btn side-add" onClick={add.onClick} title={add.label} aria-label={add.label} data-testid={`${testid}-add`}>
            <IconPlus size={18} />
          </button>
        )}
        {hasKids && (
          <button className="side-btn" onClick={onToggle} aria-expanded={open} aria-label={T.side.toggle(label)} data-testid={`${testid}-toggle`}>
            <Chevron open={open} />
          </button>
        )}
      </div>
      {open && hasKids && (
        <div className="side-kids">
          {data.kids.map((k) => (
            <button
              key={k.ref}
              className={`nav sub${shownRef === k.ref ? " active" : ""}`}
              onClick={() => onOpenChild(k.ref)}
              aria-current={shownRef === k.ref ? "page" : undefined}
              data-testid={`${testid}-item`}
            >
              {k.dot && <span className="side-dot" style={{ background: k.dot }} aria-hidden="true" />}
              <span className="nav-label">{k.title}</span>
              {k.meta && <span className="count">{k.meta}</span>}
            </button>
          ))}
          {data.total > data.kids.length && (
            <button className="nav sub side-more" onClick={onOpen} data-testid={`${testid}-all`}>
              <span className="nav-label">{T.side.allLists(data.total)}</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
