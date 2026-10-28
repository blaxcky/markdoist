// Strich-Symbole der Oberfläche (24er-Raster), Farbe über currentColor.
import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconPlusCircle = (p: P) => (
  <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="M12 7v10M7 12h10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 6v12M6 12h12" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l4.5 4.5" />
  </Svg>
);
export const IconInbox = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 6.5A2 2 0 0 1 7.4 5h9.2a2 2 0 0 1 1.9 1.5L20 12.5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.5z" />
    <path d="M4 12.5h4.2a.8.8 0 0 1 .8.8v.2a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5-1.5v-.2a.8.8 0 0 1 .8-.8H20" />
  </Svg>
);
export const IconToday = ({ day, ...p }: P & { day: number }) => (
  <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
    <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--today-icon-fg, #fff)" fontFamily="inherit">
      {day}
    </text>
  </svg>
);
export const IconTodayOutline = ({ day, ...p }: P & { day: number }) => (
  <Svg {...p}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
    <text x="12" y="16" textAnchor="middle" fontSize="8.5" stroke="none" fill="currentColor" fontFamily="inherit">
      {day}
    </text>
  </Svg>
);
export const IconUpcoming = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
    <path d="M4.5 8.5h15" />
    <circle cx="8.5" cy="12" r=".6" fill="currentColor" />
    <circle cx="12" cy="12" r=".6" fill="currentColor" />
    <circle cx="15.5" cy="12" r=".6" fill="currentColor" />
    <circle cx="8.5" cy="15.5" r=".6" fill="currentColor" />
    <circle cx="12" cy="15.5" r=".6" fill="currentColor" />
  </Svg>
);
export const IconDone = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M8.8 12.2l2.2 2.2 4.3-4.6" />
  </Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M5 7h14M10 7V5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V7M7 7l.8 11a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
    <path d="M10.5 10.5v6M13.5 10.5v6" />
  </Svg>
);
/** Mülltonne mit Rädern (Müllabfuhr, 4.7) */
export const IconBin = (p: P) => (
  <Svg {...p}>
    <path d="M5 7.5h14M10 5.5h4M6.5 7.5l1 11.5h9l1-11.5" />
    <path d="M10 11v5M14 11v5" />
    <circle cx="8.5" cy="20" r="1" />
    <circle cx="15.5" cy="20" r="1" />
  </Svg>
);
export const IconWarning = (p: P) => (
  <Svg {...p}>
    <path d="M12 4.5l8 14H4z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.3" r=".5" fill="currentColor" />
  </Svg>
);
export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M7 16.5V11a5 5 0 0 1 10 0v5.5l1.5 1.5h-13z" />
    <path d="M10.5 19.5a1.5 1.5 0 0 0 3 0" />
  </Svg>
);
export const IconSidebar = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="5.5" width="15" height="13" rx="2" />
    <path d="M9.5 5.5v13" />
  </Svg>
);
export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="M8 10l4 4 4-4" />
  </Svg>
);
export const IconChevronUp = (p: P) => (
  <Svg {...p}>
    <path d="M8 14l4-4 4 4" />
  </Svg>
);
export const IconHelp = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M10 10a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5" />
    <circle cx="12" cy="15.8" r=".5" fill="currentColor" />
  </Svg>
);
export const IconDisplay = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="4.5" width="14" height="15" rx="2" />
    <path d="M8 9h8M8 12h8M8 15h5" />
  </Svg>
);
export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="M15.5 5.5l3 3L9 18H6v-3z" />
    <path d="M13.5 7.5l3 3" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <path d="M5 9h14" />
    <path d="M14.5 15h1" strokeWidth={1.4} />
  </Svg>
);
export const IconComment = (p: P) => (
  <Svg {...p}>
    <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4 3v-3h-.5A1.5 1.5 0 0 1 5 14.5z" />
  </Svg>
);
export const IconDots = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="18" cy="12" r="1.5" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconFlag = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p}>
    <path d="M6 20V5" />
    <path d="M6 5h11l-2.5 4L17 13H6" fill={filled ? "currentColor" : "none"} />
  </Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M18.5 12a6.5 6.5 0 1 1-2-4.7" />
    <path d="M18.5 5v3.5H15" />
  </Svg>
);
export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M9 8.5H15a4 4 0 0 1 0 8h-4" />
    <path d="M11.5 6L9 8.5l2.5 2.5" />
  </Svg>
);
export const IconRepeat = (p: P) => (
  <Svg {...p} strokeWidth={1.6}>
    <path d="M6 11a5 5 0 0 1 9-3l1.5 1.5" />
    <path d="M16.5 6v3.5H13" />
    <path d="M18 13a5 5 0 0 1-9 3l-1.5-1.5" />
    <path d="M7.5 18v-3.5H11" />
  </Svg>
);
export const IconFolder = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 7.5A1.5 1.5 0 0 1 6 6h3.5l2 2H18a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 18H6a1.5 1.5 0 0 1-1.5-1.5z" />
  </Svg>
);
export const IconTasks = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <path d="M9.2 12.1l1.9 1.9 3.8-4" />
  </Svg>
);
export const IconDescription = (p: P) => (
  <Svg {...p}>
    <path d="M6 8h12M6 12h12M6 16h7" />
  </Svg>
);
export const IconStatus = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 5a7 7 0 0 1 0 14z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconHistory = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 8v4l2.5 2" />
  </Svg>
);
export const IconTime = IconHistory;
export const IconCheck = (p: P) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M6.5 12.5l3.5 3.5 7.5-8" />
  </Svg>
);
export const IconSkip = (p: P) => (
  <Svg {...p} strokeWidth={1.6}>
    <path d="M7 6.5l8 5.5-8 5.5z" fill="currentColor" />
    <path d="M17.5 6.5v11" />
  </Svg>
);
export const IconStop = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconList = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="4.5" width="14" height="16" rx="2" />
    <path d="M9 4.5V3.5h6v1" />
    <path d="M8.5 10l1 1 2-2M8.5 15l1 1 2-2M13.5 10.5h2.5M13.5 15.5h2.5" />
  </Svg>
);
export const IconGrip = (p: P) => (
  <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    {[8, 12, 16].map((y) => (
      <g key={y}>
        <circle cx="9.5" cy={y} r="1.2" />
        <circle cx="14.5" cy={y} r="1.2" />
      </g>
    ))}
  </svg>
);
