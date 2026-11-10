/**
 * CMS → designed-page slot mapping (storefront entry).
 *
 * THE BUG THIS FIXES: built-in designed pages (Our Story /about, Contact)
 * ship a boot-seeded CMS document that mirrors the approved copy section by
 * section. When an admin edits anything and publishes, the WHOLE document was
 * previously dumped into one generic "story band" while the approved design
 * below still rendered its own copy — every section appeared twice and the
 * page collapsed into a plain wall of blocks ("the design becomes very ugly").
 *
 * THE FIX: admin sections flow INTO the approved designs by their stable
 * anchor ids. Each known id maps to one editable slot of the design (hero
 * copy, philosophy paragraphs, principle cards, …); only sections with an
 * unknown/blank id render as an extra story band. A managed slot falls back
 * per-part to the approved copy whenever the admin left that part empty, so a
 * half-edited page can never render hollow, and a design section the admin
 * has not touched keeps the approved look exactly.
 *
 * The mapping itself, the approved fallback copy and the inline-markup rules
 * live in @annaadhya/contracts/cms-design — the single source of truth shared
 * with the admin panel's slot-accurate preview (what the admin previews there
 * is exactly what this storefront renders).
 */
import type { CmsDocumentBlock, CmsSection, PublicPageDoc } from "@/lib/types";
import { mapDocumentToSlots, isCustomizedTitle } from "@annaadhya/contracts/cms-design";

/** The editable copy a single designed slot consumes (local mirror of the
 *  contracts shape — keeps this bundle client-lean). */
export interface SlotCopy {
  eyebrow?: string;
  title?: string;
  paragraphs: string[];
  listItems: { title?: string; text: string }[];
  cards: { title: string; text: string }[];
  image?: { src: string; alt: string; caption?: string };
  ctas: { label: string; href: string; note?: string }[];
  banner?: { title: string; text: string };
}

export interface MappedCmsPage {
  /** The admin's page title (already trimmed). */
  title: string;
  /** The admin's document lede (already trimmed). */
  lede: string;
  /** Managed slots by their stable anchor id (only ids the page declares). */
  byId: Record<string, SlotCopy>;
  /** Sections with an unknown/blank anchor id that carry blocks — these render
   *  as the extra story band inside the design. */
  extras: { section: CmsSection; blocks: CmsDocumentBlock[] }[];
}

/**
 * Map an admin-published page into design slots.
 *
 * @param page      the public page doc (or null)
 * @param knownIds  the stable anchor ids the designed page consumes, e.g.
 *                  ["story","philosophy",…] for /about
 */
export function mapCmsPageToSlots(page: PublicPageDoc | null, knownIds: readonly string[]): MappedCmsPage | null {
  if (!page?.adminEdited || page.content.kind !== "document") return null;
  const mapped = mapDocumentToSlots(page.title, page.content, knownIds);
  return mapped as MappedCmsPage | null;
}

export { isCustomizedTitle };
