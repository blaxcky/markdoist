// Aufklappmenü: schließt bei Klick daneben und mit Escape, ohne das Escape an andere Dialoge weiterzugeben.
import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  onClose(): void;
  /** Ausrichtung relativ zum umgebenden, positionierten Element */
  align?: "left" | "right";
  className?: string;
  label: string;
  children: ReactNode;
  testId?: string;
}

export function Menu({ onClose, align = "right", className, label, children, testId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button:not(:disabled), select, input")?.focus();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-menu-anchor]")) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        close.current();
        return;
      }
      // Eigene Tastaturbedienung (R9): Pfeile, Pos1 und Ende wandern zwischen den Einträgen.
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
      if (!items.length) return;
      e.stopPropagation();
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const n = items.length;
      const next = e.key === "ArrowDown" ? items[(i + 1) % n] : e.key === "ArrowUp" ? items[(i - 1 + n) % n] : e.key === "Home" ? items[0] : items[n - 1];
      next?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return (
    <div ref={ref} className={`menu ${align}${className ? ` ${className}` : ""}`} role="menu" aria-label={label} data-testid={testId} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  disabled,
  testId,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick(): void;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
  hint?: ReactNode;
}) {
  return (
    <button role="menuitem" className={`menu-item${danger ? " danger" : ""}`} onClick={onClick} disabled={disabled} data-testid={testId}>
      {icon && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{children}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </button>
  );
}
