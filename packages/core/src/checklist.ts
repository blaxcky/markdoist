// Markdown-Checklisten (5.6): Stellen über markdown-it-Tokens und Quellzeilen bestimmen,
// damit Code-Blöcke und verschachtelte Strukturen unberührt bleiben.
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false });

export interface Checkbox {
  /** Zeile im Body (0-basiert) */
  line: number;
  /** Zeichenposition des Zustandszeichens innerhalb der Zeile */
  col: number;
  checked: boolean;
}

const MARKER = /^([ \t>]*(?:[-+*]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)/;

function splitLines(body: string): string[] {
  return body.split("\n");
}

export function findCheckboxes(body: string): Checkbox[] {
  const tokens = md.parse(body, {});
  const lines = splitLines(body);
  const out: Checkbox[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== "list_item_open" || !t.map) continue;
    const p = tokens[i + 1];
    const inline = tokens[i + 2];
    if (!p || p.type !== "paragraph_open" || !inline || inline.type !== "inline" || !inline.map) continue;
    if (inline.map[0] !== t.map[0]) continue;
    if (!/^\[[ xX]\](\s|$)/.test(inline.content)) continue;
    const lineNo = t.map[0];
    const text = (lines[lineNo] ?? "").replace(/\r$/, "");
    const m = MARKER.exec(text);
    if (!m) continue;
    out.push({ line: lineNo, col: m[1]!.length + 1, checked: m[2] !== " " });
  }
  return out;
}

function setChar(body: string, cb: Checkbox, ch: string): string {
  const lines = splitLines(body);
  const l = lines[cb.line]!;
  lines[cb.line] = l.slice(0, cb.col) + ch + l.slice(cb.col + 1);
  return lines.join("\n");
}

/** Schaltet genau eine Checkbox um; ändert genau ein Zeichen. `null`, wenn keine Checkbox. */
export function toggleCheckbox(body: string, line: number): string | null {
  const cb = findCheckboxes(body).find((c) => c.line === line);
  if (!cb) return null;
  return setChar(body, cb, cb.checked ? " " : "x");
}

/** Setzt alle angehakten Checklistenelemente zurück (nur beim Wechsel zu neuem Vorkommen). */
export function resetCheckboxes(body: string): string {
  let out = body;
  for (const cb of findCheckboxes(body)) if (cb.checked) out = setChar(out, cb, " ");
  return out;
}
