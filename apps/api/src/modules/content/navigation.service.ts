/** CMS Navigation service — admin-managed storefront navbar and footer links.
 *
 *  Items reference real destinations (categories, CMS pages, static routes);
 *  the public projection resolves each item to a validated href and silently
 *  drops entries whose destination is missing, unpublished or hidden — a draft
 *  category can never leak into the public navigation through a nav item.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  type CategoryDoc,
  type NavLocation,
  type NavigationItemDoc,
  type NavigationItemUpsertDto,
  type PageDoc,
  type PublicNavigationItem,
} from "@annaadhya/contracts";
import { conflict, notFound, validationFailed, type DataClient } from "@annaadhya/data-core";
import { DATA_CLIENT } from "../../data/data.module";
import { storefrontUrlForPage } from "./content-urls";
import { pushRevalidate } from "./revalidate";

const LOCATIONS: NavigationItemDoc["location"][] = ["header", "footer-care", "footer-legal"];

@Injectable()
export class NavigationService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  async list(): Promise<NavigationItemDoc[]> {
    const rows = await this.data.list<NavigationItemDoc>(COLLECTIONS.navigationItems);
    return rows.sort(
      (a, b) => LOCATIONS.indexOf(a.location) - LOCATIONS.indexOf(b.location) || a.sortOrder - b.sortOrder,
    );
  }

  async create(dto: NavigationItemUpsertDto): Promise<NavigationItemDoc> {
    await this.assertDestinations(dto);
    const now = Date.now();
    const doc: NavigationItemDoc = {
      id: `nav_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      location: dto.location,
      label: dto.label,
      kind: dto.kind,
      categorySlug: dto.categorySlug,
      pageSlug: dto.pageSlug,
      href: dto.href,
      sortOrder: dto.sortOrder,
      enabled: dto.enabled,
      createdAt: now,
      updatedAt: now,
      isDemo: false,
    };
    await this.data.set(COLLECTIONS.navigationItems, doc.id, doc, { isDemo: false });
    await pushRevalidate({ tags: ["cms", "navigation"], paths: ["/"] });
    return doc;
  }

  async update(id: string, dto: NavigationItemUpsertDto): Promise<NavigationItemDoc> {
    const existing = await this.getExisting(id);
    await this.assertDestinations(dto);
    const doc: NavigationItemDoc = {
      ...existing,
      location: dto.location,
      label: dto.label,
      kind: dto.kind,
      categorySlug: dto.categorySlug,
      pageSlug: dto.pageSlug,
      href: dto.href,
      sortOrder: dto.sortOrder,
      enabled: dto.enabled,
      updatedAt: Date.now(),
    };
    await this.data.set(COLLECTIONS.navigationItems, doc.id, doc, { isDemo: doc.isDemo });
    await pushRevalidate({ tags: ["cms", "navigation"], paths: ["/"] });
    return doc;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.getExisting(id);
    await this.data.delete(COLLECTIONS.navigationItems, id);
    await pushRevalidate({ tags: ["cms", "navigation"], paths: ["/"] });
    void existing;
  }

  /** Public projection: enabled items only, resolved + validated hrefs. */
  async listPublic(): Promise<PublicNavigationItem[]> {
    const [items, categories, pages] = await Promise.all([
      this.list(),
      this.data.list<CategoryDoc>(COLLECTIONS.categories, {
        where: [{ field: "status", op: "==", value: "published" }],
      }),
      this.data.list<PageDoc>(COLLECTIONS.pages, {
        where: [{ field: "status", op: "==", value: "published" }],
      }),
    ]);

    const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
    const pageBySlug = new Map(pages.map((p) => [p.slug, p]));
    const out: PublicNavigationItem[] = [];

    for (const item of items) {
      if (!item.enabled) continue;
      const href = this.resolveHref(item, categoryBySlug, pageBySlug);
      if (!href) continue; // dead destination — never rendered publicly
      out.push({ label: item.label, href, location: item.location, sortOrder: item.sortOrder });
    }
    return out.sort(
      (a, b) => LOCATIONS.indexOf(a.location) - LOCATIONS.indexOf(b.location) || a.sortOrder - b.sortOrder,
    );
  }

  /** Saved-item counts per location, regardless of enabled state. Lets the
   *  storefront tell "manager never configured" (curated fallback menus apply)
   *  apart from "admin saved items here" (the CMS owns the surface — even when
   *  every item is currently hidden, which is an explicit configuration). */
  async configStatus(): Promise<Record<NavLocation, number>> {
    const items = await this.list();
    const counts: Record<NavLocation, number> = { header: 0, "footer-care": 0, "footer-legal": 0 };
    for (const item of items) counts[item.location] += 1;
    return counts;
  }

  private resolveHref(
    item: NavigationItemDoc,
    categoryBySlug: Map<string, CategoryDoc>,
    pageBySlug: Map<string, PageDoc>,
  ): string | null {
    switch (item.kind) {
      case "home":
        return "/";
      case "shop":
        return "/shop";
      case "category": {
        // Published AND storefront-visible — matches public catalogue rules.
        const cat = item.categorySlug ? categoryBySlug.get(item.categorySlug) : undefined;
        if (!cat || !cat.isReady) return null;
        return `/category/${cat.slug}`;
      }
      case "page": {
        const page = item.pageSlug ? pageBySlug.get(item.pageSlug) : undefined;
        if (!page) return null;
        return storefrontUrlForPage(page);
      }
      case "href": {
        const raw = item.href ?? null;
        if (!raw) return null;
        // A custom URL that lands on a category page must obey the same
        // catalogue rules as a category link: archived / draft / deleted
        // destinations are dropped, never rendered as public dead links.
        // (Keep the URL rule in sync with apps/storefront navigation-guard.)
        const slug = /^\/category\/([^/?#]+?)\/?$/.exec(raw)?.[1];
        if (slug && !categoryBySlug.has(decodeURIComponent(slug))) return null;
        return raw;
      }
      default:
        return null;
    }
  }

  private async getExisting(id: string): Promise<NavigationItemDoc> {
    const doc = await this.data.get<NavigationItemDoc>(COLLECTIONS.navigationItems, id);
    if (!doc) throw notFound("Navigation item not found");
    return doc;
  }

  /** Destination sanity: referenced slugs must exist at save time. */
  private async assertDestinations(dto: NavigationItemUpsertDto): Promise<void> {
    if (dto.kind === "category" && dto.categorySlug) {
      const cat = await this.data.get<CategoryDoc>(COLLECTIONS.categories, `cat_${dto.categorySlug}`);
      if (!cat) throw validationFailed(`Category "${dto.categorySlug}" does not exist`);
    }
    if (dto.kind === "page" && dto.pageSlug) {
      const page = await this.data.get<PageDoc>(COLLECTIONS.pages, `page_${dto.pageSlug}`);
      if (!page) throw conflict(`Page "${dto.pageSlug}" does not exist — publish it in Pages first`);
    }
  }
}
