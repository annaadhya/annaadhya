/**
 * Archive lifecycle tests for CMS pages and product categories — run the real services
 * against the in-memory provider (exact production code paths).
 *
 * Regression target: archiving used to make entities disappear from the admin console
 * (categories) or offered no archive action at all (pages), which read as a permanent
 * delete. These tests pin the intended semantics:
 *   - archive persists the record (never deletes)
 *   - archived records leave the public surface
 *   - archived records remain reachable for the admin console's Archived filter
 *   - restore returns the record with content and relationships intact
 */
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryDataClient, applySeed } from "@annaadhya/data-core";
import {
  COLLECTIONS,
  type AuthPrincipal,
  type CategoryDoc,
  type PageDoc,
  type ProductDoc,
} from "@annaadhya/contracts";
import { loadEnv, resetEnvCache } from "../src/config/env";
import { CatalogueService } from "../src/modules/catalogue/catalogue.service";
import { PagesService } from "../src/modules/content/pages.service";

process.env.NODE_ENV = "test";
process.env.DATA_PROVIDER = "memory";

let db: InMemoryDataClient;
let catalogue: CatalogueService;
let pages: PagesService;

const owner: AuthPrincipal = {
  uid: "archive-owner",
  email: "owner@test.dev",
  provider: "dev",
  role: "owner",
  permissions: ["content:read", "content:write", "categories:read", "categories:write"],
  isStaff: true,
};

/** A custom (non-built-in) page upsert payload with real content blocks. */
function customPageBody(slug: string) {
  return {
    slug,
    title: `Gift Guide ${slug}`,
    pageType: "document" as const,
    status: "published" as const,
    content: {
      kind: "document" as const,
      sections: [
        {
          id: "intro",
          title: "Intro",
          blocks: [{ type: "paragraph" as const, text: "Honey and dry fruits make timeless presents." }],
        },
      ],
    },
    seo: { title: "Gift guide SEO", description: "Seasonal gifting advice" },
  };
}

beforeAll(async () => {
  db = new InMemoryDataClient({ nodeEnv: "test" });
  await applySeed(db);
  catalogue = new CatalogueService(db);
  pages = new PagesService(db);
  resetEnvCache();
  loadEnv();
});

/* -------------------------------- Categories -------------------------------- */

describe("Categories — archive lifecycle", () => {
  it("admin list returns every lifecycle status (drafts + archived included)", async () => {
    const all = await catalogue.listAllCategories();
    const published = await catalogue.listCategories(false);
    // The seed has only published categories; both views agree on that baseline.
    expect(all.length).toBe(published.length);
    expect(all.every((c) => c.status === "published")).toBe(true);
  });

  it("archiving persists the record, keeps products, and removes it from the public surface — admin list still returns it", async () => {
    // A published category with a product assigned to it
    const products = await db.list<ProductDoc>(COLLECTIONS.products);
    const assigned = products.find((p) => p.status === "published" && p.categoryId);
    expect(assigned).toBeTruthy();
    const category = (await catalogue.listAllCategories()).find((c) => c.id === assigned!.categoryId);
    expect(category?.status).toBe("published");

    const archived = await catalogue.upsertCategory(
      {
        slug: category!.slug,
        name: category!.name,
        tagline: category!.tagline ?? "",
        description: category!.description ?? "",
        sortOrder: category!.sortOrder ?? 0,
        isReady: category!.isReady,
        ...(category!.heroImage ? { heroImage: category!.heroImage } : {}),
        status: "archived",
        ...(category!.seo ? { seo: category!.seo } : {}),
      },
      category!.id,
    );
    expect(archived.status).toBe("archived");

    // NOT deleted: same id, same doc, still in persistent storage
    const stored = await db.get<CategoryDoc>(COLLECTIONS.categories, category!.id);
    expect(stored?.status).toBe("archived");
    expect(stored?.slug).toBe(category!.slug);

    // The admin console (listAllCategories) still sees it — the Archived filter works
    const adminView = await catalogue.listAllCategories();
    const visible = adminView.find((c) => c.id === category!.id);
    expect(visible?.status).toBe("archived");

    // The public list excludes it
    const publicList = await catalogue.listCategories(false);
    expect(publicList.some((c) => c.id === category!.id)).toBe(false);

    // Its products are untouched
    const stillAssigned = await db.list<ProductDoc>(COLLECTIONS.products, {
      where: [{ field: "categoryId", op: "==", value: category!.id }],
    });
    expect(stillAssigned.length).toBeGreaterThanOrEqual(1);
  });

  it("restoring an archived category returns it to the public list with relationships intact", async () => {
    const archived = (await catalogue.listAllCategories()).find((c) => c.status === "archived");
    expect(archived).toBeTruthy();

    const restored = await catalogue.upsertCategory(
      {
        slug: archived!.slug,
        name: archived!.name,
        tagline: archived!.tagline ?? "",
        description: archived!.description ?? "",
        sortOrder: archived!.sortOrder ?? 0,
        isReady: true,
        ...(archived!.heroImage ? { heroImage: archived!.heroImage } : {}),
        status: "published",
        ...(archived!.seo ? { seo: archived!.seo } : {}),
      },
      archived!.id,
    );
    expect(restored.status).toBe("published");
    expect(restored.id).toBe(archived!.id); // same id — no recreation
    expect(restored.createdAt).toBe(archived!.createdAt); // history preserved

    const publicList = await catalogue.listCategories(false);
    expect(publicList.some((c) => c.id === restored.id)).toBe(true);
  });

  it("draft categories also appear in the admin list and never in the public one", async () => {
    const draft = await catalogue.upsertCategory({
      slug: "draft-test-cat",
      name: "Draft Test Category",
      tagline: "",
      description: "A draft category used by the archive lifecycle tests.",
      sortOrder: 999,
      isReady: false,
      status: "draft",
    });
    expect(draft.status).toBe("draft");

    const adminView = await catalogue.listAllCategories();
    expect(adminView.some((c) => c.id === draft.id)).toBe(true);
    const publicList = await catalogue.listCategories(false);
    expect(publicList.some((c) => c.id === draft.id)).toBe(false);
  });
});

/* ---------------------------------- Pages ----------------------------------- */

describe("Pages — archive lifecycle", () => {
  it("archiving a page persists it with content and SEO intact, and the admin list still returns it", async () => {
    const created = await pages.create(customPageBody("gift-guide-archive"), owner);
    expect(created.status).toBe("published");

    const archived = await pages.setStatus(created.id, "archived", owner);
    expect(archived.status).toBe("archived");

    // NOT deleted — the doc persists with every field intact
    const stored = await db.get<PageDoc>(COLLECTIONS.pages, created.id);
    expect(stored).toBeTruthy();
    expect(stored?.status).toBe("archived");
    expect(stored?.title).toBe(created.title);
    expect(stored?.slug).toBe(created.slug);
    expect(stored?.seo?.title).toBe("Gift guide SEO");
    expect(stored?.content).toEqual(created.content);

    // Admin console sees it (list returns every status — the Archived filter works)
    const adminList = await pages.list();
    const visible = adminList.find((p) => p.id === created.id);
    expect(visible?.status).toBe("archived");
  });

  it("archived pages are public 404s and never listed publicly; archiving never publishes", async () => {
    const created = await pages.create(customPageBody("gift-guide-hidden"), owner);
    await pages.setStatus(created.id, "archived", owner);

    await expect(pages.getPublicBySlug("gift-guide-hidden")).rejects.toThrow(/not found/i);
    const publicList = await pages.listPublic();
    expect(publicList.some((p) => p.slug === "gift-guide-hidden")).toBe(false);

    const stored = await db.get<PageDoc>(COLLECTIONS.pages, created.id);
    expect(stored?.status).toBe("archived");
    expect(stored?.status).not.toBe("published");
  });

  it("restore returns the archived page to draft with content intact; publish brings it back live", async () => {
    const created = await pages.create(customPageBody("gift-guide-restore"), owner);
    await pages.setStatus(created.id, "archived", owner);

    const restored = await pages.setStatus(created.id, "draft", owner);
    expect(restored.status).toBe("draft");
    expect(restored.content).toEqual(created.content); // content preserved through archive
    expect(restored.seo).toEqual(created.seo);

    // It is NOT live yet — restore ≠ publish
    await expect(pages.getPublicBySlug("gift-guide-restore")).rejects.toThrow(/not found/i);

    const republished = await pages.setStatus(created.id, "published", owner);
    expect(republished.status).toBe("published");
    const publicNow = await pages.getPublicBySlug("gift-guide-restore");
    expect(publicNow.slug).toBe("gift-guide-restore");
  });

  it("built-in pages can be archived and restored too — the shipped content is never lost", async () => {
    const builtIn = (await pages.list()).find((p) => p.builtIn);
    expect(builtIn).toBeTruthy();

    const archived = await pages.setStatus(builtIn!.id, "archived", owner);
    expect(archived.status).toBe("archived");
    expect(archived.content).toEqual(builtIn!.content);

    // Public surface drops it
    await expect(pages.getPublicBySlug(builtIn!.slug)).rejects.toThrow(/not found/i);
    const publicList = await pages.listPublic();
    expect(publicList.some((p) => p.slug === builtIn!.slug)).toBe(false);

    // Restore to published brings the same doc back with its content
    const restored = await pages.setStatus(builtIn!.id, "published", owner);
    expect(restored.status).toBe("published");
    expect(restored.content).toEqual(builtIn!.content);
    const publicAgain = await pages.getPublicBySlug(builtIn!.slug);
    expect(publicAgain.slug).toBe(builtIn!.slug);
  });

  it("archiving does not invoke the permanent-delete path (remove() still refuses built-ins)", async () => {
    const created = await pages.create(customPageBody("gift-guide-nodelete"), owner);
    await pages.setStatus(created.id, "archived", owner);
    const stillThere = await db.get<PageDoc>(COLLECTIONS.pages, created.id);
    expect(stillThere?.status).toBe("archived");

    // The separate delete path still exists and still protects built-ins
    const builtIn = (await pages.list()).find((p) => p.builtIn);
    await expect(pages.remove(builtIn!.id)).rejects.toThrow(/cannot be deleted/i);
  });
});
