// Markdown-Vorschau für beide Plattformen (Plan 2.2): markdown-it ohne HTML, mit Linkify
// und eigener Checkbox-Regel. Checkboxen tragen ihre Body-Zeile für zeilengenaues Umschalten.
import MarkdownIt from "markdown-it";
import { findCheckboxes } from "@markdoist/core";

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

md.core.ruler.after("inline", "markdoist-checkbox", (state) => {
  const lines = new Map(findCheckboxes(state.src).map((c) => [c.line, c]));
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]!;
    const li = tokens[i - 2]!;
    if (inline.type !== "inline" || li.type !== "list_item_open" || !li.map) continue;
    const cb = lines.get(li.map[0]);
    if (!cb || !inline.children?.length) continue;
    const first = inline.children[0]!;
    if (first.type !== "text" || !/^\[[ xX]\]/.test(first.content)) continue;
    first.content = first.content.slice(3).replace(/^\s/, "");
    const box = new state.Token("html_inline", "", 0);
    box.content = `<input type="checkbox" class="md-check" data-line="${cb.line}"${cb.checked ? " checked" : ""}> `;
    inline.children.unshift(box);
    li.attrJoin("class", "task-item");
  }
});

export function renderMarkdown(body: string): string {
  return md.render(body);
}
