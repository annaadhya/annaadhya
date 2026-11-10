"use client";
/**
 * Right-hand sidebar column of the product Add/Edit form per the Stitch design:
 * Publishing Status (radio cards + merchandising), Inventory Matrix (live summary
 * of the variant rows), Compliance & Statutory details, and the Customer
 * Storefront Card (live render of the form data).
 *
 * Every control maps to a real persisted field. Prototype-only controls from the
 * reference (Storefront Search Visibility, Auto-Track Inventory, Backorders
 * Policy, free-tag collections) have no backend and are intentionally omitted.
 */
import { formatINR } from "@/lib/format";
import type { ProductStatus } from "@/lib/types";
import type { VariantRow } from "./product-form";
import { HeritageField, HeritageInput, StatusRadioCards } from "./form-fields";

/* --------------------------- 1. publishing status --------------------------- */

export function PublishingCard({
  status,
  onStatus,
  giftItem,
  onGiftItem,
  searchVisible,
  onSearchVisible,
  featuredRank,
  onFeaturedRank,
  bestsellerRank,
  onBestsellerRank,
  disabled,
}: {
  status: ProductStatus;
  onStatus: (next: ProductStatus) => void;
  giftItem: boolean;
  onGiftItem: (next: boolean) => void;
  searchVisible: boolean;
  onSearchVisible: (next: boolean) => void;
  featuredRank: string;
  onFeaturedRank: (next: string) => void;
  bestsellerRank: string;
  onBestsellerRank: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.04)] sm:p-6">
      <div className="mb-3 flex items-center justify-between pb-1">
        <h3 className="font-heritage-display text-headline-sm font-medium text-on-surface">Publishing Status</h3>
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${status === "published" ? "bg-secondary" : status === "draft" ? "bg-tertiary-fixed-dim" : "bg-outline"}`} />
      </div>

      <StatusRadioCards
        name="prod_status"
        value={status}
        disabled={disabled}
        onChange={(v) => onStatus(v as ProductStatus)}
        options={[
          { value: "published", title: "Active • Published", badge: "Live", description: "Visible, indexed in the catalog and purchasable." },
          { value: "draft", title: "Draft Staging", description: "Hidden from customers while updating copy or testing." },
          { value: "archived", title: "Archived", description: "Permanently de-listed and removed from the storefront." },
        ]}
      />

      <div className="mt-4 space-y-3 border-t border-outline-variant/40 pt-4">
        {/* Real collection flags: giftItem drives the storefront gifts collection. */}
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-label-md font-semibold text-on-surface">
            Gifts &amp; Festive Sets collection
            <span className="block text-xs font-normal text-on-surface-variant">Shows the product in the storefront gifts collection.</span>
          </span>
          <input type="checkbox" checked={giftItem} disabled={disabled} onChange={(e) => onGiftItem(e.target.checked)} className="h-4 w-4 shrink-0 accent-primary" />
        </label>

        {/* Storefront Search Visibility — enforced by the API catalogue search filter. */}
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-label-md font-semibold text-on-surface">
            Storefront search visibility
            <span className="block text-xs font-normal text-on-surface-variant">
              {searchVisible ? "Product appears in storefront search results." : "Hidden from search — still reachable via category pages and direct links."}
            </span>
          </span>
          <input
            type="checkbox"
            checked={searchVisible}
            disabled={disabled}
            onChange={(e) => onSearchVisible(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <HeritageField
            label="Featured rank"
            hint="1 = first in featured"
          >
            <HeritageInput
              type="number"
              min={1}
              max={1000}
              value={featuredRank}
              disabled={disabled}
              onChange={(e) => onFeaturedRank(e.target.value)}
              placeholder="—"
              className="h-9 px-3 text-body-sm"
            />
          </HeritageField>
          <HeritageField
            label="Bestseller rank"
            hint="1 = first in bestsellers"
          >
            <HeritageInput
              type="number"
              min={1}
              max={1000}
              value={bestsellerRank}
              disabled={disabled}
              onChange={(e) => onBestsellerRank(e.target.value)}
              placeholder="—"
              className="h-9 px-3 text-body-sm"
            />
          </HeritageField>
        </div>
        <p className="text-xs text-outline">
          Ranks drive the storefront&apos;s Featured and Bestsellers rails. Leave blank to keep the product out of both.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------- 2. inventory matrix --------------------------- */

export function InventoryCard({
  variantRows,
  trackInventory = true,
  onTrackInventory,
  backorderPolicy = "deny",
  onBackorderPolicy,
}: {
  variantRows: VariantRow[];
  trackInventory?: boolean;
  onTrackInventory?: (next: boolean) => void;
  backorderPolicy?: "deny" | "allow" | "notify";
  onBackorderPolicy?: (next: "deny" | "allow" | "notify") => void;
}) {
  const onHand = variantRows.reduce((sum, r) => {
    const n = Number(r.stockOnHand || "0");
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const skuCount = variantRows.filter((r) => r.sku.trim() !== "").length;
  const flagged = variantRows.filter((r) => {
    const stock = Number(r.stockOnHand || "0");
    const threshold = Number(r.lowStockThreshold || "0");
    return Number.isFinite(stock) && Number.isFinite(threshold) && stock > 0 && stock <= threshold;
  });

  return (
    <div className="rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.04)] sm:p-6">
      <div className="mb-3 flex items-center justify-between pb-1">
        <h3 className="font-heritage-display text-headline-sm font-medium text-on-surface">Inventory Matrix</h3>
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-outline" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8V6a6 6 0 0 1 12 0v2M4 8h16l-1 13H5L4 8Z" />
        </svg>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-lg bg-surface-container-low p-3">
        <div className="flex flex-col">
          <span className="label-eyebrow text-outline">On Hand Across Variants</span>
          <span className="font-heritage-display text-headline-md font-semibold text-primary">
            {onHand} <span className="text-body-sm text-on-surface-variant">units</span>
          </span>
        </div>
        <span className="rounded-full bg-secondary-container px-2.5 py-1 text-label-sm font-semibold text-on-secondary-container">
          Across {skuCount} SKU{skuCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Auto-Track Inventory + Backorders Policy — enforced by the checkout service. */}
      <div className="mb-4 space-y-3 rounded-lg bg-surface-container-low p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="text-label-md font-semibold text-on-surface">
            Auto-track inventory
            <span className="block text-xs font-normal text-on-surface-variant">
              {trackInventory
                ? "Stock is reserved on checkout and decremented on payment."
                : "Sold without stock limits — stock fields and low-stock alerts are ignored."}
            </span>
          </span>
          <input
            type="checkbox"
            checked={trackInventory}
            disabled={!onTrackInventory}
            onChange={(e) => onTrackInventory?.(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary"
          />
        </label>
        <label className="block">
          <span className="label-eyebrow text-outline">Backorders policy</span>
          <select
            value={backorderPolicy}
            disabled={!onBackorderPolicy || !trackInventory}
            onChange={(e) => onBackorderPolicy?.(e.target.value as "deny" | "allow" | "notify")}
            className="mt-1 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-body-sm text-on-surface outline-none focus:border-primary disabled:opacity-55"
          >
            <option value="deny">Stop sales when stock runs out (default)</option>
            <option value="allow">Keep selling — fulfil the shortfall after restock</option>
            <option value="notify">Keep selling and flag the shortfall on the order</option>
          </select>
          <span className="mt-1 block text-xs font-normal text-on-surface-variant">
            {trackInventory
              ? backorderPolicy === "deny"
                ? "Sales stop when available stock hits zero."
                : "Orders past stock record the uncovered quantity for fulfilment after restock."
              : "Only applies when auto-track inventory is on."}
          </span>
        </label>
      </div>

      <div className="space-y-2">
        {variantRows.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">Add variants to see live stock levels.</p>
        ) : null}
        {variantRows.map((r, i) => {
          const stock = Number(r.stockOnHand || "0");
          const threshold = Number(r.lowStockThreshold || "0");
          const low = Number.isFinite(stock) && Number.isFinite(threshold) && stock > 0 && stock <= threshold;
          const out = !Number.isFinite(stock) || stock <= 0;
          return (
            <div key={r.key} className="flex items-center justify-between gap-2 text-body-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${out ? "bg-error" : low ? "bg-tertiary-fixed-dim" : "bg-secondary"}`}
                />
                <span className="truncate text-on-surface" title={r.packLabel}>
                  {r.packLabel || `Variant ${i + 1}`}
                </span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${out ? "text-error" : low ? "text-tertiary" : "text-secondary"}`}>
                {Number.isFinite(stock) ? stock : "—"}
              </span>
            </div>
          );
        })}
        {flagged.length > 0 ? (
          <p className="pt-1 text-xs text-on-surface-variant">
            {flagged.length === 1 ? "1 variant is" : `${flagged.length} variants are`} at or below the low-stock threshold.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------- 3. compliance & statutory ------------------------ */

export interface ComplianceValues {
  netQuantityLabel: string;
  fssaiLicense: string;
  allergenInfo: string;
  manufacturerDetails: string;
}

export function ComplianceCard({
  values,
  onChange,
  disabled,
}: {
  values: ComplianceValues;
  onChange: (patch: Partial<ComplianceValues>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.04)] sm:p-6">
      <div className="mb-3 flex items-center justify-between pb-1">
        <h3 className="font-heritage-display text-headline-sm font-medium text-on-surface">Compliance &amp; Details</h3>
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-outline" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <div className="space-y-3">
        <HeritageField label="Net quantity label" hint="Printed on the pack, e.g. “Net qty: 350 g”">
          <HeritageInput
            value={values.netQuantityLabel}
            disabled={disabled}
            maxLength={80}
            onChange={(e) => onChange({ netQuantityLabel: e.target.value })}
            className="h-10 text-body-sm"
          />
        </HeritageField>
        <HeritageField label="FSSAI license" hint="Only when the business supplies it — never invented">
          <HeritageInput
            value={values.fssaiLicense}
            disabled={disabled}
            maxLength={80}
            onChange={(e) => onChange({ fssaiLicense: e.target.value })}
            className="h-10 text-body-sm"
          />
        </HeritageField>
        <HeritageField label="Allergen info">
          <HeritageInput
            value={values.allergenInfo}
            disabled={disabled}
            maxLength={500}
            onChange={(e) => onChange({ allergenInfo: e.target.value })}
            className="h-10 text-body-sm"
          />
        </HeritageField>
        <HeritageField label="Manufacturer details">
          <HeritageInput
            value={values.manufacturerDetails}
            disabled={disabled}
            maxLength={500}
            onChange={(e) => onChange({ manufacturerDetails: e.target.value })}
            className="h-10 text-body-sm"
          />
        </HeritageField>
      </div>
    </div>
  );
}

/* ------------------------- 4. storefront preview card ----------------------- */

export function StorefrontPreviewCard({
  name,
  categoryName,
  imageUrl,
  pricePaise,
  mrpPaise,
  slug,
  status,
}: {
  name: string;
  categoryName: string;
  imageUrl?: string;
  pricePaise: number | null;
  mrpPaise: number | null;
  slug: string;
  status: ProductStatus;
}) {
  const liveHref =
    status === "published" && slug && typeof window !== "undefined"
      ? `${window.location.origin}/product/${slug}`
      : null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-4 shadow-[0_1px_8px_rgba(39,24,16,0.06)] sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="label-eyebrow flex items-center gap-1 font-bold text-secondary">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8l1.5-4h13L20 8M4 8v12h16V8M4 8h16M9 20v-6h6v6" />
          </svg>
          Customer Storefront Card
        </span>
        <span className="text-[11px] text-outline">Live Render</span>
      </div>

      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="relative h-44 w-full overflow-hidden bg-surface-container">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary/remote preview, plain img keeps the admin bundle lean
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden className="flex h-full w-full items-center justify-center font-heritage-display text-3xl font-semibold text-primary/40">
              {name ? name.charAt(0).toUpperCase() : "A"}
            </span>
          )}
          {status === "published" ? (
            <span className="absolute left-2 top-2 rounded-full bg-tertiary-fixed px-2 py-0.5 text-[10px] font-bold text-on-tertiary-fixed shadow-sm">
              Live
            </span>
          ) : (
            <span className="absolute left-2 top-2 rounded-full bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold text-on-surface-variant shadow-sm">
              {status === "draft" ? "Draft" : "Archived"}
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary">{categoryName || "Uncategorised"}</p>
          <h4 className="mt-0.5 truncate font-heritage-display text-base font-semibold text-primary" title={name}>
            {name || "Untitled Heritage Item"}
          </h4>
          <div className="mt-2 flex items-center justify-between border-t border-outline-variant/30 pt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-on-surface">{pricePaise !== null ? formatINR(pricePaise) : "₹—"}</span>
              {mrpPaise !== null && mrpPaise > (pricePaise ?? 0) ? (
                <span className="text-xs text-outline line-through">{formatINR(mrpPaise)}</span>
              ) : null}
            </div>
            <span aria-hidden className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-on-primary">
              + Quick Add
            </span>
          </div>
        </div>
      </div>

      {liveHref ? (
        <a
          href={liveHref}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-label-sm font-bold text-on-primary-container transition-opacity hover:opacity-90"
        >
          Live on Storefront
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>
      ) : (
        <p className="mt-3 text-xs text-outline">
          {slug ? "Publish the product to preview it on the storefront." : "A slug is generated from the name once saved."}
        </p>
      )}
    </div>
  );
}
