/** Global settings singleton with safe defaults (seeded when missing). */
import { Inject, Injectable } from "@nestjs/common";
import { COLLECTIONS, type PublicStoreSettings, type SettingsDoc } from "@annaadhya/contracts";
import { DATA_CLIENT } from "../../data/data.module";
import type { DataClient } from "@annaadhya/data-core";
import { defaultSettings } from "@annaadhya/data-core";
import { pushRevalidate } from "../content/revalidate";

const SETTINGS_ID = "global";

@Injectable()
export class SettingsService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  async get(): Promise<SettingsDoc> {
    const doc = await this.data.get<SettingsDoc>(COLLECTIONS.settings, SETTINGS_ID);
    if (!doc) {
      const created = await this.data.set(COLLECTIONS.settings, SETTINGS_ID, defaultSettings(), {
        isDemo: false,
      });
      return created as unknown as SettingsDoc;
    }
    // Legacy-shape guard: a settings doc written before a section/field existed
    // (e.g. shipping added later) previously surfaced as undefined mode/amounts —
    // 500s on the public settings endpoint and cryptic admin save errors. Defaults
    // fill any gap; stored values always win.
    return deepMerge(defaultSettings(), doc) as SettingsDoc;
  }

  async update(patch: DeepPartial<SettingsDoc>): Promise<SettingsDoc> {
    const current = await this.get();
    const merged = deepMerge(current, patch) as SettingsDoc;
    merged.updatedAt = Date.now();
    const saved = (await this.data.set(
      COLLECTIONS.settings,
      SETTINGS_ID,
      merged as object,
      { isDemo: false },
    )) as unknown as SettingsDoc;
    // Settings feed the storefront hero, announcement strip and contact page — nudge
    // the storefront's on-demand revalidation (tagged "settings") so changes show up
    // in seconds instead of waiting out the ISR TTL. Fire-and-forget by contract:
    // pushRevalidate never throws and returns false when unconfigured.
    await pushRevalidate({ tags: ["settings"], paths: ["/"] });
    return saved;
  }

  /** Whitelisted projection for the public storefront (GET /settings/public). */
  async getPublic(): Promise<PublicStoreSettings> {
    const s = await this.get();
    return {
      store: {
        name: s.store.name,
        supportEmail: s.store.supportEmail,
        supportPhone: s.store.supportPhone,
        addressLines: s.store.addressLines,
        socialLinks: s.store.socialLinks,
        announcement: s.store.announcement,
      },
      storefront: {
        newsletterEnabled: s.storefront.newsletterEnabled,
        giftCollectionEnabled: s.storefront.giftCollectionEnabled,
        heroHeadline: s.storefront.heroHeadline ?? "",
        heroHeadlineAccent: s.storefront.heroHeadlineAccent ?? "",
        heroSubcopy: s.storefront.heroSubcopy ?? "",
        heroImage: s.storefront.heroImage ?? undefined,
        heroCtaHref: s.storefront.heroCtaHref ?? "",
        heroCtaLabel: s.storefront.heroCtaLabel ?? undefined,
      },
      shipping: {
        mode: s.shipping.mode,
        flatRatePaise: s.shipping.flatRatePaise,
        freeAbovePaise: s.shipping.freeAbovePaise,
      },
    };
  }
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) || Array.isArray(patch) || typeof base !== "object" || typeof patch !== "object") {
    return patch as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = deepMerge((base as Record<string, unknown>)[k], v as DeepPartial<unknown>);
  }
  return out as T;
}
