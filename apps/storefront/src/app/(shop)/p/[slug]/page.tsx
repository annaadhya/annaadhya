/** CMS custom pages — any page created in Admin → Storefront → Pages that is not
 *  a built-in storefront page renders here at /p/{slug} through the reusable
 *  heritage document template. Only published pages exist publicly; drafts and
 *  unknown slugs are a genuine 404. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage } from "@/lib/api";
import { CmsDocument } from "@/components/blocks/document-blocks";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return { title: "Page" };
  return {
    title: page.seo?.title || page.title,
    description: page.seo?.description || undefined,
    openGraph: {
      title: page.seo?.title || page.title,
      description: page.seo?.description || undefined,
      ...(page.seo?.socialImage ? { images: [{ url: page.seo.socialImage }] } : {}),
    },
    alternates: { canonical: `/p/${page.slug}` },
  };
}

export default async function CustomPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();
  return <CmsDocument page={page} />;
}
