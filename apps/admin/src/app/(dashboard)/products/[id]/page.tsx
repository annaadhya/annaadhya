"use client";
/**
 * /products/[id] — Edit Product page per the approved heritage design:
 * back link, serif "Edit Product: {name}" header with Preview / Duplicate /
 * Archive / Save actions, and the shared ProductForm in edit mode.
 */
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiDelete, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { ProductWithVariants } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import {
  ProductForm,
  buildDuplicatePayload,
  docImagesToRows,
  docVariantsToRows,
  emptyProductForm,
  emptyVariantRow,
  productDocToForm,
  type ImageRow,
  type VariantRow,
} from "@/components/products/product-form";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id ?? "";
  const router = useRouter();
  const toast = useToast();
  const { principal } = useAuth();
  const canWrite = can(principal, "products:write");
  usePageTitle("Edit Product");

  const [form, setForm] = useState(emptyProductForm);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [imageRows, setImageRows] = useState<ImageRow[]>([]);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, loading, error, reload } = useApiQuery<ProductWithVariants>(
    () => apiGet<ProductWithVariants>(`/admin/catalogue/products/${productId}`),
    [productId],
  );

  // Hydrate the editable state once per loaded product revision (not on every keystroke).
  if (data && hydratedId !== data.id) {
    setHydratedId(data.id);
    setForm(productDocToForm(data));
    setVariantRows(data.variants.length > 0 ? docVariantsToRows(data) : [emptyVariantRow()]);
    setImageRows(docImagesToRows(data));
  }

  async function archive() {
    if (!data) return;
    if (!window.confirm(`Archive ${data.sku} — ${data.name}? Archived products and their variants leave the storefront.`)) return;
    setArchiving(true);
    try {
      await apiDelete(`/admin/catalogue/products/${data.id}`);
      toast.success("Product archived", data.sku);
      router.push("/products");
    } catch (err) {
      toast.error("Could not archive product", err instanceof ApiError ? err.message : "Unexpected error");
      setArchiving(false);
    }
  }

  async function duplicate() {
    if (!data) return;
    setDuplicating(true);
    try {
      const created = await apiPost<ProductWithVariants>("/admin/catalogue/products", buildDuplicatePayload(data));
      toast.success("Draft copy created", `${created.sku} — review and publish when ready`);
      router.push(`/products/${created.id}`);
    } catch (err) {
      toast.error("Could not duplicate product", err instanceof ApiError ? err.message : "Unexpected error");
      setDuplicating(false);
    }
  }

  function openDelete() {
    setDeleteOpen(true);
    setDeleteConfirm("");
    setDeleteError(null);
  }

  /** Hard delete — hits the purge endpoint; the product + its variants are erased for
   *  good. A 409 (active checkout reservation) is shown inline so the admin can retry
   *  after the reservation expires; every other failure surfaces as a toast. */
  async function purge() {
    if (!data) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiDelete<{ deleted: true; variantsDeleted: number }>(
        `/admin/catalogue/products/${data.id}/purge`,
      );
      toast.success(
        "Product permanently deleted",
        `${data.sku} and ${res.variantsDeleted} variant${res.variantsDeleted === 1 ? "" : "s"} erased — past orders keep their snapshots.`,
      );
      setDeleteOpen(false);
      router.push("/products");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(err.message);
      } else {
        toast.error("Could not delete product", err instanceof ApiError ? err.message : "Unexpected error");
        setDeleteOpen(false);
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <TableSkeleton rows={10} cols={4} />
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <Card>
          <ErrorState message={error?.message ?? "Product not found"} status={error?.status} onRetry={reload} />
        </Card>
      </div>
    );
  }

  const storefrontHref =
    data.status === "published" && data.slug && typeof window !== "undefined"
      ? `${window.location.origin}/product/${data.slug}`
      : null;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/products"
        className="group mb-2 inline-flex items-center gap-1.5 text-label-md font-semibold text-on-surface-variant transition-colors hover:text-primary"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
        </svg>
        Back to Products
      </Link>
      <PageHeader
        title={`Edit Product: ${data.name}`}
        description={
          <>
            Update harvest provenance, package variants, tiered pricing, batch inventory and storefront visibility.{" "}
            <span className="font-mono text-xs">{data.sku}</span> · {data.variants.length} variant
            {data.variants.length === 1 ? "" : "s"}
            {data.isDemo ? " · demo record" : ""}
          </>
        }
        actions={
          <>
            {storefrontHref ? (
              <a href={storefrontHref} target="_blank" rel="noreferrer">
                <Button variant="outline">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  </svg>
                  Preview
                </Button>
              </a>
            ) : (
              <Button
                variant="outline"
                disabled
                title={data.status === "published" ? "Save to generate the storefront slug first" : "Only published products are on the storefront"}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                </svg>
                Preview
              </Button>
            )}
            {canWrite ? (
              <Button variant="outline" onClick={() => void duplicate()} loading={duplicating}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 8h12v12H8zM4 16V4h12" />
                </svg>
                Duplicate
              </Button>
            ) : null}
            {canWrite && data.status !== "archived" ? (
              <Button variant="outline" className="text-error hover:bg-error-container/40" onClick={() => void archive()} loading={archiving}>
                Archive
              </Button>
            ) : null}
            {canWrite ? (
              <Button variant="danger" onClick={openDelete}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
                Delete
              </Button>
            ) : null}
            {canWrite ? (
              <Button type="submit" form="product-form">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12 5 5L20 7" />
                </svg>
                Save Changes
              </Button>
            ) : null}
          </>
        }
      />
      {canWrite ? (
        <ProductForm
          mode="edit"
          productId={data.id}
          hydrationKey={`${data.id}:${data.updatedAt}`}
          form={form}
          setForm={setForm}
          variantRows={variantRows}
          setVariantRows={setVariantRows}
          imageRows={imageRows}
          setImageRows={setImageRows}
          onSaved={() => {
            setHydratedId(null); // re-hydrate from the fresh doc on next render
            reload();
          }}
        />
      ) : (
        <Card className="p-6 text-body-sm text-on-surface-variant">
          You have <strong>products:read</strong> only — the edit form is hidden. Ask an owner for <strong>products:write</strong> to make changes.
        </Card>
      )}

      {/* Permanent delete confirmation — type the SKU to unlock. Archive is reversible;
          this is not, so the guard is stronger than a plain confirm(). */}
      <Dialog
        open={deleteOpen}
        onClose={deleting ? () => undefined : () => setDeleteOpen(false)}
        title="Delete this product permanently?"
        description="Deletion is irreversible — archive keeps the record, this erases it."
      >
        {data ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2.5 text-sm">
              <p className="font-semibold text-on-surface">{data.name}</p>
              <p className="mt-0.5 font-mono text-xs text-on-surface-variant">{data.sku}</p>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface-variant">
              <li>
                The product and its <strong>{data.variants.length}</strong> variant{data.variants.length === 1 ? "" : "s"} are erased from the catalogue entirely.
              </li>
              <li>Past orders are untouched — they keep the name, SKU and price frozen at purchase time.</li>
              <li>Product images stay on disk; nothing on the storefront can serve them once the product is gone.</li>
              <li>Blocked while a customer checkout holds this product&#39;s stock — retry in a few minutes if the server says so.</li>
            </ul>
            {deleteError ? (
              <div className="rounded-lg border border-tertiary-fixed-dim/60 bg-tertiary-fixed/30 px-3 py-2.5 text-sm font-semibold text-on-tertiary-fixed">
                {deleteError}
              </div>
            ) : null}
            <div>
              <label htmlFor="delete-confirm-sku" className="mb-1.5 block text-xs font-semibold text-on-surface-variant">
                Type <span className="font-mono text-on-surface">{data.sku}</span> to confirm
              </label>
              <input
                id="delete-confirm-sku"
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={data.sku}
                autoComplete="off"
                disabled={deleting}
                className="w-full rounded-lg bg-surface-container-low px-3 py-2.5 font-mono text-[13px] text-on-surface shadow-inner placeholder:text-on-surface-variant/60 focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-error"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={deleting}
                disabled={deleteConfirm.trim().toUpperCase() !== data.sku.trim().toUpperCase()}
                onClick={() => void purge()}
              >
                Delete forever
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
