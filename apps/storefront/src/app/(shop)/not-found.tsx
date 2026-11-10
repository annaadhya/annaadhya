import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

/** Thrown notFound() inside (shop) routes (unknown product, category or policy
 *  slugs) renders this boundary with the full (shop) chrome from the group
 *  layout. Completely unmatched URLs fall through to the root not-found file,
 *  which composes the same chrome from the same shared components. */
export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
