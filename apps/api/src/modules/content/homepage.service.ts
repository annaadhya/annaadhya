/** CMS Homepage service — section content for the storefront homepage
 *  (signature collections, trust cards, heritage story strip, gifting banner).
 *  Hero copy intentionally remains in SettingsDoc.storefront (edited via the
 *  same settings API). Empty strings / missing fields mean "use the approved
 *  design default" — the storefront keeps its curated fallbacks. */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  type HomepageDoc,
  type HomepageUpdateDto,
} from "@annaadhya/contracts";
import { type DataClient } from "@annaadhya/data-core";
import { DATA_CLIENT } from "../../data/data.module";
import { pushRevalidate } from "./revalidate";

const HOMEPAGE_ID = "global";

export function defaultHomepage(): HomepageDoc {
  return {
    id: HOMEPAGE_ID,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDemo: false,
    collections: { enabled: true, items: [] },
    trust: { enabled: true, items: [] },
    story: { enabled: true },
    gifting: { enabled: true },
  };
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    const current = out[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      out[key] = deepMerge(current, value as DeepPartial<typeof current>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

@Injectable()
export class HomepageService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  async get(): Promise<HomepageDoc> {
    const doc = await this.data.get<HomepageDoc>(COLLECTIONS.homepage, HOMEPAGE_ID);
    if (doc) return doc;
    const created = await this.data.set(COLLECTIONS.homepage, HOMEPAGE_ID, defaultHomepage(), {
      isDemo: false,
    });
    return created as unknown as HomepageDoc;
  }

  async update(patch: HomepageUpdateDto): Promise<HomepageDoc> {
    const current = await this.get();
    // `items` arrays are replaced wholesale (not merged) so admins can remove rows.
    const merged = deepMerge(current, patch as DeepPartial<HomepageDoc>);
    merged.updatedAt = Date.now();
    const saved = (await this.data.set(COLLECTIONS.homepage, HOMEPAGE_ID, merged as object, {
      isDemo: false,
    })) as unknown as HomepageDoc;
    await pushRevalidate({ tags: ["cms", "homepage"], paths: ["/"] });
    return saved;
  }
}
