// Schneller Lesepfad für einfache Frontmatter (Leistung unter Hermes, M7).
// Unterstützt nur: Schlüssel in Spalte 0, einfache Skalare nach YAML 1.2 Core-Schema,
// einfache Blocklisten und Flow-Listen aus Skalaren, Kommentare. Bei allem anderen
// liefert er `null`, und der Aufrufer nutzt die vollständige `yaml`-Bibliothek.
// Er dient nur dem Lesen; geschrieben wird immer über die Bibliothek (7.2).
import type { YamlValue } from "./frontmatter";

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ ]+(.*))?$/;
const ITEM_LINE = /^[ ]*- (.*)$/;
const INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;
const INT = /^[-+]?[0-9]+$/;
const OCT = /^0o[0-7]+$/;
const HEX = /^0x[0-9a-fA-F]+$/;
const FLOAT = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/;

/** Kommentar am Zeilenende entfernen (` #` außerhalb von Anführungszeichen). */
function stripComment(v: string): string {
  const i = v.search(/[ \t]#/);
  return (i >= 0 ? v.slice(0, i) : v).trimEnd();
}

/** Skalar nach YAML 1.2 Core-Schema; `undefined` = nicht sicher auflösbar. */
function scalar(raw: string): YamlValue | undefined {
  const v = raw.trim();
  if (v === "" || v === "~" || v === "null" || v === "Null" || v === "NULL") return null;
  if (v === "true" || v === "True" || v === "TRUE") return true;
  if (v === "false" || v === "False" || v === "FALSE") return false;
  if (v.startsWith('"')) {
    if (v.length < 2 || !v.endsWith('"')) return undefined;
    const inner = v.slice(1, -1);
    if (/["\\]/.test(inner)) return undefined;
    return inner;
  }
  if (v.startsWith("'")) {
    if (v.length < 2 || !v.endsWith("'")) return undefined;
    const inner = v.slice(1, -1);
    if (inner.includes("'")) return undefined;
    return inner;
  }
  if (INT.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : undefined;
  }
  if (OCT.test(v) || HEX.test(v)) return undefined; // selten; der Bibliothek überlassen
  if (FLOAT.test(v)) return Number(v);
  if (/^[-+]?\.(inf|Inf|INF)$/.test(v) || /^\.(nan|NaN|NAN)$/.test(v)) return undefined;
  // Einfacher Klartext: darf nicht mit einem Indikator beginnen und kein ": " enthalten.
  if (INDICATOR.test(v) && !/^-[0-9]/.test(v)) return undefined;
  if (v.includes(": ") || v.endsWith(":") || v.includes("\t")) return undefined;
  return v;
}

function flowList(v: string): YamlValue[] | undefined {
  if (!v.startsWith("[") || !v.endsWith("]")) return undefined;
  const inner = v.slice(1, -1).trim();
  if (inner === "") return [];
  if (/[[\]{}"']/.test(inner)) return undefined;
  const out: YamlValue[] = [];
  for (const part of inner.split(",")) {
    const p = part.trim();
    if (p === "") return undefined;
    const s = scalar(p);
    if (s === undefined) return undefined;
    out.push(s);
  }
  return out;
}

/** Liefert die Daten einfacher Frontmatter oder `null`, wenn die Bibliothek nötig ist. */
export function parseSimpleFrontmatter(text: string): Record<string, YamlValue> | null {
  if (text.includes("\t")) return null;
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const data: Record<string, YamlValue> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line === "" || line.startsWith("#")) {
      i++;
      continue;
    }
    const m = KEY_LINE.exec(line);
    if (!m) return null;
    const key = m[1]!;
    if (Object.prototype.hasOwnProperty.call(data, key)) return null; // Bibliothek meldet doppelte Schlüssel
    const rest = m[2] === undefined ? "" : stripComment(m[2]);
    i++;
    if (rest === "") {
      // Blockliste oder null
      const items: YamlValue[] = [];
      let indent: number | null = null;
      while (i < lines.length) {
        const l = lines[i]!;
        if (l === "" || /^[ ]*#/.test(l)) {
          // Leer- und Kommentarzeilen innerhalb oder nach der Liste
          i++;
          continue;
        }
        const im = ITEM_LINE.exec(l);
        if (!im) {
          if (l.startsWith(" ") || l.startsWith("-")) return null;
          break;
        }
        const ind = l.length - l.trimStart().length;
        if (indent === null) indent = ind;
        else if (ind !== indent) return null;
        const v = stripComment(im[1]!);
        if (v.startsWith("[") || v.startsWith("{") || v.startsWith("- ") || v === "-") return null;
        const s = scalar(v);
        if (s === undefined) return null;
        items.push(s);
        i++;
      }
      data[key] = items.length ? items : null;
      continue;
    }
    if (rest.startsWith("[")) {
      const fl = flowList(rest);
      if (fl === undefined) return null;
      data[key] = fl;
      continue;
    }
    const s = scalar(rest);
    if (s === undefined) return null;
    // Folgezeilen eines mehrzeiligen Klartexts sind nicht erlaubt.
    if (i < lines.length && /^[ ]+\S/.test(lines[i]!) && !/^[ ]+#/.test(lines[i]!)) return null;
    data[key] = s;
  }
  if (Object.keys(data).length === 0) return null;
  return data;
}
