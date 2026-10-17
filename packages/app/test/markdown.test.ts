import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/markdown";

describe("Markdown-Vorschau", () => {
  it("rendert Checkboxen mit Zeilennummer, kein HTML", () => {
    const html = renderMarkdown("Text <b>x</b>\n\n- [x] a\n- [ ] b\n\n```\n- [x] c\n```\n");
    expect(html).toContain('<input type="checkbox" class="md-check" data-line="2" checked> a');
    expect(html).toContain('data-line="3"> b');
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("- [x] c");
  });
  it("Linkify", () => {
    expect(renderMarkdown("siehe https://example.org")).toContain('href="https://example.org"');
  });
});
