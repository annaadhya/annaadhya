/** CMS Pages service — admin-managed storefront pages (Our Story, FAQ, policy
 *  documents, contact copy, custom landing pages) persisted in Firestore.
 *
 *  Behaviour rules:
 *  - Built-in pages (shipped defaults) render at their established storefront
 *    URLs and can never be deleted; they can be edited, published, unpublished
 *    and restored to the shipped default content.
 *  - Draft saves never touch the live page; only `published` docs are served
 *    publicly. Publishing requires non-empty content (validated server-side).
 *  - Unpublishing a built-in page makes the storefront fall back to its built-in
 *    default rendering; a custom page that is not published is a public 404.
 *  - Defaults are seeded lazily on first admin read — never overwriting edits.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  type AuthPrincipal,
  type PageDoc,
  type PageStatus,
  type PageUpsertDto,
  type PublicPageDoc,
} from "@annaadhya/contracts";
import { conflict, notFound, validationFailed, type DataClient } from "@annaadhya/data-core";
import { BUILTIN_PAGES } from "@annaadhya/data-core";
import { DATA_CLIENT } from "../../data/data.module";
import { storefrontUrlForPage } from "./content-urls";
import { pushRevalidate } from "./revalidate";

const PAGE_ID_PREFIX = "page_";

export function pageId(slug: string): string {
  return `${PAGE_ID_PREFIX}${slug}`;
}

function contentHasBlocks(content: PageDoc["content"]): boolean {
  if (content.kind === "faq") return content.entries.length > 0;
  return content.sections.some((s) => s.blocks.length > 0);
}

function toPublicPage(doc: PageDoc): PublicPageDoc {
  return {
    slug: doc.slug,
    title: doc.title,
    builtIn: doc.builtIn,
    pageType: doc.pageType,
    status: doc.status,
    updatedAt: doc.updatedAt,
    content: doc.content,
    seo: doc.seo,
    adminEdited: doc.adminEdited === true,
  };
}

@Injectable()
export class PagesService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  /** Seed shipped defaults for built-in pages that have no doc yet.
   *  Idempotent: existing docs (edited or not) are never touched. */
  async ensureDefaults(): Promise<void> {
    for (const def of BUILTIN_PAGES) {
      const id = pageId(def.slug);
      const existing = await this.data.get<PageDoc>(COLLECTIONS.pages, id);
      if (existing) continue;
      const now = Date.now();
      const doc: PageDoc = {
        id,
        slug: def.slug,
        title: def.title,
        builtIn: true,
        pageType: def.pageType,
        status: "published",
        content: def.content,
        seo: def.seo,
        // The seed is a mirror of the shipped storefront copy, NOT an admin
        // edit — bespoke built-in pages keep their approved designs.
        adminEdited: false,
        createdAt: now,
        updatedAt: now,
        isDemo: false,
      };
      await this.data.set(COLLECTIONS.pages, id, doc, { isDemo: false });
    }
  }

  async list(): Promise<PageDoc[]> {
    await this.ensureDefaults();
    const rows = await this.data.list<PageDoc>(COLLECTIONS.pages);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getById(id: string): Promise<PageDoc> {
    const doc = await this.data.get<PageDoc>(COLLECTIONS.pages, id);
    if (!doc) throw notFound("Page not found");
    return doc;
  }

  /** Public read: published only — drafts and archived docs are public 404s. */
  async getPublicBySlug(slug: string): Promise<PublicPageDoc> {
    const doc = await this.data.get<PageDoc>(COLLECTIONS.pages, pageId(slug));
    if (!doc || doc.status !== "published") throw notFound("Page not found");
    return toPublicPage(doc);
  }

  async listPublic(): Promise<PublicPageDoc[]> {
    const rows = await this.data.list<PageDoc>(COLLECTIONS.pages, {
      where: [{ field: "status", op: "==", value: "published" }],
    });
    return rows
      .filter((d) => contentHasBlocks(d.content))
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map(toPublicPage);
  }

  async create(dto: PageUpsertDto, actor: AuthPrincipal): Promise<PageDoc> {
    const id = pageId(dto.slug);
    const existing = await this.data.get<PageDoc>(COLLECTIONS.pages, id);
    if (existing) throw conflict(`A page with slug "${dto.slug}" already exists`);
    if (dto.status === "published" && !contentHasBlocks(dto.content)) {
      throw validationFailed("Publishing requires at least one content block. Save as a draft instead.");
    }
    const now = Date.now();
    const doc: PageDoc = {
      id,
      slug: dto.slug,
      title: dto.title,
      builtIn: false,
      pageType: dto.pageType,
      status: dto.status,
      content: dto.content,
      seo: dto.seo,
      updatedByName: actor.displayName,
      createdAt: now,
      updatedAt: now,
      isDemo: false,
    };
    await this.data.set(COLLECTIONS.pages, id, doc, { isDemo: false });
    await this.notifyStorefront(doc);
    return doc;
  }

  async update(id: string, dto: PageUpsertDto, actor: AuthPrincipal): Promise<PageDoc> {
    const existing = await this.getById(id);
    if (!existing.builtIn && dto.slug !== existing.slug) {
      const clash = await this.data.get<PageDoc>(COLLECTIONS.pages, pageId(dto.slug));
      if (clash) throw conflict(`A page with slug "${dto.slug}" already exists`);
    }
    if (dto.status === "published" && existing.status !== "published" && !contentHasBlocks(dto.content)) {
      throw validationFailed("Publishing requires at least one content block. Save as a draft instead.");
    }
    const doc: PageDoc = {
      ...existing,
      // Built-in pages keep their frozen slug + page type (live URLs depend on them).
      slug: existing.builtIn ? existing.slug : dto.slug,
      title: dto.title,
      pageType: existing.builtIn ? existing.pageType : dto.pageType,
      status: dto.status,
      content: dto.content,
      seo: dto.seo,
      // An explicit save is an admin decision — bespoke built-in pages switch
      // from their approved designs to this CMS content from now on.
      adminEdited: true,
      updatedByName: actor.displayName,
      updatedAt: Date.now(),
    };
    await this.data.set(COLLECTIONS.pages, doc.id, doc, { isDemo: doc.isDemo });
    await this.notifyStorefront(doc);
    return doc;
  }

  async setStatus(id: string, status: PageStatus, actor: AuthPrincipal): Promise<PageDoc> {
    const existing = await this.getById(id);
    if (status === "published" && !contentHasBlocks(existing.content)) {
      throw validationFailed("Publishing requires at least one content block.");
    }
    const doc: PageDoc = {
      ...existing,
      status,
      updatedByName: actor.displayName,
      updatedAt: Date.now(),
    };
    await this.data.set(COLLECTIONS.pages, doc.id, doc, { isDemo: doc.isDemo });
    await this.notifyStorefront(doc);
    return doc;
  }

  /** Reset a built-in page to the shipped default content (published). */
  async restoreDefault(id: string, actor: AuthPrincipal): Promise<PageDoc> {
    const existing = await this.getById(id);
    if (!existing.builtIn) throw validationFailed("Only built-in pages can be restored to defaults");
    const def = BUILTIN_PAGES.find((p) => p.slug === existing.slug);
    if (!def) throw conflict("No shipped default exists for this page");
    const doc: PageDoc = {
      ...existing,
      title: def.title,
      pageType: def.pageType,
      status: "published",
      content: def.content,
      seo: def.seo,
      // Back to the shipped default — bespoke built-in pages return to their
      // approved storefront designs.
      adminEdited: false,
      updatedByName: actor.displayName,
      updatedAt: Date.now(),
    };
    await this.data.set(COLLECTIONS.pages, doc.id, doc, { isDemo: doc.isDemo });
    await this.notifyStorefront(doc);
    return doc;
  }

  /** Delete a custom page. Built-in pages are permanent (archive instead). */
  async remove(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (existing.builtIn) throw validationFailed("Built-in pages cannot be deleted — archive them instead");
    await this.data.delete(COLLECTIONS.pages, id);
    await pushRevalidate({ tags: ["cms", "pages"], paths: ["/", storefrontUrlForPage(existing)] });
  }

  private async notifyStorefront(doc: PageDoc): Promise<void> {
    const paths = new Set<string>(["/"]);
    if (doc.status === "published") paths.add(storefrontUrlForPage(doc));
    await pushRevalidate({ tags: ["cms", "pages"], paths: [...paths] });
  }
}
