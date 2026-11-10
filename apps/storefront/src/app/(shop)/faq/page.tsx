import type { Metadata } from "next";
import { getCategoryOverview, getPage, getPublicSettings } from "@/lib/api";
import { FaqExplorer } from "./faq-explorer";
import type { FaqCategoryId, FaqEntry } from "@/lib/faq-content";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Honest answers about ordering, shipping, payments, products, returns and gifting at Annaadhya Products — matching our published policies.",
  openGraph: {
    title: "FAQ | Annaadhya Products",
    description:
      "Ordering, shipping, payments, returns and gifting — answered plainly, matching our published policies.",
    type: "website",
    siteName: "Annaadhya Products",
  },
};

/** Admin-managed FAQ entries (CMS slug "faq") override the built-in set when a
 *  published page doc exists. Categories unknown to the explorer's pill set are
 *  kept discoverable by bucketing them under "products" (never silently dropped). */
const VALID_CATEGORIES = new Set<FaqCategoryId>([
  "orders",
  "shipping",
  "payments",
  "products",
  "returns",
  "gifts",
  "account",
]);

function cmsToFaqEntries(
  entries: { category: string; question: string; answer: string }[],
): FaqEntry[] {
  return entries.map((e, i) => ({
    id: `cms-faq-${i + 1}`,
    category: (VALID_CATEGORIES.has(e.category as FaqCategoryId) ? e.category : "products") as FaqCategoryId,
    question: e.question,
    answer: e.answer,
  }));
}

export default async function FaqPage() {
  const [settings, cmsPage, overview] = await Promise.all([
    getPublicSettings(),
    getPage("faq"),
    getCategoryOverview(),
  ]);

  // Truth discipline (same rule as the contact + account pages): a `.example`
  // address is the seeded placeholder — it is never rendered as a real channel.
  const candidate = settings?.store.supportEmail?.trim() ?? "";
  const supportEmail = candidate && !/\.example$/i.test(candidate) ? candidate : null;

  const cmsEntries =
    cmsPage && cmsPage.content.kind === "faq" ? cmsToFaqEntries(cmsPage.content.entries) : undefined;

  // Deletion doctrine: answer copy may mention a category that the owner later
  // deleted — those inline links degrade to plain text instead of 404ing.
  const liveCategorySlugs = overview ? new Set(overview.categories.map((c) => c.slug)) : null;

  return <FaqExplorer supportEmail={supportEmail} entries={cmsEntries} liveCategorySlugs={liveCategorySlugs} />;
}
