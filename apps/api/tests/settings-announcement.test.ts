/**
 * Settings announcement-strip contract tests — the top maroon strip is wired to
 * store.announcement (2026-11-11), so: the legacy seed demo message must never
 * leak onto the live strip, the owner tagline rides the public projection, and
 * a settings patch without a storefront group leaves hero/flag values untouched
 * (the Settings console no longer sends that group — the Homepage console owns it).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDataClient } from "@annaadhya/data-core";
import { COLLECTIONS } from "@annaadhya/contracts";
import { SettingsService } from "../src/modules/settings/settings.service";

process.env.NODE_ENV = "test";

const LEGACY_DEMO = "Demo catalogue live — prices are illustrative placeholders pending approval.";

let db: InMemoryDataClient;
let settings: SettingsService;

beforeEach(async () => {
  db = new InMemoryDataClient({ nodeEnv: "test" });
  settings = new SettingsService(db);
});

describe("announcement strip settings", () => {
  it("normalizes the legacy demo announcement to disabled+empty", async () => {
    await db.set(COLLECTIONS.settings, "global", {
      id: "global",
      updatedAt: Date.now(),
      store: {
        name: "Store",
        legalName: "Store",
        supportEmail: "s@s.test",
        supportPhone: "",
        addressLines: [],
        socialLinks: {},
        announcement: { enabled: true, message: LEGACY_DEMO, href: "/shop" },
      },
    });
    const doc = await settings.get();
    expect(doc.store.announcement).toEqual({ enabled: false, message: "" });
    const pub = await settings.getPublic();
    expect(pub.store.announcement.enabled).toBe(false);
    expect(pub.store.announcement.message).toBe("");
  });

  it("keeps a real owner announcement and exposes the tagline on the public projection", async () => {
    await db.set(COLLECTIONS.settings, "global", {
      id: "global",
      updatedAt: Date.now(),
      store: {
        name: "Store",
        legalName: "Store",
        supportEmail: "s@s.test",
        supportPhone: "",
        addressLines: [],
        socialLinks: {},
        announcement: {
          enabled: true,
          message: "Festive hampers are here",
          href: "/shop",
          tagline: "Small-batch honey, straight from the forest",
        },
      },
    });
    const pub = await settings.getPublic();
    expect(pub.store.announcement.enabled).toBe(true);
    expect(pub.store.announcement.message).toBe("Festive hampers are here");
    expect(pub.store.announcement.tagline).toBe("Small-batch honey, straight from the forest");
  });

  it("deep-merges an announcement patch and leaves the storefront group untouched when omitted", async () => {
    await settings.get(); // seeds defaults
    await settings.update({
      storefront: { heroHeadline: "Keep me", newsletterEnabled: true, giftCollectionEnabled: true },
    });
    const afterFirst = await settings.get();
    expect(afterFirst.storefront.heroHeadline).toBe("Keep me");
    expect(afterFirst.storefront.newsletterEnabled).toBe(true);

    await settings.update({
      store: { announcement: { enabled: true, message: "Now live", tagline: "Own tagline" } },
    });
    const afterSecond = await settings.get();
    expect(afterSecond.store.announcement).toMatchObject({ enabled: true, message: "Now live", tagline: "Own tagline" });
    // The patch omitted the storefront group — values must survive untouched.
    expect(afterSecond.storefront.heroHeadline).toBe("Keep me");
    expect(afterSecond.storefront.newsletterEnabled).toBe(true);
    expect(afterSecond.storefront.giftCollectionEnabled).toBe(true);
  });
});
