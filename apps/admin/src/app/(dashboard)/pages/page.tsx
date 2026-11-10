"use client";
/**
 * /pages — the Pages console (CMS content) in the approved heritage design.
 *
 * Everything is real:
 *  - GET /admin/content/pages            → every page (built-ins are auto-seeded
 *                                          server-side on first read — never created here)
 *  - POST /admin/content/pages           → create custom page (draft, then edit)
 *  - POST /admin/content/pages/:id/status → quick publish / unpublish (422 with the
 *                                          server's message when a page has no content)
 *  - POST /admin/content/pages/:id/restore-default → built-ins only, resets content
 *  - DELETE /admin/content/pages/:id     → custom pages only (built-ins are permanent)
 *
 * Built-in slugs render at their frozen storefront URLs (/about, /faq, /policies/…);
 * custom pages live under /p/{slug}. Links open the storefront in a new tab.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ApiError, apiDelete, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import type { PageDoc, PageStatus } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { NewPageDialog } from "@/components/pages/new-page-dialog";
import { pageUrlFor } from "@/components/pages/page-shared";
import {
  IconArchive,
  IconDoc,
  IconEdit,
  IconEyeOff,
  IconFaq,
  IconLock,
  IconPublish,
  IconRestore,
  IconTrash,
  IconUnpublish,
} from "@/components/pages/icons";
import { IconChevronRight, IconPlus, IconSearch } from "@/components/inventory/icons";

const STATUS_FILTERS: { value: PageStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export default function PagesPage() {
  usePageTitle("Pages");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "content:write");

  /* ------------------------------ data + filters ----------------------------- */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PageStatus | "all">("all");
  const [pageType, setPageType] = useState<"all" | "document" | "faq">("all");

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data: pages, loading, error, reload } = useApiQuery<PageDoc[]>(
    () => apiGet<PageDoc[]>("/admin/content/pages"),
    [],
  );

  const filtered = useMemo(() => {
    const rows = pages ?? [];
    return rows.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (pageType !== "all" && p.pageType !== pageType) return false;
      if (search && !`${p.title}`.toLowerCase().includes(search) && !p.slug.includes(search)) return false;
      return true;
    });
  }, [pages, status, pageType, search]);

  const filtersActive = Boolean(search) || status !== "all" || pageType !== "all";

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setPageType("all");
  }

  /* -------------------------------- overlays -------------------------------- */
  const [newOpen, setNewOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<PageDoc | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PageDoc | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* ------------------------- quick publish / unpublish ----------------------- */
  async function quickSetStatus(row: PageDoc, next: PageStatus) {
    setBusyId(row.id);
    try {
      await apiPost(`/admin/content/pages/${row.id}/status`, { status: next });
      toast.success(
        next === "published"
          ? "Page published"
          : next === "draft"
            ? "Page unpublished"
            : "Page archived",
        `${row.title} is now ${next}.`,
      );
      reload();
    } catch (err) {
      // Publishing an empty page fails with 422 — surface the server's message.
      toast.error("Could not update the page", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusyId(null);
    }
  }

  /* --------------------------------- archive --------------------------------- */
  // Archiving is a lifecycle state (kept in storage, gone from the storefront, restorable)
  // — never a delete. The status endpoint persists it server-side.
  const [archiveTarget, setArchiveTarget] = useState<PageDoc | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await apiPost(`/admin/content/pages/${archiveTarget.id}/status`, { status: "archived" });
      toast.success(
        "Page archived",
        `${archiveTarget.title} is retired but kept — restore it from the Archived filter anytime.`,
      );
      setArchiveTarget(null);
      setStatus("archived");
      reload();
    } catch (err) {
      toast.error("Could not archive the page", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setArchiving(false);
    }
  }

  /* ------------------------------ restore default ---------------------------- */
  const [restoring, setRestoring] = useState(false);

  async function confirmRestore() {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await apiPost(`/admin/content/pages/${restoreTarget.id}/restore-default`);
      toast.success("Default content restored", `${restoreTarget.title} was reset to the shipped content and published.`);
      setRestoreTarget(null);
      reload();
    } catch (err) {
      toast.error("Could not restore defaults", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setRestoring(false);
    }
  }

  /* --------------------------------- delete ---------------------------------- */
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/admin/content/pages/${deleteTarget.id}`);
      toast.success("Page deleted", `/p/${deleteTarget.slug} no longer resolves on the storefront.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error("Could not delete the page", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setDeleting(false);
    }
  }

  /* ---------------------------------- view ----------------------------------- */
  const publishedCount = (pages ?? []).filter((p) => p.status === "published").length;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <span>Console</span>
            <IconChevronRight className="h-3 w-3" />
            <span className="font-bold text-primary">Storefront Pages</span>
          </>
        }
        title="Pages"
        description="Every word on the storefront's fixed pages and custom landing pages — drafts stay private, publishing goes live instantly."
        actions={
          canWrite ? (
            <Button onClick={() => setNewOpen(true)}>
              <IconPlus className="h-4 w-4" />
              New page
            </Button>
          ) : null
        }
      />

      {/* Toolbar */}
      <div className="mb-4 rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-[240px] flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title or slug…"
              aria-label="Search pages"
              className="w-full rounded-lg bg-surface-container-low py-2.5 pl-11 pr-4 text-[13px] text-on-surface shadow-inner placeholder:text-on-surface-variant/70 focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select
                aria-label="Filter by status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={status}
                onChange={(e) => setStatus(e.target.value as PageStatus | "all")}
              >
                {STATUS_FILTERS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select
                aria-label="Filter by page type"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={pageType}
                onChange={(e) => setPageType(e.target.value as "all" | "document" | "faq")}
              >
                <option value="all">All page types</option>
                <option value="document">Documents</option>
                <option value="faq">FAQ pages</option>
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
          {(pages ?? []).length} page{(pages ?? []).length === 1 ? "" : "s"} in total ·{" "}
          <strong className="text-on-surface">{publishedCount}</strong> live on the storefront
          {filtersActive ? ` · ${filtered.length} shown` : ""}
        </p>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        {loading ? (
          <TableSkeleton rows={7} cols={7} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : filtered.length === 0 ? (
          filtersActive ? (
            <EmptyState
              title="No pages match"
              description="No pages match your current filters or search. Reset the filters to see everything."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No pages yet"
              description="Built-in pages (About, FAQ, policies) are seeded automatically on first load — custom pages can be created here."
              action={
                canWrite ? (
                  <Button size="sm" onClick={() => setNewOpen(true)}>
                    <IconPlus className="h-4 w-4" />
                    Create the first page
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <Table>
            <THead>
              <TR>
                <TH scope="col">Title</TH>
                <TH scope="col">Live URL</TH>
                <TH scope="col">Type</TH>
                <TH scope="col">Status</TH>
                <TH scope="col">Origin</TH>
                <TH scope="col">Last updated</TH>
                <TH scope="col" className="text-right">
                  Actions
                </TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((row) => {
                const url = pageUrlFor(row);
                const busy = busyId === row.id;
                return (
                  <TR key={row.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-primary">
                          {row.pageType === "faq" ? <IconFaq className="h-4.5 w-4.5" /> : <IconDoc className="h-4.5 w-4.5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="max-w-[16rem] truncate text-[13px] font-semibold text-on-surface" title={row.title}>
                            {row.title}
                          </p>
                          <span className="mt-0.5 inline-flex max-w-[16rem] items-center truncate rounded-full bg-surface-container px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant" title={row.slug}>
                            {row.slug}
                          </span>
                        </div>
                      </div>
                    </TD>
                    <TD className="px-2!">
                      {row.status === "published" ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          title={`Open ${url} on the storefront`}
                          className="inline-flex max-w-[13rem] items-center gap-1 truncate rounded-full bg-surface-container px-2 py-1 font-mono text-[11px] font-semibold text-primary underline decoration-primary/30 transition-colors hover:bg-surface-container-high"
                        >
                          {url}
                        </a>
                      ) : (
                        <span className="inline-flex max-w-[13rem] items-center gap-1 truncate rounded-full bg-surface-container px-2 py-1 font-mono text-[11px] text-outline" title="Not published — the URL resolves only when the page is live">
                          <IconEyeOff className="h-3 w-3 shrink-0" />
                          {url}
                        </span>
                      )}
                    </TD>
                    <TD className="px-2!">
                      <Badge tone={row.pageType === "faq" ? "honey" : "neutral"}>{row.pageType === "faq" ? "FAQ" : "Document"}</Badge>
                    </TD>
                    <TD className="px-2!">
                      <StatusBadge status={row.status} />
                    </TD>
                    <TD className="px-2!">
                      <Badge tone={row.builtIn ? "amber" : "green"}>{row.builtIn ? "Built-in" : "Custom"}</Badge>
                    </TD>
                    <TD className="px-2!">
                      <p className="text-[13px] font-medium text-on-surface">{formatDate(row.updatedAt)}</p>
                      <p className="text-[11px] text-on-surface-variant">{row.updatedByName ? `by ${row.updatedByName}` : "—"}</p>
                    </TD>
                    <TD className="px-2!">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/pages/${row.id}/edit`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary"
                        >
                          <IconEdit className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                        {canWrite ? (
                          <>
                            {row.status === "published" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void quickSetStatus(row, "draft")}
                                title="Unpublish — back to draft"
                                aria-label={`Unpublish ${row.title}`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <IconUnpublish className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void quickSetStatus(row, "published")}
                                title={row.status === "archived" ? "Publish — restore to the live storefront" : "Publish"}
                                aria-label={`Publish ${row.title}`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <IconPublish className="h-4 w-4" />
                              </button>
                            )}
                            {row.status === "archived" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void quickSetStatus(row, "draft")}
                                title="Restore from archive — back to draft (content is kept)"
                                aria-label={`Restore ${row.title} from archive`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <IconRestore className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setArchiveTarget(row)}
                                title="Archive — retire the page, keep it restorable"
                                aria-label={`Archive ${row.title}`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <IconArchive className="h-4 w-4" />
                              </button>
                            )}
                            {row.builtIn ? (
                              <button
                                type="button"
                                onClick={() => setRestoreTarget(row)}
                                title="Restore default content"
                                aria-label={`Restore default content for ${row.title}`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary"
                              >
                                <IconRestore className="h-4 w-4" />
                              </button>
                            ) : null}
                            {row.builtIn ? (
                              <span
                                title="Built-in pages can't be deleted — their storefront URLs are frozen. Archive them instead."
                                className="inline-flex cursor-not-allowed rounded-lg bg-surface-container-low p-1.5 text-outline opacity-60"
                              >
                                <IconLock className="h-4 w-4" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(row)}
                                title="Delete page"
                                aria-label={`Delete ${row.title}`}
                                className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-error"
                              >
                                <IconTrash className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        ) : null}
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
          Built-in pages render at their frozen storefront URLs; custom pages live under <span className="font-mono">/p/&#123;slug&#125;</span>.
          Unpublishing a built-in falls back to its shipped storefront rendering.
        </span>
        <span className="label-eyebrow text-outline">Drafts never touch the live site</span>
      </p>

      {/* Overlays */}
      <NewPageDialog open={newOpen} onClose={() => setNewOpen(false)} />

      {/* Archive confirmation */}
      <Dialog
        open={archiveTarget !== null}
        onClose={archiving ? () => undefined : () => setArchiveTarget(null)}
        title="Archive this page?"
        description="Archived pages are retired — kept in storage, gone from the storefront, restorable anytime."
      >
        {archiveTarget ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2.5 text-sm">
              <p className="font-semibold text-on-surface">{archiveTarget.title}</p>
              <p className="mt-0.5 font-mono text-xs text-on-surface-variant">{pageUrlFor(archiveTarget)}</p>
            </div>
            <p className="text-sm text-on-surface-variant">
              The URL will stop resolving on the storefront and the page drops out of the active list. Nothing is
              deleted — the title, slug, content and SEO stay intact, and you can restore or republish it from the
              Archived filter.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={archiving} onClick={() => setArchiveTarget(null)}>
                Cancel
              </Button>
              <Button loading={archiving} onClick={() => void confirmArchive()}>
                Archive page
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={restoreTarget !== null}
        onClose={restoring ? () => undefined : () => setRestoreTarget(null)}
        title="Restore default content?"
        description="The page is reset to the shipped default and published immediately."
      >
        {restoreTarget ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2.5 text-sm">
              <p className="font-semibold text-on-surface">{restoreTarget.title}</p>
              <p className="mt-0.5 font-mono text-xs text-on-surface-variant">{pageUrlFor(restoreTarget)}</p>
            </div>
            <p className="text-sm text-on-surface-variant">
              Your current edits to this page will be <strong>overwritten</strong> by the shipped default content. This cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={restoring} onClick={() => setRestoreTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={restoring} onClick={() => void confirmRestore()}>
                Restore &amp; publish
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={deleting ? () => undefined : () => setDeleteTarget(null)}
        title="Delete this page?"
        description="Custom pages are removed permanently."
      >
        {deleteTarget ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2.5 text-sm">
              <p className="font-semibold text-on-surface">{deleteTarget.title}</p>
              <p className="mt-0.5 font-mono text-xs text-on-surface-variant">/p/{deleteTarget.slug}</p>
            </div>
            <p className="text-sm text-on-surface-variant">
              The URL <span className="font-mono">/p/{deleteTarget.slug}</span> will stop resolving on the storefront. This cannot
              be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
                Delete page
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
