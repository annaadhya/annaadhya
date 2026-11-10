/**
 * Client-side zod mirrors of the server DTOs (packages/contracts/src/dto/admin.ts).
 * The API always re-validates; these give the admin instant, offline feedback with the
 * exact same rules before a request is spent.
 */
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const skuSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9\-_.]{2,40}$/, "SKU must be 3-41 chars: A-Z, 0-9, dashes");

/** Absolute https(s) URLs (Cloudinary) and site-rooted paths (/demo-images/…) are both real,
 *  supported image references — the demo catalogue ships with the latter. */
const imageUrlSchema = z
  .string()
  .trim()
  .max(600)
  .refine(
    (v) => /^https?:\/\/.+/i.test(v) || v.startsWith("/"),
    "Image URL must be absolute (https://…) or a site-rooted path (/demo-images/…)",
  );

export const productImageSchema = z.object({
  url: imageUrlSchema,
  cloudinaryPublicId: z.string().max(200).optional(),
  alt: z.string().trim().max(160),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
});

export const variantUpsertSchema = z.object({
  id: idSchema.optional(),
  sku: skuSchema,
  packLabel: z.string().trim().min(1).max(40),
  grams: z.number().positive().max(1_000_000),
  pricePaise: z
    .number()
    .int()
    .min(0)
    .max(99_999_999_999)
    .refine((v) => v > 0, "Selling price must be greater than zero"),
  mrpPaise: z.number().int().min(0).max(99_999_999_999).optional(),
  status: z.enum(["draft", "published", "archived"]),
  stockOnHand: z.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.number().int().min(0).max(100_000),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const productUpsertSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(2).max(120),
  subtitle: z.string().trim().max(180),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(20000),
  categoryId: idSchema,
  typeLabel: z.string().trim().max(120),
  status: z.enum(["draft", "published", "archived"]),
  images: z.array(productImageSchema).max(10),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers and dashes")
    .min(3, "Slug must be at least 3 characters")
    .max(96)
    .optional(),
  origin: z.string().trim().max(200).optional(),
  shelfLife: z.string().trim().max(80).optional(),
  specs: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        value: z.string().trim().max(200),
      }),
    )
    .max(12)
    .optional(),
  ingredients: z.string().trim().max(2000).optional(),
  netQuantityLabel: z.string().trim().max(80).optional(),
  storageInstructions: z.string().trim().max(1000).optional(),
  allergenInfo: z.string().trim().max(500).optional(),
  manufacturerDetails: z.string().trim().max(500).optional(),
  fssaiLicense: z.string().trim().max(80).optional(),
  bestsellerRank: z.number().int().min(1).max(1000).optional(),
  featuredRank: z.number().int().min(1).max(1000).optional(),
  giftItem: z.boolean(),
  searchVisible: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  backorderPolicy: z.enum(["deny", "allow", "notify"]).optional(),
  seo: z.object({
    title: z.string().trim().max(180).optional(),
    description: z.string().trim().max(320).optional(),
  }),
  variants: z.array(variantUpsertSchema).max(20),
});

/** Format zod issues into the flat list the product form renders. */
export function zodErrorList(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.filter((p) => p !== "").join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
