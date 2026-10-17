// CodeMirror 6 als Markdown-Editor. Ctrl+Z wirkt hier auf die Texteingabe (4.5).
import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

interface Props {
  value: string;
  /** Wechselt der Schlüssel, wird der Editorinhalt neu gesetzt */
  docKey: string;
  readOnly: boolean;
  onChange(text: string): void;
  onBlur(): void;
}

export function MarkdownEditor({ value, docKey, readOnly, onChange, onBlur }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onBlur });
  cb.current = { onChange, onBlur };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.contentAttributes.of({ "aria-label": "Notiz", "data-testid": "editor" }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
            if (u.focusChanged && !u.view.hasFocus) cb.current.onBlur();
          }),
          EditorView.theme({
            "&": { backgroundColor: "var(--bg)", color: "var(--fg)" },
            ".cm-content": { padding: "8px 4px", caretColor: "var(--fg)" },
            "&.cm-focused": { outline: "none" },
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // Neuaufbau nur bei anderem Dokument oder Schreibschutz
  }, [docKey, readOnly]);

  // Externe Änderung am selben Dokument übernehmen, wenn der Editor nicht fokussiert ist.
  useEffect(() => {
    const v = view.current;
    if (!v || v.hasFocus) return;
    const cur = v.state.doc.toString();
    if (cur !== value) v.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
  }, [value]);

  return <div className="editor" ref={host} />;
}
