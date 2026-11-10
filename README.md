# Annaadhya Products — Commerce Platform

Monorepo for the **Annaadhya Products** e-commerce platform: a customer storefront, a protected
business admin panel, and a NestJS REST API backed by Firebase Authentication + Cloud Firestore
(with a fully functional in-memory provider for development and testing without credentials).

## Applications & packages

| Path | Purpose |
|---|---|
| `apps/storefront` | Customer-facing Next.js storefront (browse, cart, checkout, account) |
| `apps/admin` | Protected Next.js admin panel (products, orders, inventory, reports, team) |
| `apps/api` | NestJS REST API under `/api/v1` with OpenAPI docs |
| `packages/contracts` | Shared TypeScript types, Zod schemas, permissions matrix |
| `packages/utils` | Safe shared utilities (money in integer paise, slugs, time) |
| `packages/data-core` | Data access: Firestore provider + in-memory provider + seed engine |
| `packages/config` | Shared tsconfig / eslint presets |
| `tools/seed-demo-data` | Validate / dry-run / seed / reset demo catalogue data |
| `tools/import-catalogue` | Catalogue workbook (`.xlsx`) validation & import |
| `tools/export-validation` | Data integrity checks for exports |

## Quick start (no external credentials required)

```bash
pnpm install

# 1. Start the API in in-memory mode (mock auth + mock payments)
pnpm dev:api            # http://localhost:4000/api/v1  (Swagger at /api/docs)

# 2. Start the storefront
pnpm dev:storefront     # http://localhost:3000

# 3. Start the admin panel
pnpm dev:admin          # http://localhost:3001
```

In development without Firebase/Razorpay/Cloudinary credentials the platform runs in an explicit
**mock mode**: data lives in the in-memory provider, authentication uses clearly-marked dev tokens,
and payments use the mock adapter. Mock mode is hard-refused when `NODE_ENV=production`.

Load the demo catalogue (20 products from the Annaadhya demo workbook):

```bash
pnpm seed:validate && pnpm seed:dry-run && pnpm seed:demo
```

## Documentation

See `docs/` — starting with `docs/architecture.md`, `docs/environment-setup.md` and
`docs/launch-checklist.md`.

## Status

Implemented / configured / tested states are tracked honestly in `docs/launch-checklist.md`.
Integrations that require real credentials (Firebase, Cloudinary, Razorpay, hosting) are built and
guarded, but are **not verified** until a real test passes against configured projects.
