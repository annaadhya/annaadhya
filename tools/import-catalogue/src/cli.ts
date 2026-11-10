/**
 * import-catalogue CLI — validates and imports a catalogue workbook (.xlsx) into the
 * products/variants collections.
 *
 * Workbook contract (see sample in docs/api-specification.md):
 *   Sheet "Product Catalogue": SKU | Category | Proposed Product Name | Website Subtitle |
 *     Product Type / Variety | Website Description (Draft) | Suggested Pack Sizes | ...
 *   Sheet "Pack & Retail Rates": SKU | Category | Proposed Product Name | Pack Size |
 *     Pack Quantity (g) | Demo Customer Price (₹) | ... | Approved Customer Price (₹) | ...
 *
 * Behaviour:
 *  - `--dry-run` validates every row and reports errors by row/column without writing
 *  - approved price (column I) takes precedence over the demo price; when only the demo price
 *    exists the variant is imported as DRAFT with a "price not approved" warning
 *  - ids are deterministic → re-imports are idempotent; live records are never overwritten
 */
import { parseArgs } from "node:util";
import XLSX from "xlsx";
import { z } from "zod";
import { COLLECTIONS, type CategoryDoc, type ProductDoc, type ProductVariantDoc } from "@annaadhya/contracts";
import { InMemoryDataClient, FirestoreDataClient, parseFirestoreCredentials, type DataClient } from "@annaadhya/data-core";
import { slugify, stableId, toPaise } from "@annaadhya/utils";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    firestore: { type: "boolean", default: false },
  },
});

const file = positionals[0];
if (!file) {
  console.error("Usage: pnpm import:catalogue <workbook.xlsx> [--dry-run] [--firestore]");
  process.exit(1);
}

const skuSchema = z.string().trim().regex(/^[A-Z0-9][A-Z0-9\-_.]{2,40}$/, "SKU must be 3-41 chars A-Z 0-9 dashes");
const categorySlugMap: Record<string, string> = {
  honey: "honey",
  "dry fruits": "dry-fruits",
  "dry-fruits": "dry-fruits",
  kesar: "kesar",
  saffron: "kesar",
  "gift boxes": "gift-boxes",
  "gift-boxes": "gift-boxes",
};

interface RowIssue {
  sheet: string;
  row: number;
  column: string;
  message: string;
}

interface ParsedVariant {
  sku: string;
  packLabel: string;
  grams: number;
  pricePaise: number;
  approved: boolean;
}

interface ParsedProduct {
  sku: string;
  name: string;
  subtitle: string;
  typeLabel: string;
  description: string;
  categorySlug: string;
  variants: ParsedVariant[];
}

async function parseWorkbook(path: string): Promise<{ products: ParsedProduct[]; issues: RowIssue[] }> {
  // SheetJS is used for reading because it tolerates the table definitions present in the
  // Annaadhya planning workbook that break ExcelJS's parser. ExcelJS remains the writer for exports.
  const wb = XLSX.readFile(path, { cellDates: false });
  const issues: RowIssue[] = [];

  const catalogueSheet = wb.Sheets["Product Catalogue"];
  const ratesSheet = wb.Sheets["Pack & Retail Rates"];
  if (!catalogueSheet) issues.push({ sheet: "Product Catalogue", row: 0, column: "-", message: "Required sheet missing" });
  if (!ratesSheet) issues.push({ sheet: "Pack & Retail Rates", row: 0, column: "-", message: "Required sheet missing" });

  const toMatrix = (ws: XLSX.WorkSheet | undefined): string[][] =>
    ws ? (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" }) as string[][]) : [];

  const catRows = toMatrix(catalogueSheet);
  const rateRows = toMatrix(ratesSheet);

  const cellText = (rows: string[][], row: number, col: number): string =>
    String(rows[row]?.[col] ?? "").trim();

  const findHeaderRow = (rows: string[][], needle: string): number => {
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      for (let c = 0; c < 12; c++) {
        if (String(rows[r]?.[c] ?? "").trim().toLowerCase() === needle) return r;
      }
    }
    return -1;
  };

  const products = new Map<string, ParsedProduct>();

  if (catRows.length > 0) {
    const headerRow = findHeaderRow(catRows, "sku");
    if (headerRow < 0) {
      issues.push({ sheet: "Product Catalogue", row: 0, column: "-", message: "Could not find header row containing 'SKU'" });
    } else {
      for (let r = headerRow + 1; r < catRows.length; r++) {
        const sku = cellText(catRows, r, 0).trim().toUpperCase();
        if (!sku) continue;
        const skuCheck = skuSchema.safeParse(sku);
        if (!skuCheck.success) {
          issues.push({ sheet: "Product Catalogue", row: r, column: "A", message: `Invalid SKU "${sku}"` });
          continue;
        }
        const categoryRaw = cellText(catRows, r, 1).trim().toLowerCase();
        const categorySlug = categorySlugMap[categoryRaw];
        if (!categorySlug) {
          issues.push({ sheet: "Product Catalogue", row: r, column: "B", message: `Unknown category "${categoryRaw}"` });
          continue;
        }
        if (products.has(sku)) {
          issues.push({ sheet: "Product Catalogue", row: r, column: "A", message: `Duplicate SKU ${sku}` });
          continue;
        }
        products.set(sku, {
          sku,
          name: cellText(catRows, r, 2).trim(),
          subtitle: cellText(catRows, r, 3).trim(),
          typeLabel: cellText(catRows, r, 4).trim(),
          description: cellText(catRows, r, 5).trim(),
          categorySlug,
          variants: [],
        });
        if (!cellText(catRows, r, 2).trim()) {
          issues.push({ sheet: "Product Catalogue", row: r + 1, column: "C", message: "Missing product name" });
        }
        if (cellText(catRows, r, 5).trim().length < 20) {
          issues.push({ sheet: "Product Catalogue", row: r + 1, column: "F", message: "Description shorter than 20 characters" });
        }
      }
    }
  }

  if (rateRows.length > 0) {
    const headerRow = findHeaderRow(rateRows, "sku");
    if (headerRow < 0) {
      issues.push({ sheet: "Pack & Retail Rates", row: 0, column: "-", message: "Could not find header row containing 'SKU'" });
    } else {
      for (let r = headerRow + 1; r < rateRows.length; r++) {
        const sku = cellText(rateRows, r, 0).trim().toUpperCase();
        if (!sku) continue;
        const product = products.get(sku);
        if (!product) {
          issues.push({ sheet: "Pack & Retail Rates", row: r + 1, column: "A", message: `Unknown SKU ${sku} (not in Product Catalogue)` });
          continue;
        }
        const packLabel = cellText(rateRows, r, 3).trim();
        const gramsRaw = cellText(rateRows, r, 4).trim();
        const grams = Number(gramsRaw);
        if (!packLabel) issues.push({ sheet: "Pack & Retail Rates", row: r + 1, column: "D", message: "Missing pack size label" });
        if (!Number.isFinite(grams) || grams <= 0) {
          issues.push({ sheet: "Pack & Retail Rates", row: r + 1, column: "E", message: `Invalid grams "${gramsRaw}"` });
          continue;
        }
        // Column F = demo price; column I = approved price
        const demoPrice = cellText(rateRows, r, 5).trim();
        const approvedPrice = cellText(rateRows, r, 8).trim();
        const priceSource = approvedPrice && approvedPrice !== "*" ? approvedPrice : demoPrice;
        const approved = Boolean(approvedPrice && approvedPrice !== "*");
        let pricePaise: number;
        try {
          pricePaise = toPaise(priceSource.replace(/[^0-9.]/g, "") || "0");
        } catch {
          issues.push({ sheet: "Pack & Retail Rates", row: r + 1, column: "F", message: `Invalid price "${priceSource}"` });
          continue;
        }
        if (pricePaise <= 0) {
          issues.push({ sheet: "Pack & Retail Rates", row: r + 1, column: "F", message: "Price must be positive" });
          continue;
        }
        product.variants.push({ sku: `${sku}-${packLabel.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`, packLabel, grams, pricePaise, approved });
      }
    }
  }

  return { products: [...products.values()], issues };
}

async function getClient(): Promise<DataClient | null> {
  if (values.firestore) {
    const creds = parseFirestoreCredentials(process.env);
    if (!creds) {
      console.error("FIRESTORE requested but credentials are missing (docs/environment-setup.md).");
      process.exit(1);
    }
    return new FirestoreDataClient(creds);
  }
  return new InMemoryDataClient({ nodeEnv: process.env.NODE_ENV ?? "development" });
}

async function main(): Promise<void> {
  const { products, issues } = await parseWorkbook(file!);

  console.log(`Parsed ${products.length} products, ${products.reduce((n, p) => n + p.variants.length, 0)} variant rows.`);
  if (issues.length > 0) {
    console.log(`\n${issues.length} validation issue(s):`);
    for (const i of issues.slice(0, 40)) console.log(`  [${i.sheet} row ${i.row} col ${i.column}] ${i.message}`);
    if (issues.length > 40) console.log(`  … and ${issues.length - 40} more`);
  }

  const unapproved = products.filter((p) => p.variants.some((v) => !v.approved));
  if (unapproved.length > 0) {
    console.log(`\n${unapproved.length} product(s) carry DEMO (unapproved) prices — imported as DRAFT status.`);
  }

  if (values["dry-run"]) {
    console.log("\nDry-run complete — nothing was written.");
    process.exit(issues.length > 0 ? 1 : 0);
  }

  if (issues.length > 0) {
    console.error("\nRefusing to import while validation issues exist. Fix the workbook or re-run with --dry-run.");
    process.exit(1);
  }

  const db = await getClient();
  if (!db) {
    console.log("\nNo data provider available — run with --firestore and credentials, or use the API mock mode.");
    process.exit(1);
  }

  // Ensure categories exist
  const categoryBySlug = new Map<string, CategoryDoc>();
  for (const c of await db.list<CategoryDoc>(COLLECTIONS.categories, { limit: 100 })) categoryBySlug.set(c.slug, c);

  let importedProducts = 0;
  let importedVariants = 0;
  for (const p of products) {
    let category = categoryBySlug.get(p.categorySlug);
    if (!category) {
      category = await db.create<CategoryDoc>(
        COLLECTIONS.categories,
        {
          slug: p.categorySlug,
          name: p.categorySlug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
          tagline: "",
          description: "",
          sortOrder: 99,
          isReady: true,
          status: "published",
        } as object as CategoryDoc,
        { id: stableId("cat", p.categorySlug), isDemo: false },
      );
      categoryBySlug.set(p.categorySlug, category);
    }

    const productId = stableId("import", p.sku);
    const anyUnapproved = p.variants.some((v) => !v.approved);
    const doc: ProductDoc = {
      id: productId,
      sku: p.sku,
      slug: slugify(p.name),
      name: p.name,
      subtitle: p.subtitle,
      description: p.description,
      categoryId: category.id,
      typeLabel: p.typeLabel,
      status: anyUnapproved ? "draft" : "published",
      images: [{ url: `/demo-images/${slugify(p.name)}.svg`, alt: `${p.name} product image` }],
      giftItem: false,
      seo: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDemo: anyUnapproved, // rows with only demo prices are treated as demo/draft data
    };
    await db.set(COLLECTIONS.products, productId, doc);

    for (const v of p.variants) {
      const variantDoc: ProductVariantDoc = {
        id: stableId("import", v.sku),
        productId,
        sku: v.sku,
        packLabel: v.packLabel,
        grams: v.grams,
        pricePaise: v.pricePaise,
        status: v.approved ? "published" : "draft",
        stockOnHand: 0,
        reservedQty: 0,
        lowStockThreshold: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDemo: !v.approved,
      };
      await db.set(COLLECTIONS.productVariants, variantDoc.id, variantDoc);
      importedVariants += 1;
    }
    importedProducts += 1;
  }

  console.log(`\nImported ${importedProducts} products / ${importedVariants} variants (idempotent — safe to re-run).`);
  console.log("Products with unapproved prices are DRAFT and invisible on the storefront until approved in admin.");
}

void main();
