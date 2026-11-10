"use client";
/**
 * /categories — the storefront Categories console (heritage design language).
 *
 * Everything is real:
 *  - GET  /admin/catalogue/categories → every category, all statuses (drafts/archived included)
 *  - GET  /categories/overview        → PUBLIC shop overview; sellable product counts per
 *                                       published category + the reassignment picker source
 *  - POST /admin/catalogue/categories       → create
 *  - POST /admin/catalogue/categories/:id   → update (also the quick publish/unpublish +
 *                                             archive path — full row + changed status)
 *  - DELETE /admin/catalogue/categories/:id → delete; a 409 means products are still
 *                                             assigned — retry with ?reassignTo={categoryId}
 *
 * The navbar grouping of categories is Navigation console territory — deliberately not here.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiDelete, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { relativeDayTime } from "@/lib/relative-time";
import { useToast } from "@/lib/toast";
import type { CategoryDoc, ProductStatus } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import {
  IconArchive,
  IconEye,
  IconEyeOff,
  IconPublish,
  IconUnpublish,
} from "@/components/pages/icons";
import { IconCheck, IconChevronRight, IconPlus, IconSearch } from "@/components/inventory/icons";
import { IconEdit, IconTrash } from "@/components/suppliers/icons";

type StatusFilter = ProductStatus | "all";
type SortKey = "sortOrder" | "name" | "updated";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "sortOrder", label: "Sort: Manual order" },
  { value: "name", label: "Sort: Alphabetical (A–Z)" },
  { value: "updated", label: "Sort: Recently updated" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

interface CategoryOverview {
  categories: Array<CategoryDoc & { productCount: number }>;
  totalProducts: number;
}

/** Full upsert body built from a loaded row — used by quick publish/unpublish/archive. */
function upsertBodyFromRow(row: CategoryDoc, status: ProductStatus) {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    description: row.description ?? "",
    sortOrder: row.sortOrder ?? 0,
    isReady: row.isReady,
    ...(row.heroImage ? { heroImage: row.heroImage } : {}),
    status,
    ...(row.seo?.title || row.seo?.description ? { seo: row.seo } : {}),
  };
}

export default function CategoriesPage() {
  usePageTitle("Categories");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "categories:write");

  /* ------------------------------ data + filters ----------------------------- */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("sortOrder");

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data: categories, loading, error, reload } = useApiQuery<CategoryDoc[]>(
    () => apiGet<CategoryDoc[]>("/admin/catalogue/categories"),
    [],
  );

  // Public shop overview — sellable product counts + reassignment picker source.
  const { data: overview, reload: reloadOverview } = useApiQuery<CategoryOverview>(
    () => apiGet<CategoryOverview>("/categories/overview"),
    [],
  );

  const productCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of overview?.categories ?? []) map.set(c.id, c.productCount);
    return map;
  }, [overview]);

  const rows = useMemo(() => {
    const list = (categories ?? []).filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (search && !c.name.toLowerCase().includes(search) && !c.slug.includes(search)) return false;
      return true;
    });
    switch (sort) {
      case "name":
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case "updated":
        return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      default:
        return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
  }, [categories, status, search, sort]);

  const filtersActive = Boolean(search) || status !== "all";

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setSort("sortOrder");
  }

  /* ------------------------------- summary cards ------------------------------ */
  const all = categories ?? [];
  const publishedCount = all.filter((c) => c.status === "published").length;
  const hiddenCount = all.filter((c) => c.status === "published" && !c.isReady).length;
  const draftCount = all.filter((c) => c.status === "draft").length;
  const archivedCount = all.filter((c) => c.status === "archived").length;

  /* -------------------------------- overlays --------------------------------- */
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDoc | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(row: CategoryDoc) {
    setEditing(row);
    setFormOpen(true);
  }
  function handleSaved() {
    toast.success(
      editing ? "Category updated" : "Category created",
      editing ? editing.name : "It is live in the shop according to its lifecycle status.",
    );
    reload();
    reloadOverview();
  }

  /* --------------------- quick publish / unpublish / archive ------------------- */
  async function quickSetStatus(row: CategoryDoc, next: ProductStatus, verb: string) {
    setBusyId(row.id);
    try {
      await apiPost(`/admin/catalogue/categories/${row.id}`, upsertBodyFromRow(row, next));
      toast.success(verb, `${row.name} is now ${next}.`);
      reload();
      reloadOverview();
    } catch (err) {
      toast.error(`Could not ${verb.toLowerCase()}`, err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusyId(null);
    }
  }

  const [archiveTarget, setArchiveTarget] = useState<CategoryDoc | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await apiPost(`/admin/catalogue/categories/${archiveTarget.id}`, upsertBodyFromRow(archiveTarget, "archived"));
      toast.success("Category archived", `${archiveTarget.name} is retired but kept — publish it again to restore.`);
      setArchiveTarget(null);
      reload();
      reloadOverview();
    } catch (err) {
      toast.error("Could not archive the category", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setArchiving(false);
    }
  }

  /* ---------------------------- delete + reassignment -------------------------- */
  const [deleteTarget, setDeleteTarget] = useState<CategoryDoc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  const reassignOptions = useMemo(
    () => (overview?.categories ?? []).filter((c) => c.id !== deleteTarget?.id),
    [overview, deleteTarget],
  );
  const deleteTargetCount = deleteTarget ? (productCountById.get(deleteTarget.id) ?? 0) : 0;

  function openDelete(row: CategoryDoc) {
    setDeleteTarget(row);
    setConflictMessage(null);
    setDeleteError(null);
    setReassignTo("");
  }

  async function attemptDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setConflictMessage(null);
    setDeleteError(null);
    try {
      const res = await apiDelete<{ deleted: true; reassignedProducts: number }>(
        `/admin/catalogue/categories/${deleteTarget.id}`,
      );
      toast.success(
        "Category deleted",
        res.reassignedProducts > 0
          ? `${res.reassignedProducts} product${res.reassignedProducts === 1 ? "" : "s"} reassigned to another category.`
          : `${deleteTarget.name} is gone from the catalogue.`,
      );
      setDeleteTarget(null);
      reload();
      reloadOverview();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Products still assigned — the server message carries the count.
        setConflictMessage(err.message);
      } else {
        setDeleteError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function deleteWithReassignment() {
    if (!deleteTarget || !reassignTo) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // apiDelete takes only a path — the reassignment target rides along as a query string.
      const res = await apiDelete<{ deleted: true; reassignedProducts: number }>(
        `/admin/catalogue/categories/${deleteTarget.id}?reassignTo=${encodeURIComponent(reassignTo)}`,
      );
      const target = reassignOptions.find((c) => c.id === reassignTo);
      toast.success(
        "Category deleted",
        res.reassignedProducts > 0
          ? `${res.reassignedProducts} product${res.reassignedProducts === 1 ? "" : "s"} reassigned to “${target?.name ?? "another category"}”.`
          : `${deleteTarget.name} is gone from the catalogue.`,
      );
      setDeleteTarget(null);
      reload();
      reloadOverview();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
    } finally {
      setDeleting(false);
    }
  }

  /* ---------------------------------- view ----------------------------------- */
  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <span>Console</span>
            <IconChevronRight className="h-3 w-3" />
            <span className="font-bold text-primary">Storefront Categories</span>
          </>
        }
        title="Categories"
        description="The shop's shelving — categories move through a draft → published → archived lifecycle, and unready ones show a coming-soon page."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <IconPlus className="h-4 w-4" />
              Add category
            </Button>
          ) : null
        }
      />

      {/* Summary cards — computed over the full (unfiltered) list */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Categories summary">
        <SummaryCard
          tone="primary"
          icon={<IconCheck className="h-5 w-5" />}
          label="Published"
          value={String(publishedCount)}
          unit="live"
          sub={`${all.filter((c) => c.status === "published" && c.isReady).length} visible on the storefront`}
        />
        <SummaryCard
          tone="secondary"
          icon={<IconEyeOff className="h-5 w-5" />}
          label="Hidden on storefront"
          value={String(hiddenCount)}
          unit="coming soon"
          sub="Unready categories show a coming-soon page"
        />
        <SummaryCard
          tone="neutral"
          icon={<IconEdit className="h-5 w-5" />}
          label="Drafts"
          value={String(draftCount)}
          unit="in prep"
          sub="Not shown on the storefront yet"
        />
        <SummaryCard
          tone="gold"
          icon={<IconArchive className="h-5 w-5" />}
          label="Archived"
          value={String(archivedCount)}
          unit="retired"
          sub="Kept for records — restorable by publishing"
        />
      </div>

      {/* Toolbar */}
      <div className="mb-4 rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-[240px] flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or slug…"
              aria-label="Search categories"
              className="w-full rounded-lg bg-surface-container-low py-2.5 pl-11 pr-4 text-[13px] text-on-surface shadow-inner placeholder:text-on-surface-variant/70 focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select
                aria-label="Filter by status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-52">
              <Select
                aria-label="Sort categories"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Reset
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">
          {all.length} categor{all.length === 1 ? "y" : "ies"} in total ·{" "}
          <strong className="text-on-surface">{overview ? overview.totalProducts : "—"}</strong> sellable products across
          published categories{filtersActive ? ` · ${rows.length} shown` : ""}
        </p>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : rows.length === 0 ? (
          filtersActive ? (
            <EmptyState
              title="No categories match"
              description="No categories match your current filters or search. Reset the filters to see everything."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No categories yet"
              description="Create your first storefront category — products are shelved under exactly one."
              action={
                canWrite ? (
                  <Button size="sm" onClick={openCreate}>
                    <IconPlus className="h-4 w-4" />
                    Add category
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <Table>
            <THead>
              <TR>
                <TH scope="col">Category</TH>
                <TH scope="col">Tagline</TH>
                <TH scope="col">Order</TH>
                <TH scope="col">Visibility</TH>
                <TH scope="col">Products</TH>
                <TH scope="col">Updated</TH>
                <TH scope="col" className="text-right">
                  Actions
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => {
                const count = productCountById.get(row.id);
                const busy = busyId === row.id;
                return (
                  <TR key={row.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        {row.heroImage ? (
                          // eslint-disable-next-line @next/next/no-img-element -- absolute CMS asset URL, mirrors the storefront
                          <img
                            src={row.heroImage}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg border border-outline-variant/40 object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-xs font-bold text-primary"
                          >
                            {row.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-[14rem] truncate text-[13px] font-semibold text-on-surface" title={row.name}>
                            {row.name}
                          </p>
                          <a
                            href={`/category/${row.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`Open /category/${row.slug} on the storefront`}
                            className="mt-0.5 inline-flex max-w-[14rem] items-center truncate rounded-full bg-surface-container px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                          >
                            /category/{row.slug}
                          </a>
                        </div>
                      </div>
                    </TD>
                    <TD className="px-2!">
                      {row.tagline ? (
                        <p className="max-w-[16rem] truncate text-[13px] text-on-surface" title={row.tagline}>
                          {row.tagline}
                        </p>
                      ) : (
                        <p className="text-xs italic text-outline">No tagline</p>
                      )}
                    </TD>
                    <TD className="px-2!">
                      <span className="font-mono text-[13px] font-semibold text-on-surface">{row.sortOrder}</span>
                    </TD>
                    <TD className="px-2!">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={row.status} />
                        {row.isReady ? (
                          <Badge tone="green">
                            <IconEye className="mr-1 h-3 w-3" />
                            Visible
                          </Badge>
                        ) : (
                          <Badge tone="amber">
                            <IconEyeOff className="mr-1 h-3 w-3" />
                            Hidden
                          </Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="px-2!">
                      {count != null ? (
                        <span className="text-[13px] font-semibold text-on-surface">{count}</span>
                      ) : (
                        <span className="text-xs italic text-outline" title="Sellable counts come from the public shop overview — only published categories are counted">
                          —
                        </span>
                      )}
                    </TD>
                    <TD className="px-2!">
                      <p className="text-[13px] text-on-surface">{relativeDayTime(row.updatedAt)}</p>
                    </TD>
                    <TD className="px-2!">
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              title="Edit category"
                              aria-label={`Edit ${row.name}`}
                              className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary"
                            >
                              <IconEdit className="h-4 w-4" />
                            </button>
                            {row.status === "published" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void quickSetStatus(row, "draft", "Category unpublished")}
                                title="Unpublish — back to draft"
                                aria-label={`Unpublish ${row.name}`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <IconUnpublish className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void quickSetStatus(row, "published", "Category published")}
                                title="Publish"
                                aria-label={`Publish ${row.name}`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <IconPublish className="h-4 w-4" />
                              </button>
                            )}
                            {row.status !== "archived" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setArchiveTarget(row)}
                                title="Archive category"
                                aria-label={`Archive ${row.name}`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <IconArchive className="h-4 w-4" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openDelete(row)}
                              title="Delete category"
                              aria-label={`Delete ${row.name}`}
                              className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] italic text-outline">Read-only</span>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      <p className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container/60 px-4 py-3 text-xs text-on-surface-variant">
        <span>
          Products live under exactly one category; deleting a full category asks where its products should go. Navbar grouping is
          managed separately in the Navigation console.
        </span>
        <span className="label-eyebrow text-outline">Draft → published → archived</span>
      </p>

      {/* Overlays */}
      <CategoryFormDialog open={formOpen} onClose={() => setFormOpen(false)} category={editing} onSaved={handleSaved} />

      {/* Archive confirmation */}
      <Dialog
        open={archiveTarget !== null}
        onClose={archiving ? () => undefined : () => setArchiveTarget(null)}
        title="Archive this category?"
        description="Archived categories are retired — kept, but gone from the storefront shop."
      >
        {archiveTarget ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2.5 text-sm">
              <p className="font-semibold text-on-surface">{archiveTarget.name}</p>
              <p className="mt-0.5 font-mono text-xs text-on-surface-variant">/category/{archiveTarget.slug}</p>
            </div>
            <p className="text-sm text-on-surface-variant">
              Products stay assigned to it, but nothing on the storefront links here any more. You can restore it any time by
              publishing again.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={archiving} onClick={() => setArchiveTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={archiving} onClick={() => void confirmArchive()}>
                Archive category
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      {/* Delete confirmation (+ dependency reassignment) */}
      <Dialog
        open={deleteTarget !== null}
        onClose={deleting ? () => undefined : () => setDeleteTarget(null)}
        title="Delete this category?"
        description="Deletion is permanent — products need somewhere to go first."
      >
        {deleteTarget ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2.5 text-sm">
              <p className="font-semibold text-on-surface">{deleteTarget.name}</p>
              <p className="mt-0.5 font-mono text-xs text-on-surface-variant">/category/{deleteTarget.slug}</p>
            </div>

            {conflictMessage ? (
              <div className="space-y-3 rounded-lg border border-tertiary-fixed-dim/60 bg-tertiary-fixed/30 px-3 py-3">
                <p className="text-sm font-semibold text-on-tertiary-fixed">{conflictMessage}</p>
                {reassignOptions.length > 0 ? (
                  <>
                    <Field label="Reassign its products to" className="[&_label]:text-ink">
                      <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} disabled={deleting}>
                        <option value="">Choose a category…</option>
                        {reassignOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.productCount} products)
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button
                      variant="danger"
                      loading={deleting}
                      disabled={!reassignTo}
                      onClick={() => void deleteWithReassignment()}
                    >
                      Delete &amp; reassign {deleteTargetCount} product{deleteTargetCount === 1 ? "" : "s"}
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-on-tertiary-fixed">
                    No other published category exists to receive them — move the products to another category first, or archive
                    them.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">
                {deleteTargetCount > 0 ? (
                  <>
                    This category still has <strong>{deleteTargetCount} product{deleteTargetCount === 1 ? "" : "s"}</strong>{" "}
                    assigned — the server will ask where they should go.
                  </>
                ) : (
                  "Nothing is assigned to it, so it can be removed right away. This cannot be undone."
                )}
              </p>
            )}

            {deleteError ? (
              <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                {deleteError}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              {!conflictMessage ? (
                <Button variant="danger" loading={deleting} onClick={() => void attemptDelete()}>
                  Delete category
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/* ------------------------------- fragments --------------------------------- */

const TONES = {
  primary: { text: "text-primary", chip: "bg-surface-container-high text-primary", decor: "bg-surface-container-high/40" },
  secondary: { text: "text-secondary", chip: "bg-secondary-container text-secondary", decor: "bg-secondary-container/40" },
  neutral: { text: "text-on-surface", chip: "bg-surface-container text-tertiary", decor: "bg-surface-container-highest/60" },
  gold: { text: "text-primary", chip: "bg-tertiary-fixed text-on-tertiary-fixed", decor: "bg-tertiary-fixed/40" },
} as const;

/** Heritage metric card (mirrors the suppliers console pattern with the corner decor blob). */
function SummaryCard({
  tone,
  icon,
  label,
  value,
  unit,
  sub,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  const t = TONES[tone];
  return (
    <div className="group relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
      <span aria-hidden className={`metric-decor ${t.decor}`} />
      <div className="relative mb-2 flex items-center justify-between">
        <span className="label-eyebrow text-on-surface-variant">{label}</span>
        <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-full ${t.chip}`}>
          {icon}
        </span>
      </div>
      <div className="relative flex items-baseline gap-1.5">
        <span className={`font-display text-[26px] font-semibold leading-8 ${t.text}`}>{value}</span>
        {unit ? <span className="text-xs font-medium text-secondary">{unit}</span> : null}
      </div>
      <p className="relative mt-1 text-[13px] text-on-surface-variant">{sub}</p>
    </div>
  );
}
