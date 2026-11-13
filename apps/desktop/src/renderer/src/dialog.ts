// Gemeinsames Dialogverhalten: Escape schließt, Fokus beim Öffnen auf das erste Bedienelement.
// Liegen Dialoge übereinander (z. B. Einstellungen über „Checkliste einfügen“), schließt Escape nur den obersten.
import { useEffect, useRef } from "react";

/** Offene Dialoge in Öffnungsreihenfolge; der letzte ist der oberste. */
const open: object[] = [];

export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = {};
    open.push(me);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || open[open.length - 1] !== me) return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      open.splice(open.indexOf(me), 1);
      prev?.focus?.();
    };
  }, []);
  return ref;
}
