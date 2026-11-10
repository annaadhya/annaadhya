"use client";
/**
 * RichTextEditor — dependency-free rich-text toolbar over a contentEditable div.
 *
 * Design notes:
 * - The editable div is UNCONTROLLED and its innerHTML is NEVER set through the React render
 *   path (dangerouslySetInnerHTML would re-apply on every keystroke and reset the caret to
 *   position zero — typing would come out reversed). Paint happens imperatively: once on
 *   mount, and in the effect only when `value` was changed externally (product hydration).
 * - Every command flows through `sync()` which reports `editor.innerHTML` upward.
 * - The sanitiser (@annaadhya/utils) runs server-side on every write AND client-side on render;
 *   the editor output is convenience, not a security boundary.
 * - Toolbar buttons are type="button" — this lives inside the product <form>.
 */
import { useEffect, useRef, useState } from "react";
import { stripHtml } from "@annaadhya/utils/rich-text";

type Cmd =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "removeFormat";

const SAFE_LINK = /^(https?:\/\/|mailto:|\/(?!\/))/i;

export function RichTextEditor({
  value,
  onChange,
  minHeight = "10rem",
  readOnly = false,
}: {
  /** Current HTML — paints the editor on mount, repaints only on external changes. */
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  /** Read-only renders the content without the toolbar (products:read users). */
  readOnly?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  /** null = never painted yet (mount); otherwise the last html value we accounted for. */
  const lastSynced = useRef<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  // Paint on mount; repaint ONLY when `value` was changed outside the editor
  // (product hydration / form reset). Typing never triggers a DOM write here.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (lastSynced.current === null || (value !== lastSynced.current && value !== el.innerHTML)) {
      el.innerHTML = value ?? "";
    }
    lastSynced.current = value;
  }, [value]);

  function sync() {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  function exec(cmd: Cmd) {
    editorRef.current?.focus();
    document.execCommand(cmd);
    sync();
  }

  function heading(tag: "h3" | "h4" | "p") {
    editorRef.current?.focus();
    document.execCommand("formatBlock", false, tag);
    sync();
  }

  function applyLink() {
    const url = linkUrl.trim();
    if (!SAFE_LINK.test(url)) {
      setLinkError("Use an https://, mailto: or /relative link");
      return;
    }
    editorRef.current?.focus();
    document.execCommand("createLink", false, url);
    setLinkMode(false);
    setLinkUrl("");
    setLinkError(null);
    sync();
  }

  const visibleChars = stripHtml(value).length;

  const toolBtn = "rounded border border-transparent px-2 py-1 text-xs font-semibold text-on-surface-variant hover:border-outline-variant hover:bg-surface-container-low";

  return (
    <div className="overflow-hidden rounded-lg bg-surface-container-lowest shadow-[0_0_0_1px_rgba(217,193,194,0.6)]">
      <div
        className={`flex flex-wrap items-center gap-1 border-b border-outline-variant/40 bg-surface-container-low px-2 py-1.5 ${readOnly ? "hidden" : ""}`}
        role="toolbar"
        aria-label="Text formatting"
        aria-hidden={readOnly}
      >
        <button type="button" className={toolBtn} onClick={() => exec("bold")} title="Bold">
          B
        </button>
        <button type="button" className={`${toolBtn} italic`} onClick={() => exec("italic")} title="Italic">
          I
        </button>
        <button type="button" className={`${toolBtn} underline`} onClick={() => exec("underline")} title="Underline">
          U
        </button>
        <button type="button" className={`${toolBtn} line-through`} onClick={() => exec("strikeThrough")} title="Strikethrough">
          S
        </button>
        <span className="mx-1 h-4 w-px bg-sand" aria-hidden />
        <button type="button" className={toolBtn} onClick={() => heading("h3")} title="Section heading">
          H3
        </button>
        <button type="button" className={toolBtn} onClick={() => heading("h4")} title="Small heading">
          H4
        </button>
        <button type="button" className={toolBtn} onClick={() => heading("p")} title="Body text">
          ¶
        </button>
        <span className="mx-1 h-4 w-px bg-sand" aria-hidden />
        <button type="button" className={toolBtn} onClick={() => exec("insertUnorderedList")} title="Bullet list">
          • List
        </button>
        <button type="button" className={toolBtn} onClick={() => exec("insertOrderedList")} title="Numbered list">
          1. List
        </button>
        <button type="button" className={toolBtn} onClick={() => setLinkMode((v) => !v)} title="Insert link">
          Link
        </button>
        <button type="button" className={toolBtn} onClick={() => exec("removeFormat")} title="Clear formatting">
          Clear
        </button>
        <span className="ml-auto text-[11px] text-ink/45" aria-live="polite">
          {visibleChars} chars
        </span>
      </div>

      {linkMode ? (
        <div className="flex items-center gap-2 border-b border-outline-variant/40 bg-surface-container-low/60 px-2 py-1.5">
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              setLinkError(null);
            }}
            placeholder="https://annaadhya.in/…"
            className="w-full flex-1 rounded-lg bg-surface-container-lowest px-3 py-1.5 text-body-sm text-on-surface shadow-[0_0_0_1px_rgba(217,193,194,0.6)] focus:outline-none focus:shadow-[0_0_0_2px_#541620]"
            aria-label="Link URL"
          />
          <button type="button" className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary" onClick={applyLink}>
            Apply
          </button>
          <button
            type="button"
            className="text-xs text-ink/60 underline"
            onClick={() => {
              setLinkMode(false);
              setLinkError(null);
            }}
          >
            Cancel
          </button>
          {linkError ? <span className="text-xs text-error">{linkError}</span> : null}
        </div>
      ) : null}

      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Product description"
        className="rich-editor block w-full px-4 py-3 text-body-md text-on-surface outline-none focus:bg-surface-container-low/40"
        style={{ minHeight }}
        onInput={sync}
        onBlur={sync}
      />
    </div>
  );
}
