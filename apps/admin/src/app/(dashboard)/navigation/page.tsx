"use client";
/**
 * /navigation — storefront navigation console (header + footer link management).
 *
 * Data (all real, no demo rows):
 *  - GET    /admin/content/navigation          → NavigationItemDoc[] (sorted by location then sortOrder)
 *  - GET    /admin/catalogue/categories        → CategoryDoc[] (needs categories:read; picker degrades
 *                                                 to a slug input without it)
 *  - GET    /admin/content/pages               → PageDoc[] (only PUBLISHED pages feed the picker)
 *  - POST   /admin/content/navigation          → create (content:write, audited server-side)
 *  - POST   /admin/content/navigation/:id      → update (also used for reorder/enable — full body)
 *  - DELETE /admin/content/navigation/:id      → remove (confirm dialog first)
 *
 * Honest-scope notes:
 *  - The live preview strip renders exactly what the public navbar will show:
 *    enabled header items in sortOrder. Disabled items are listed in the counts,
 *    never in the preview, because the public API drops them too.
 *  - Reorder swaps sortOrder with the neighbour via two full-body update calls;
 *    buttons stay disabled until both confirm so the list never lies mid-flight.
 *  - Destination URLs shown here mirror the API's frozen built-in page routes
 *    (see components/navigation/page-urls.ts).
 */
import { useMemo, useState } from "react";
import { ApiError, apiDelete, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { CategoryDoc, NavLocation, NavigationItemDoc, PageDoc } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
import { NavLinkFormDialog, NAV_LOCATIONS, type NavigationItemUpsertPayload } from "@/components/navigation/nav-link-form-dialog";
import { storefrontUrlForPageSlug } from "@/components/navigation/page-urls";
import {
  IconBrowser,
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconInfo,
  IconLink,
  IconPlus,
  IconTrash,
} from "@/components/navigation/icons";

function upsertBody(item: NavigationItemDoc, overrides: Partial<NavigationItemUpsertPayload>): NavigationItemUpsertPayload {
  return {
    location: item.location,
    label: item.label,
    kind: item.kind,
    ...(item.categorySlug ? { categorySlug: item.categorySlug } : {}),
    ...(item.pageSlug ? { pageSlug: item.pageSlug } : {}),
    ...(item.href ? { href: item.href } : {}),
    sortOrder: item.sortOrder,
    enabled: item.enabled,
    ...overrides,
  };
}

const KIND_LABEL: Record<NavigationItemDoc["kind"], string> = {
  home: "Homepage",
  shop: "Shop all",
  category: "Category",
  page: "CMS page",
  href: "URL",
};

function destinationSummary(item: NavigationItemDoc): string {
  switch (item.kind) {
    case "home":
      return "Homepage /";
    case "shop":
      return "Shop all /shop";
    case "category":
      return `/category/${item.categorySlug ?? "?"}`;
    case "page":
      return storefrontUrlForPageSlug(item.pageSlug ?? "");
    case "href":
      return item.href ?? "";
  }
}

interface NavRowProps {
  item: NavigationItemDoc;
  canWrite: boolean;
  first: boolean;
  last: boolean;
  moving: boolean;
  toggling: boolean;
  onMove: (item: NavigationItemDoc, dir: -1 | 1) => void;
  onToggle: (item: NavigationItemDoc) => void;
  onEdit: (item: NavigationItemDoc) => void;
  onRemove: (item: NavigationItemDoc) => void;
}

function NavRow({ item, canWrite, first, last, moving, toggling, onMove, onToggle, onEdit, onRemove }: NavRowProps) {
  const busy = moving || toggling;
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-outline-variant/40 bg-surface-container-low/50 px-3 py-2.5 transition-opacity sm:flex-nowrap ${
        item.enabled ? "" : "opacity-55"
      } ${busy ? "animate-pulse" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-on-surface">{item.label}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-on-surface-variant">
          <span className="shrink-0 rounded bg-surface-container-high px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide">
            {KIND_LABEL[item.kind]}
          </span>
          <span className="truncate font-mono">{destinationSummary(item)}</span>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {canWrite ? (
          <>
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`Move ${item.label} up`}
                disabled={first || busy}
                onClick={() => onMove(item, -1)}
                className="rounded p-0.5 text-on-surface-variant/70 transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Move ${item.label} down`}
                disabled={last || busy}
                onClick={() => onMove(item, 1)}
                className="rounded p-0.5 text-on-surface-variant/70 transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <Checkbox
              label=""
              checked={item.enabled}
              onChange={() => onToggle(item)}
              disabled={busy}
              aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.label}`}
              className="ml-1"
              title={`${item.enabled ? "Shown publicly — uncheck to hide" : "Hidden — check to show"}`}
            />
            <Button variant="ghost" size="sm" onClick={() => onEdit(item)} disabled={busy} aria-label={`Edit ${item.label}`}>
              <IconEdit className="h-4 w-4" />
              <span className="hidden lg:inline">Edit</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-error hover:bg-error-container/40"
              onClick={() => onRemove(item)}
              disabled={busy}
              aria-label={`Remove ${item.label}`}
            >
              <IconTrash className="h-4 w-4" />
              <span className="hidden lg:inline">Remove</span>
            </Button>
          </>
        ) : (
          <Badge tone={item.enabled ? "green" : "neutral"}>{item.enabled ? "Live" : "Hidden"}</Badge>
        )}
      </div>
    </li>
  );
}

export default function NavigationPage() {
  usePageTitle("Navigation");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "content:write");
  const canReadCategories = can(principal, "categories:read");

  /* ------------------------------- queries ------------------------------ */
  const { data, loading, error, reload } = useApiQuery<NavigationItemDoc[]>(() =>
    apiGet<NavigationItemDoc[]>("/admin/content/navigation"),
  );
  const { data: categories } = useApiQuery<CategoryDoc[]>(
    () => (canReadCategories ? apiGet<CategoryDoc[]>("/admin/catalogue/categories") : Promise.resolve([])),
    [canReadCategories],
  );
  const { data: pages } = useApiQuery<PageDoc[]>(() => apiGet<PageDoc[]>("/admin/content/pages"));

  const items = useMemo(() => data ?? [], [data]);
  const publishedPages = useMemo(
    () =>
      (pages ?? [])
        .filter((p) => p.status === "published")
        .sort((a, b) => a.title.localeCompare(b.title)),
    [pages],
  );

  const itemsIn = (location: NavLocation) =>
    items.filter((i) => i.location === location).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

  const headerItems = useMemo(() => itemsIn("header"), [items]);
  const careItems = useMemo(() => itemsIn("footer-care"), [items]);
  const legalItems = useMemo(() => itemsIn("footer-legal"), [items]);

  /* ------------------------------- overlays ------------------------------ */
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NavigationItemDoc | null>(null);
  const [formLocation, setFormLocation] = useState<NavLocation>("header");

  function openCreate(location: NavLocation) {
    setEditing(null);
    setFormLocation(location);
    setFormOpen(true);
  }

  function openEdit(item: NavigationItemDoc) {
    setEditing(item);
    setFormLocation(item.location);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(
      editing ? "Navigation link updated" : "Navigation link added",
      "The storefront picks this up within a minute.",
    );
    reload();
  }

  /* --------------------------- enable / disable --------------------------- */
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function toggleEnabled(item: NavigationItemDoc) {
    setTogglingId(item.id);
    try {
      await apiPost<NavigationItemDoc>(`/admin/content/navigation/${item.id}`, upsertBody(item, { enabled: !item.enabled }));
      toast.success(item.enabled ? "Link hidden" : "Link live", `${item.label} is now ${item.enabled ? "hidden from" : "shown on"} the storefront navigation.`);
      reload();
    } catch (err) {
      toast.error("Could not update the link", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setTogglingId(null);
    }
  }

  /* ------------------------------- reorder ------------------------------- */
  const [movingId, setMovingId] = useState<string | null>(null);

  async function move(item: NavigationItemDoc, dir: -1 | 1) {
    if (movingId) return; // one reorder in flight at a time — two swapped pairs could interleave
    const list = itemsIn(item.location);
    const idx = list.findIndex((i) => i.id === item.id);
    const neighbor = list[idx + dir];
    if (!neighbor) return;

    // a = earlier in the list, b = later. Swap sort orders; when tied, the item
    // moving forward gets +1 so the swap actually changes the public order.
    const [a, b] = dir === -1 ? [neighbor, item] : [item, neighbor];
    const tied = a.sortOrder === b.sortOrder;
    const aBody = upsertBody(a, { sortOrder: tied ? a.sortOrder + 1 : b.sortOrder });
    const bBody = upsertBody(b, { sortOrder: tied ? b.sortOrder : a.sortOrder });

    setMovingId(item.id);
    try {
      await apiPost(`/admin/content/navigation/${a.id}`, aBody);
      await apiPost(`/admin/content/navigation/${b.id}`, bBody);
      reload();
    } catch (err) {
      toast.error("Could not reorder", err instanceof ApiError ? err.message : "Unexpected error — the list was reloaded.");
      reload();
    } finally {
      setMovingId(null);
    }
  }

  /* -------------------------------- delete ------------------------------- */
  const [deleteTarget, setDeleteTarget] = useState<NavigationItemDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/admin/content/navigation/${deleteTarget.id}`);
      toast.success("Link removed", `${deleteTarget.label} no longer appears on the storefront.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error("Could not remove the link", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setDeleting(false);
    }
  }

  /* ------------------------------- rendering ------------------------------ */
  const headerLive = headerItems.filter((i) => i.enabled).length;
  const careLive = careItems.filter((i) => i.enabled).length;
  const legalLive = legalItems.filter((i) => i.enabled).length;

  const sectionMeta: { location: NavLocation; title: string; subtitle: string; items: NavigationItemDoc[] }[] = [
    {
      location: "header",
      title: "Header navigation",
      subtitle: "The pill menu across the storefront navbar — keep it to a handful of links",
      items: headerItems,
    },
    {
      location: "footer-care",
      title: "Footer — Customer Care",
      subtitle: "Support and policy links under the Customer Care heading",
      items: careItems,
    },
    {
      location: "footer-legal",
      title: "Footer — Legal",
      subtitle: "Privacy, terms and compliance links at the foot of every page",
      items: legalItems,
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <span>Console</span>
            <span aria-hidden>›</span>
            <span>Storefront</span>
            <span className="font-bold text-primary">Navigation</span>
          </>
        }
        title="Navigation"
        description="Control what appears in the storefront navbar and footer — every link points at a real homepage, category, CMS page or URL."
        actions={
          canWrite ? (
            <Button onClick={() => openCreate("header")}>
              <IconPlus className="h-4 w-4" />
              Add link
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="space-y-6">
          <Card>
            <div className="space-y-3 p-4 sm:p-6" role="status" aria-label="Loading">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          </Card>
          {sectionMeta.map((s) => (
            <Card key={s.location}>
              <CardHeader title={s.title} subtitle={s.subtitle} />
              <TableSkeleton rows={3} cols={3} />
            </Card>
          ))}
        </div>
      ) : error || !data ? (
        <Card>
          <ErrorState message={error?.message ?? "Navigation items are not available"} status={error?.status} onRetry={reload} />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ------------------------- live preview strip ------------------------- */}
          <Card>
            <CardHeader
              title="Live preview — storefront navbar"
              subtitle="Exactly what shoppers see: enabled header links in their saved order"
            />
            <CardBody className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-outline-variant/50 bg-surface-container-lowest">
                <div className="flex items-center gap-2 border-b border-outline-variant/40 bg-surface-container-low px-3 py-2">
                  <span aria-hidden className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-error/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-tertiary/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-secondary/70" />
                  </span>
                  <span className="ml-2 flex-1 truncate rounded-full bg-surface-container-high px-3 py-1 text-xs text-on-surface-variant">
                    annaadhya.in
                  </span>
                  <IconBrowser className="h-4 w-4 text-on-surface-variant/60" />
                </div>
                <div className="flex flex-wrap items-center gap-2 px-4 py-3" aria-label="Header navigation preview">
                  <span aria-hidden className="font-display text-sm font-bold tracking-tight text-primary">
                    Annaadhya
                  </span>
                  <span aria-hidden className="mx-1 h-5 w-px bg-outline-variant/60" />
                  {headerLive === 0 ? (
                    <span className="text-xs text-on-surface-variant/70">
                      No enabled header links yet — the storefront falls back to its built-in menu.
                    </span>
                  ) : (
                    headerItems
                      .filter((i) => i.enabled)
                      .map((i) => (
                        <span
                          key={i.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1 text-xs font-semibold text-on-secondary-container"
                        >
                          {i.label}
                        </span>
                      ))
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2" aria-label="Navigation counts">
                <Badge tone="neutral">
                  <IconLink className="mr-1 h-3 w-3" />
                  Header · {headerLive} live / {headerItems.length}
                </Badge>
                <Badge tone="neutral">Customer Care · {careLive} live / {careItems.length}</Badge>
                <Badge tone="neutral">Legal · {legalLive} live / {legalItems.length}</Badge>
              </div>
            </CardBody>
          </Card>

          {/* --------------------------- three sections --------------------------- */}
          {sectionMeta.map((section) => {
            const list = section.items;
            return (
              <Card key={section.location}>
                <CardHeader
                  title={`${section.title} · ${list.length} link${list.length === 1 ? "" : "s"}`}
                  subtitle={section.subtitle}
                  actions={
                    canWrite ? (
                      <Button variant="outline" size="sm" onClick={() => openCreate(section.location)}>
                        <IconPlus className="h-4 w-4" />
                        Add link
                      </Button>
                    ) : undefined
                  }
                />
                <CardBody>
                  {list.length === 0 ? (
                    <EmptyState
                      icon={<IconLink className="h-6 w-6" />}
                      title="No links in this section yet"
                      description={
                        canWrite
                          ? "Add the first link — new entries append to the end and can be reordered."
                          : "An owner can add links here with content:write access."
                      }
                      action={
                        canWrite ? (
                          <Button variant="outline" size="sm" onClick={() => openCreate(section.location)}>
                            <IconPlus className="h-4 w-4" />
                            Add link
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <ul className="space-y-2">
                      {list.map((item, idx) => (
                        <NavRow
                          key={item.id}
                          item={item}
                          canWrite={canWrite}
                          first={idx === 0}
                          last={idx === list.length - 1}
                          moving={movingId === item.id}
                          toggling={togglingId === item.id}
                          onMove={(i, d) => void move(i, d)}
                          onToggle={(i) => void toggleEnabled(i)}
                          onEdit={openEdit}
                          onRemove={setDeleteTarget}
                        />
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}

          {/* ------------------------------ info note ----------------------------- */}
          <Card className="border border-secondary/30 bg-secondary-container/40">
            <CardBody className="flex items-start gap-3">
              <IconInfo className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
              <div className="text-sm text-on-surface">
                <p className="font-semibold text-secondary">How changes reach the storefront</p>
                <p className="mt-1 text-on-surface-variant">
                  Changes go live on the storefront within a minute (or instantly after the API&apos;s revalidation push).
                  Destinations that are unpublished or hidden are automatically removed from the public navigation.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ------------------------------ add / edit ------------------------------ */}
      <NavLinkFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        items={items}
        categories={categories ?? []}
        canReadCategories={canReadCategories}
        pages={publishedPages}
        initialLocation={formLocation}
        onSaved={handleSaved}
      />

      {/* --------------------------- delete confirm ---------------------------- */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => (deleting ? undefined : setDeleteTarget(null))}
        title="Remove this navigation link?"
        description="The link disappears from the storefront navigation. This cannot be undone."
      >
        {deleteTarget ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-container-low p-4 text-sm">
              <p className="font-semibold text-on-surface">{deleteTarget.label}</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {NAV_LOCATIONS.find((l) => l.value === deleteTarget.location)?.label} · {KIND_LABEL[deleteTarget.kind]} ·{" "}
                <span className="font-mono">{destinationSummary(deleteTarget)}</span>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
                Remove link
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
