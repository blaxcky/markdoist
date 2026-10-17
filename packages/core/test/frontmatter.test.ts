import { describe, expect, it } from "vitest";
import { editFrontmatter, parseFrontmatter, serializePair, splitFile } from "../src/frontmatter";

const golden = [
  "﻿---",
  "id: 01K7C9V3QH2T8M4N6P0R5S1W9X",
  "# Kommentar vor dem Titel",
  'title: "Zahnarzt: Termin"',
  "status: open",
  "priority: none   # Inline-Kommentar",
  "tags:",
  "  - a",
  "  - b",
  "",
  "custom: {x: 1, y: [2, 3]}",
  "inbox: true",
  "dateModified: 2026-10-12T08:14:03+02:00",
  "---",
  "Notiz mit **Text**",
  "- [x] Haken",
].join("\r\n");

describe("splitFile", () => {
  it("erhält BOM, CRLF und fehlenden Abschlusszeilenumbruch", () => {
    const s = splitFile(golden)!;
    expect(s.bom).toBe("﻿");
    expect(s.eol).toBe("\r\n");
    expect(s.body).toBe("Notiz mit **Text**\r\n- [x] Haken");
  });

  it("erkennt fehlende Frontmatter", () => {
    expect(splitFile("# Nur Text\n")).toBeNull();
    expect(splitFile("---\nkein Ende\n")).toBeNull();
  });

  it("leere Frontmatter ist kein Mapping", () => {
    const s = splitFile("---\n---\nText")!;
    expect(s.yaml).toBe("");
    const p = parseFrontmatter(s.yaml);
    expect(p.ok).toBe(false);
  });
});

describe("parseFrontmatter", () => {
  it("liest YAML 1.2: Datum bleibt String, yes bleibt String", () => {
    const p = parseFrontmatter("due: 2026-10-14\ninbox: yes\nn: 3\n");
    expect(p.ok && p.data).toEqual({ due: "2026-10-14", inbox: "yes", n: 3 });
  });

  it("meldet doppelte Schlüssel", () => {
    const p = parseFrontmatter("a: 1\na: 2\n");
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toBe("duplicate-key");
  });

  it("meldet Syntaxfehler", () => {
    const p = parseFrontmatter("a: [1, 2\n");
    expect(p.ok).toBe(false);
  });
});

describe("editFrontmatter (AK-07)", () => {
  it("Prioritätsänderung ändert nur priority und dateModified", () => {
    const r = editFrontmatter(golden, {
      set: { priority: "high", dateModified: "2026-10-12T09:00:00+02:00" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expected = golden
      .replace("priority: none   # Inline-Kommentar", "priority: high")
      .replace("dateModified: 2026-10-12T08:14:03+02:00", "dateModified: 2026-10-12T09:00:00+02:00");
    expect(r.text).toBe(expected);
  });

  it("hängt neue Felder am Ende an und entfernt nur eigene Zeilen", () => {
    const r = editFrontmatter(golden, { set: { due: "2026-10-16" }, remove: ["tags"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).not.toContain("  - a");
    expect(r.text).toContain("custom: {x: 1, y: [2, 3]}\r\n");
    expect(r.text).toContain("dateModified: 2026-10-12T08:14:03+02:00\r\ndue: 2026-10-16\r\n---\r\n");
    // Leerzeile vor custom bleibt erhalten
    expect(r.text).toContain("\r\n\r\ncustom:");
  });

  it("schreibt Listen als Blockliste", () => {
    expect(serializePair("complete_instances", ["2026-09-04", "2026-09-11"], "\n")).toBe(
      "complete_instances:\n  - 2026-09-04\n  - 2026-09-11\n",
    );
    expect(serializePair("title", "true", "\n")).toBe('title: "true"\n');
    expect(serializePair("x", [], "\n")).toBe("x: []\n");
  });

  it("verweigert Frontmatter mit Ankern", () => {
    const t = "---\na: &x 1\nb: *x\n---\n";
    const r = editFrontmatter(t, { set: { a: 2 } });
    expect(r.ok).toBe(false);
  });

  it("ersetzt Body nur auf ausdrücklichen Wunsch", () => {
    const t = "---\ntitle: A\n---\nalt\n";
    const r = editFrontmatter(t, { set: { title: "B" } }, "neu\n");
    expect(r.ok && r.text).toBe("---\ntitle: B\n---\nneu\n");
  });
});
