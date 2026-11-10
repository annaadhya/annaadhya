"use client";
/**
 * FAQ content editor for the Pages console (`kind: "faq"` pages).
 *
 * Entries are {category, question, answer}; the seven category keys mirror the
 * storefront FAQ explorer exactly. The answer supports the same inline markup
 * as document paragraphs (**bold**, *italic*, [label](/href)) — shown raw here,
 * rendered by the storefront.
 */
import type { FaqEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { BLOCK_LIMITS, FAQ_CATEGORY_OPTIONS, emptyFaqEntry } from "./page-shared";
import { IconArrowDown, IconArrowUp, IconTrash } from "./icons";

export function FaqEntriesEditor({
  entries,
  onChange,
  disabled = false,
  highlightIndex = null,
}: {
  entries: FaqEntry[];
  onChange: (entries: FaqEntry[]) => void;
  disabled?: boolean;
  /** Entry card currently flashed by a preview-pane navigation. */
  highlightIndex?: number | null;
}) {
  function setEntry(index: number, next: FaqEntry) {
    onChange(entries.map((e, i) => (i === index ? next : e)));
  }

  function moveEntry(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= entries.length) return;
    const next = [...entries];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <div
          key={index}
          id={`page-faq-entry-${index}`}
          className={`scroll-mt-28 rounded-xl border bg-surface-container-low/60 transition-shadow ${
            highlightIndex === index ? "border-primary/60 ring-2 ring-primary/40" : "border-outline-variant/40"
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 px-3 py-2">
            <span className="label-tracked text-on-surface-variant">Entry {index + 1}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Move entry ${index + 1} up`}
                disabled={disabled || index === 0}
                onClick={() => moveEntry(index, -1)}
                className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Move entry ${index + 1} down`}
                disabled={disabled || index === entries.length - 1}
                onClick={() => moveEntry(index, 1)}
                className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Remove entry ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(entries.filter((_, i) => i !== index))}
                className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconTrash className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="space-y-3 px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="flex flex-col gap-1">
                <span className="label-tracked text-on-surface-variant">Category</span>
                <Select
                  aria-label={`Category for entry ${index + 1}`}
                  className="h-9 py-0 text-[13px]"
                  value={entry.category}
                  disabled={disabled}
                  onChange={(e) => setEntry(index, { ...entry, category: e.target.value })}
                >
                  {FAQ_CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="label-tracked text-on-surface-variant">Question</span>
                <Input
                  className="h-9 text-[13px]"
                  value={entry.question}
                  maxLength={BLOCK_LIMITS.faqQuestion}
                  disabled={disabled}
                  placeholder="e.g. How long does delivery take?"
                  onChange={(e) => setEntry(index, { ...entry, question: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="label-tracked text-on-surface-variant">Answer</span>
              <Textarea
                className="text-[13px]"
                rows={3}
                value={entry.answer}
                maxLength={BLOCK_LIMITS.faqAnswer}
                disabled={disabled}
                placeholder="Supports **bold**, *italic* and [label](/href) inline markup."
                onChange={(e) => setEntry(index, { ...entry, answer: e.target.value })}
              />
              <p className="text-[11px] leading-snug text-ink/50">
                Rendered on the storefront with inline markup — shown as typed here.
              </p>
            </div>
          </div>
        </div>
      ))}

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant/60 px-4 py-6 text-center text-sm text-on-surface-variant">
          No questions yet — add the first one below.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || entries.length >= 120}
          onClick={() => onChange([...entries, emptyFaqEntry()])}
        >
          + Add question
        </Button>
      </div>
    </div>
  );
}
