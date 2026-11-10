"use client";
/**
 * /products/new — Add Product page per the approved heritage design.
 * Renders the shared ProductForm in create mode; on success we route to the new
 * product's edit page so the variants can be tuned further.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePageTitle } from "@/lib/hooks";
import type { ProductWithVariants } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import {
  ProductForm,
  emptyProductForm,
  emptyVariantRow,
  type ImageRow,
  type VariantRow,
} from "@/components/products/product-form";

export default function NewProductPage() {
  usePageTitle("Add Product");
  const router = useRouter();
  const { principal } = useAuth();
  const canWrite = can(principal, "products:write");

  const [form, setForm] = useState(emptyProductForm);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([emptyVariantRow()]);
  const [imageRows, setImageRows] = useState<ImageRow[]>([]);

  if (!canWrite) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Add Product" description="You need products:write permission to create products." />
        <Card className="p-6 text-body-sm text-on-surface-variant">
          Ask an owner for <strong>products:write</strong> to open the create form.
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/products"
        className="group mb-2 inline-flex items-center gap-1.5 text-label-md font-semibold text-on-surface-variant transition-colors hover:text-primary"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
        </svg>
        Back to Products
      </Link>
      <PageHeader
        title="Add New Heritage Product"
        description="Stage a new product for the catalogue — set its provenance, package variants, tiered pricing and storefront visibility. New products start as drafts until you publish them."
      />
      <ProductForm
        mode="create"
        hydrationKey="new"
        form={form}
        setForm={setForm}
        variantRows={variantRows}
        setVariantRows={setVariantRows}
        imageRows={imageRows}
        setImageRows={setImageRows}
        onSaved={(product: ProductWithVariants) => router.push(`/products/${product.id}`)}
      />
    </div>
  );
}
