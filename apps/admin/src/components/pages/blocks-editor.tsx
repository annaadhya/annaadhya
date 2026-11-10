"use client";
/**
 * Document content editor for the Pages console — sections + typed blocks.
 *
 * Faithful to the server contract (packages/contracts …/dto/admin.ts):
 *  - maxlengths below ARE the server's zod limits (heading 500, paragraph 8000,
 *    list item text 2000 …) so a saved draft never bounces with a validation
 *    error the UI could have caught.
 *  - inline markup (**bold**, *italic*, [label](/href)) is shown as raw text —
 *    the storefront renders it; the editor never fakes the render.
 *  - shippingTiers has no fields: it renders live shipping figures from store
 *    settings, so the editor shows the current live figures as a hint instead.
 */
import { useState } from "react";
import type { CmsDocumentBlock, CmsSection } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/form";
import { MediaUploader } from "@/components/products/media-uploader";
import {
  BLOCK_LIMITS,
  BLOCK_TYPE_OPTIONS,
  blockTypeLabel,
  emptyBlock,
  type DocumentBlockType,
} from "./page-shared";
import { IconArrowDown, IconArrowUp, IconTrash } from "./icons";

/** Live shipping figures passed down for the shippingTiers block hint. */
export interface ShippingFigures {
  mode: "flat_rate" | "free_shipping" | "disabled";
  flatLabel: string;
  freeAboveLabel: string | null;
}

interface EditorCtx {
  disabled: boolean;
  shipping: ShippingFigures | null;
}

/* ------------------------------ tiny primitives ----------------------------- */

function MiniField({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="label-tracked text-on-surface-variant">{label}</span>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-ink/50">{hint}</p> : null}
    </div>
  );
}

function RowShell({
  title,
  onUp,
  onDown,
  onRemove,
  upDisabled,
  downDisabled,
  children,
}: {
  title: string;
  onUp?: () => void;
  onDown?: () => void;
  onRemove?: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low/60">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/30 px-3 py-2">
        <span className="label-tracked text-on-surface-variant">{title}</span>
        <div className="flex items-center gap-1">
          {onUp ? (
            <button
              type="button"
              aria-label={`Move ${title} up`}
              disabled={upDisabled}
              onClick={onUp}
              className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconArrowUp className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onDown ? (
            <button
              type="button"
              aria-label={`Move ${title} down`}
              disabled={downDisabled}
              onClick={onDown}
              className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconArrowDown className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              aria-label={`Remove ${title}`}
              onClick={onRemove}
              className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="space-y-3 px-3 py-3">{children}</div>
    </div>
  );
}

function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}

/* ------------------------------ item editors ------------------------------- */

function ListItemsEditor({
  block,
  onChange,
  disabled,
}: {
  block: Extract<CmsDocumentBlock, { type: "list" }>;
  onChange: (next: CmsDocumentBlock) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <Checkbox
          label="Numbered list"
          checked={block.ordered ?? false}
          disabled={disabled}
          onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
        />
        <div className="w-40">
          <MiniField label="Bullet style">
            <Select
              aria-label="List bullet style"
              className="h-9 py-0 text-[13px]"
              value={block.icon ?? "none"}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                onChange({ ...block, icon: v === "none" ? undefined : (v as "check" | "plain") });
              }}
            >
              <option value="none">None (dot)</option>
              <option value="check">Check mark</option>
              <option value="plain">Plain dot</option>
            </Select>
          </MiniField>
        </div>
      </div>
      {block.items.map((item, idx) => (
        <RowShell
          key={idx}
          title={`Item ${idx + 1}`}
          onUp={() => onChange({ ...block, items: move(block.items, idx, -1) })}
          onDown={() => onChange({ ...block, items: move(block.items, idx, 1) })}
          upDisabled={idx === 0}
          downDisabled={idx === block.items.length - 1}
          onRemove={block.items.length > 1 ? () => onChange({ ...block, items: block.items.filter((_, i) => i !== idx) }) : undefined}
        >
          <MiniField label="Title (optional)">
            <Input
              className="h-9 text-[13px]"
              value={item.title ?? ""}
              maxLength={200}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...block,
                  items: block.items.map((it, i) => (i === idx ? { ...it, title: e.target.value || undefined } : it)),
                })
              }
              placeholder="e.g. Single-origin honey"
            />
          </MiniField>
          <MiniField label="Text">
            <Textarea
              className="text-[13px]"
              rows={2}
              value={item.text}
              maxLength={2000}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...block, items: block.items.map((it, i) => (i === idx ? { ...it, text: e.target.value } : it)) })
              }
            />
          </MiniField>
        </RowShell>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || block.items.length >= 40}
        onClick={() => onChange({ ...block, items: [...block.items, { text: "" }] })}
      >
        + Add item
      </Button>
    </div>
  );
}

function CardsItemsEditor({
  block,
  onChange,
  disabled,
}: {
  block: Extract<CmsDocumentBlock, { type: "cards" }>;
  onChange: (next: CmsDocumentBlock) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="w-40">
        <MiniField label="Columns">
          <Select
            aria-label="Cards columns"
            className="h-9 py-0 text-[13px]"
            value={String(block.cols ?? 3)}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, cols: Number(e.target.value) === 2 ? 2 : 3 })}
          >
            <option value="2">2 columns</option>
            <option value="3">3 columns</option>
          </Select>
        </MiniField>
      </div>
      {block.items.map((item, idx) => (
        <RowShell
          key={idx}
          title={`Card ${idx + 1}`}
          onUp={() => onChange({ ...block, items: move(block.items, idx, -1) })}
          onDown={() => onChange({ ...block, items: move(block.items, idx, 1) })}
          upDisabled={idx === 0}
          downDisabled={idx === block.items.length - 1}
          onRemove={block.items.length > 1 ? () => onChange({ ...block, items: block.items.filter((_, i) => i !== idx) }) : undefined}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <MiniField label="Title">
              <Input
                className="h-9 text-[13px]"
                value={item.title}
                maxLength={200}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...block, items: block.items.map((it, i) => (i === idx ? { ...it, title: e.target.value } : it)) })
                }
              />
            </MiniField>
            <MiniField label="Icon (optional)">
              <Input
                className="h-9 text-[13px]"
                value={item.icon ?? ""}
                maxLength={40}
                disabled={disabled}
                placeholder="e.g. 🍯"
                onChange={(e) =>
                  onChange({
                    ...block,
                    items: block.items.map((it, i) => (i === idx ? { ...it, icon: e.target.value || undefined } : it)),
                  })
                }
              />
            </MiniField>
          </div>
          <MiniField label="Text">
            <Textarea
              className="text-[13px]"
              rows={2}
              value={item.text}
              maxLength={1200}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...block, items: block.items.map((it, i) => (i === idx ? { ...it, text: e.target.value } : it)) })
              }
            />
          </MiniField>
        </RowShell>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || block.items.length >= 12}
        onClick={() => onChange({ ...block, items: [...block.items, { title: "", text: "" }] })}
      >
        + Add card
      </Button>
    </div>
  );
}

function StepsItemsEditor({
  block,
  onChange,
  disabled,
}: {
  block: Extract<CmsDocumentBlock, { type: "steps" }>;
  onChange: (next: CmsDocumentBlock) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniField label="Title">
          <Input
            className="h-9 text-[13px]"
            value={block.title}
            maxLength={200}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
          />
        </MiniField>
        <MiniField label="Intro">
          <Input
            className="h-9 text-[13px]"
            value={block.intro}
            maxLength={1000}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, intro: e.target.value })}
          />
        </MiniField>
      </div>
      {block.items.map((item, idx) => (
        <RowShell
          key={idx}
          title={`Step ${idx + 1}`}
          onUp={() => onChange({ ...block, items: move(block.items, idx, -1) })}
          onDown={() => onChange({ ...block, items: move(block.items, idx, 1) })}
          upDisabled={idx === 0}
          downDisabled={idx === block.items.length - 1}
          onRemove={block.items.length > 1 ? () => onChange({ ...block, items: block.items.filter((_, i) => i !== idx) }) : undefined}
        >
          <MiniField label="Label">
            <Input
              className="h-9 text-[13px]"
              value={item.label}
              maxLength={160}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...block, items: block.items.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it)) })
              }
            />
          </MiniField>
          <MiniField label="Text">
            <Textarea
              className="text-[13px]"
              rows={2}
              value={item.text}
              maxLength={1200}
              disabled={disabled}
              onChange={(e) =>
                onChange({ ...block, items: block.items.map((it, i) => (i === idx ? { ...it, text: e.target.value } : it)) })
              }
            />
          </MiniField>
        </RowShell>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || block.items.length >= 12}
        onClick={() => onChange({ ...block, items: [...block.items, { label: "", text: "" }] })}
      >
        + Add step
      </Button>
    </div>
  );
}

function TableEditor({
  block,
  onChange,
  disabled,
}: {
  block: Extract<CmsDocumentBlock, { type: "table" }>;
  onChange: (next: CmsDocumentBlock) => void;
  disabled: boolean;
}) {
  const headValue = block.head.join(", ");
  return (
    <div className="space-y-3">
      <MiniField label="Header columns" hint="Comma-separated, 1–8 columns. Cells cannot contain commas.">
        <Input
          className="h-9 text-[13px]"
          value={headValue}
          disabled={disabled}
          onChange={(e) => {
            const head = e.target.value.split(",").map((c) => c.trim());
            onChange({ ...block, head });
          }}
          placeholder="Pack size, Price, Ships in"
        />
      </MiniField>
      {block.rows.map((row, idx) => (
        <div key={idx} className="flex items-end gap-2">
          <MiniField label={`Row ${idx + 1}`} className="flex-1">
            <Input
              className="h-9 text-[13px]"
              value={row.join(", ")}
              disabled={disabled}
              onChange={(e) => {
                const cells = e.target.value.split(",").map((c) => c.trim());
                onChange({ ...block, rows: block.rows.map((r, i) => (i === idx ? cells : r)) });
              }}
            />
          </MiniField>
          <div className="flex gap-1 pb-0.5">
            <button
              type="button"
              aria-label={`Move row ${idx + 1} up`}
              disabled={disabled || idx === 0}
              onClick={() => onChange({ ...block, rows: move(block.rows, idx, -1) })}
              className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm hover:text-primary disabled:opacity-40"
            >
              <IconArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Move row ${idx + 1} down`}
              disabled={disabled || idx === block.rows.length - 1}
              onClick={() => onChange({ ...block, rows: move(block.rows, idx, 1) })}
              className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm hover:text-primary disabled:opacity-40"
            >
              <IconArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Remove row ${idx + 1}`}
              disabled={disabled}
              onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== idx) })}
              className="rounded-md bg-surface-container-lowest p-1.5 text-on-surface-variant shadow-sm hover:text-error disabled:opacity-40"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || block.rows.length >= 60}
          onClick={() => onChange({ ...block, rows: [...block.rows, block.head.map(() => "")] })}
        >
          + Add row
        </Button>
      </div>
      <MiniField label="Footnote (optional)">
        <Input
          className="h-9 text-[13px]"
          value={block.footnote ?? ""}
          maxLength={400}
          disabled={disabled}
          onChange={(e) => onChange({ ...block, footnote: e.target.value || undefined })}
        />
      </MiniField>
    </div>
  );
}

/* -------------------------------- block card ------------------------------- */

function BlockCard({
  block,
  onChange,
  ctx,
}: {
  block: CmsDocumentBlock;
  onChange: (next: CmsDocumentBlock) => void;
  ctx: EditorCtx;
}) {
  const { disabled, shipping } = ctx;
  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <MiniField label="Heading text">
            <Input
              className="h-9 text-[13px]"
              value={block.text}
              maxLength={BLOCK_LIMITS.heading}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          </MiniField>
          <MiniField label="Level">
            <Select
              aria-label="Heading level"
              className="h-9 py-0 text-[13px]"
              value={String(block.level ?? 2)}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, level: Number(e.target.value) === 3 ? 3 : 2 })}
            >
              <option value="2">H2</option>
              <option value="3">H3</option>
            </Select>
          </MiniField>
        </div>
      );
    case "paragraph":
      return (
        <MiniField label="Paragraph" hint="Supports **bold**, *italic* and [label](/href) inline markup — shown as typed here, rendered on the storefront.">
          <Textarea
            className="text-[13px]"
            rows={4}
            value={block.text}
            maxLength={BLOCK_LIMITS.paragraph}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </MiniField>
      );
    case "list":
      return <ListItemsEditor block={block} onChange={onChange} disabled={disabled} />;
    case "cards":
      return <CardsItemsEditor block={block} onChange={onChange} disabled={disabled} />;
    case "note":
      return (
        <div className="space-y-3">
          <MiniField label="Title (optional)">
            <Input
              className="h-9 text-[13px]"
              value={block.title ?? ""}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, title: e.target.value || undefined })}
            />
          </MiniField>
          <MiniField label="Text">
            <Textarea
              className="text-[13px]"
              rows={3}
              value={block.text}
              maxLength={2000}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          </MiniField>
        </div>
      );
    case "table":
      return <TableEditor block={block} onChange={onChange} disabled={disabled} />;
    case "steps":
      return <StepsItemsEditor block={block} onChange={onChange} disabled={disabled} />;
    case "banner":
      return (
        <div className="space-y-3">
          <MiniField label="Title">
            <Input
              className="h-9 text-[13px]"
              value={block.title}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
            />
          </MiniField>
          <MiniField label="Text">
            <Textarea
              className="text-[13px]"
              rows={3}
              value={block.text}
              maxLength={1200}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          </MiniField>
        </div>
      );
    case "quote":
      return (
        <div className="space-y-3">
          <MiniField label="Quote text">
            <Textarea
              className="text-[13px]"
              rows={3}
              value={block.text}
              maxLength={1200}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
            />
          </MiniField>
          <MiniField label="Attribution (optional)">
            <Input
              className="h-9 text-[13px]"
              value={block.attribution ?? ""}
              maxLength={160}
              disabled={disabled}
              placeholder="e.g. The Annaadhya kitchen"
              onChange={(e) => onChange({ ...block, attribution: e.target.value || undefined })}
            />
          </MiniField>
        </div>
      );
    case "image":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <MiniField label="Image URL" hint="Absolute https://… URL (Cloudinary) or a site-rooted /… path.">
              <Input
                className="h-9 font-mono text-xs"
                value={block.src}
                maxLength={600}
                disabled={disabled}
                onChange={(e) => onChange({ ...block, src: e.target.value })}
              />
            </MiniField>
            <MediaUploader onUploaded={(media) => onChange({ ...block, src: media.url })} disabled={disabled}>
              Upload image
            </MediaUploader>
          </div>
          <MiniField label="Alt text" hint="Required — screen readers and the storefront both use it.">
            <Input
              className="h-9 text-[13px]"
              value={block.alt}
              maxLength={BLOCK_LIMITS.imageAlt}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, alt: e.target.value })}
            />
          </MiniField>
          <MiniField label="Caption (optional)">
            <Input
              className="h-9 text-[13px]"
              value={block.caption ?? ""}
              maxLength={BLOCK_LIMITS.imageCaption}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
            />
          </MiniField>
        </div>
      );
    case "cta":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniField label="Button label">
            <Input
              className="h-9 text-[13px]"
              value={block.label}
              maxLength={80}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
            />
          </MiniField>
          <MiniField label="Destination" hint="A site path (/shop) or an absolute http(s) URL.">
            <Input
              className="h-9 font-mono text-xs"
              value={block.href}
              maxLength={600}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, href: e.target.value })}
            />
          </MiniField>
          <MiniField label="Note (optional)" className="sm:col-span-2">
            <Input
              className="h-9 text-[13px]"
              value={block.note ?? ""}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => onChange({ ...block, note: e.target.value || undefined })}
            />
          </MiniField>
        </div>
      );
    case "divider":
      return (
        <p className="text-xs italic text-on-surface-variant">
          A thin horizontal rule — no fields. The storefront renders a gold-tinted divider line.
        </p>
      );
    case "shippingTiers":
      return (
        <div className="space-y-1.5 text-xs text-on-surface-variant">
          <p>
            No fields — the storefront renders the <strong>live shipping figures</strong> from store settings (Settings ›
            Shipping). Shown in the preview as they appear today:
          </p>
          <p className="rounded-md bg-surface-container px-2.5 py-1.5 font-medium text-on-surface">
            {shipping
              ? shipping.mode === "disabled"
                ? "Shipping currently disabled in settings"
                : shipping.mode === "free_shipping"
                  ? "Standard delivery: Free"
                  : `Standard delivery: ${shipping.flatLabel}${shipping.freeAboveLabel ? ` · Free shipping: ${shipping.freeAboveLabel}` : ""}`
              : "Loading live shipping settings…"}
          </p>
        </div>
      );
  }
}

/* ------------------------------ add-block select ---------------------------- */

function AddBlockSelect({ onAdd, disabled }: { onAdd: (type: DocumentBlockType) => void; disabled: boolean }) {
  const [value, setValue] = useState("");
  return (
    <Select
      aria-label="Add a block"
      className="h-9 w-full py-0 text-xs font-semibold sm:w-64"
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const v = e.target.value as DocumentBlockType | "";
        if (v) {
          onAdd(v);
          setValue("");
        }
      }}
    >
      <option value="">+ Add block…</option>
      {BLOCK_TYPE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}


/* ------------------------------- section card ------------------------------- */

function SectionCard({
  section,
  index,
  total,
  ctx,
  highlighted = false,
  onSectionChange,
  onMove,
  onRemove,
}: {
  section: CmsSection;
  index: number;
  total: number;
  ctx: EditorCtx;
  /** True while the admin navigated here from the preview pane — a short ring
   *  flash marks the card they landed on. */
  highlighted?: boolean;
  onSectionChange: (next: CmsSection) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { disabled } = ctx;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const blocks = section.blocks ?? [];

  function setBlock(blockIdx: number, next: CmsDocumentBlock) {
    onSectionChange({ ...section, blocks: blocks.map((b, i) => (i === blockIdx ? next : b)) });
  }

  return (
    <div
      id={`page-section-${index}`}
      className={`scroll-mt-28 rounded-2xl border bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)] transition-shadow ${
        highlighted ? "border-primary/60 ring-2 ring-primary/40" : "border-outline-variant/50"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
            {index + 1}
          </span>
          <p className="max-w-[16rem] truncate text-[13px] font-semibold text-on-surface">
            {section.title || `Section ${index + 1}`}
          </p>
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
            {blocks.length} block{blocks.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Move section ${index + 1} up`}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
            className="rounded-md bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Move section ${index + 1} down`}
            disabled={disabled || index === total - 1}
            onClick={() => onMove(1)}
            className="rounded-md bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Remove section ${index + 1}`}
            disabled={disabled}
            onClick={() => setConfirmRemove(true)}
            className="rounded-md bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </div>

      {confirmRemove ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-error/20 bg-error-container/40 px-4 py-2.5">
          <p className="text-xs font-semibold text-on-error-container">
            Remove this section and its {blocks.length} block{blocks.length === 1 ? "" : "s"}? The removal becomes permanent
            when the page is saved.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)} disabled={disabled}>
              Keep section
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirmRemove(false);
                onRemove();
              }}
              disabled={disabled}
            >
              Remove section
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniField label="Anchor id (optional)" hint="lowercase-with-dashes — TOC anchor target.">
            <Input
              className="h-9 font-mono text-xs"
              value={section.id ?? ""}
              maxLength={BLOCK_LIMITS.sectionId}
              disabled={disabled}
              onChange={(e) => onSectionChange({ ...section, id: e.target.value || undefined })}
            />
          </MiniField>
          <MiniField label="Eyebrow (optional)">
            <Input
              className="h-9 text-[13px]"
              value={section.eyebrow ?? ""}
              maxLength={BLOCK_LIMITS.sectionEyebrow}
              disabled={disabled}
              onChange={(e) => onSectionChange({ ...section, eyebrow: e.target.value || undefined })}
            />
          </MiniField>
          <MiniField label="Section title (optional)">
            <Input
              className="h-9 text-[13px]"
              value={section.title ?? ""}
              maxLength={BLOCK_LIMITS.sectionTitle}
              disabled={disabled}
              onChange={(e) => onSectionChange({ ...section, title: e.target.value || undefined })}
            />
          </MiniField>
          <MiniField label="TOC label (optional)" hint="Short label used in the table of contents.">
            <Input
              className="h-9 text-[13px]"
              value={section.toc ?? ""}
              maxLength={BLOCK_LIMITS.sectionToc}
              disabled={disabled}
              onChange={(e) => onSectionChange({ ...section, toc: e.target.value || undefined })}
            />
          </MiniField>
        </div>

        <div className="space-y-3">
          {blocks.map((block, blockIdx) => (
            <RowShell
              key={blockIdx}
              title={`Block ${blockIdx + 1} · ${blockTypeLabel(block.type)}`}
              onUp={() => onSectionChange({ ...section, blocks: move(blocks, blockIdx, -1) })}
              onDown={() => onSectionChange({ ...section, blocks: move(blocks, blockIdx, 1) })}
              upDisabled={blockIdx === 0}
              downDisabled={blockIdx === blocks.length - 1}
              onRemove={() => onSectionChange({ ...section, blocks: blocks.filter((_, i) => i !== blockIdx) })}
            >
              <BlockCard block={block} onChange={(next) => setBlock(blockIdx, next)} ctx={ctx} />
            </RowShell>
          ))}
          {blocks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-outline-variant/60 px-3 py-4 text-center text-xs text-on-surface-variant">
              Empty section — add a block below, or remove the section if it isn&apos;t needed.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <AddBlockSelect
            disabled={disabled || blocks.length >= 120}
            onAdd={(type) => onSectionChange({ ...section, blocks: [...blocks, emptyBlock(type)] })}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- main editor -------------------------------- */

/**
 * Sections list for `kind: "document"` pages. Fully controlled: the page keeps
 * `CmsSection[]` state and applies whole-array updates from here.
 */
export function DocumentSectionsEditor({
  sections,
  onChange,
  disabled = false,
  shipping,
  highlightIndex = null,
}: {
  sections: CmsSection[];
  onChange: (sections: CmsSection[]) => void;
  disabled?: boolean;
  shipping: ShippingFigures | null;
  /** Section card currently flashed by a preview-pane navigation. */
  highlightIndex?: number | null;
}) {
  const ctx: EditorCtx = { disabled, shipping };

  function setSection(index: number, next: CmsSection) {
    onChange(sections.map((s, i) => (i === index ? next : s)));
  }

  return (
    <div className="space-y-4">
      {sections.map((section, index) => (
        <SectionCard
          key={index}
          section={section}
          index={index}
          total={sections.length}
          ctx={ctx}
          highlighted={highlightIndex === index}
          onSectionChange={(next) => setSection(index, next)}
          onMove={(dir) => onChange(move(sections, index, dir))}
          onRemove={() => onChange(sections.filter((_, i) => i !== index))}
        />
      ))}
      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant/60 px-4 py-6 text-center text-sm text-on-surface-variant">
          No sections yet — add the first one below.
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || sections.length >= 30}
          onClick={() => onChange([...sections, { blocks: [] }])}
        >
          + Add section
        </Button>
      </div>
    </div>
  );
}
