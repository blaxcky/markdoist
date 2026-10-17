import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseFrontmatter, parseSimpleFrontmatter, splitFile } from "../src";

function viaLib(text: string) {
  const p = parseFrontmatter(text);
  return p.ok && !p.hasAnchors ? p.data : null;
}

const scalars = [
  "open", "2026-10-12", "2026-10-12T17:00", "2026-10-12T08:14:03+02:00", "01K7C9V3QH2T8M4N6P0R5S1W9X",
  "true", "false", "True", "FALSE", "yes", "no", "null", "~", "", "0", "1", "-3", "+4", "0123", "1.5", ".5", "1.", "1e3",
  "-0", "0o17", "0x1F", ".inf", ".nan", "Zahnarzt: Termin", "a #b", "a#b", "C#", "http://x.y/z", "FREQ=WEEKLY;BYDAY=MO",
  '"quoted"', '"with \\" escape"', "'single'", "'it''s'", '"a # b"', "- x", "[a, b]", "[]", "[a, [b]]", "{a: 1}", "&x 1", "*x",
  "|", ">", "!tag x", "@x", "`x`", "%x", "Bettwäsche wechseln", "Ümlaut ß", "a: b: c", "trailing:", "  spaced  ", "tab\there",
];
const keys = ["id", "title", "status", "priority", "inbox", "due", "tags", "x-y", "a_b", "Key2"];

const line = fc.oneof(
  fc.tuple(fc.constantFrom(...keys), fc.constantFrom(...scalars), fc.constantFrom("", "  # c")).map(([k, v, c]) => `${k}: ${v}${c}`),
  fc.tuple(fc.constantFrom(...keys), fc.array(fc.constantFrom(...scalars), { maxLength: 3 }), fc.constantFrom("  - ", "- ", "    - ")).map(
    ([k, items, ind]) => [`${k}:`, ...items.map((i) => `${ind}${i}`)].join("\n"),
  ),
  fc.constantFrom("# Kommentar", "", "  # eingerückt", "key:value", "? komplex", "  fortsetzung", "---", "dup: 1"),
);

describe("Schneller Frontmatter-Lesepfad", () => {
  it("liefert nie etwas anderes als die yaml-Bibliothek", () => {
    let hits = 0;
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 8 }), fc.boolean(), (ls, crlf) => {
        let text = ls.join("\n") + "\n";
        if (crlf) text = text.replace(/\n/g, "\r\n");
        const fast = parseSimpleFrontmatter(text);
        if (fast === null) return;
        hits++;
        const lib = viaLib(text);
        expect(lib).not.toBeNull();
        expect(fast).toEqual(lib);
      }),
      { numRuns: 4000 },
    );
    expect(hits).toBeGreaterThan(400);
  });

  it("deckt typische Aufgabendateien vollständig ab", () => {
    const text = [
      "id: 01K69X4D2M7Q0B5T8V3W6Y1Z4C",
      "format_version: 1",
      "title: Wochenrückblick",
      "status: open",
      "priority: normal",
      "inbox: false",
      "due: 2026-10-16",
      "recurrence: FREQ=WEEKLY;BYDAY=FR",
      "recurrence_offset_days: -1",
      "complete_instances:",
      "  - 2026-09-04",
      "  - 2026-09-11",
      "skipped_instances: [2026-09-18]",
      "tags: [routine]   # unbekanntes Feld, bleibt erhalten",
      "dateCreated: 2026-09-01T19:02:11+02:00",
      "",
    ].join("\n");
    const fast = parseSimpleFrontmatter(text);
    expect(fast).not.toBeNull();
    expect(fast).toEqual(viaLib(text));
    const s = splitFile("---\n" + text + "---\nBody\n")!;
    expect(parseSimpleFrontmatter(s.yaml)).toEqual(fast);
  });
});
