# Architecture

Annaadhya Products is a pnpm monorepo with independently deployable applications, a shared
contract layer, and a swappable data provider. This document explains the shape of the system and
the reasoning behind its important decisions.

## System overview

```
┌────────────────────┐      ┌────────────────────┐
│  apps/storefront   │      │     apps/admin     │
│  Next.js (3000)    │      │  Next.js (3001)    │
│  customer shopping │      │  business ops      │
└─────────┬──────────┘      └─────────┬──────────┘
          │  HTTPS (REST /api/v1)     │
          ▼                           ▼
┌─────────────────────────────────────────────────┐
│                   apps/api                      │
│     NestJS — business logic, authorization,     │
│     price calculation, payments, exports        │
└───────┬───────────────┬───────────────┬─────────┘
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│   Data layer │ │  Payments   │ │    Media     │
│ DataClient → │ │ mock /      │ │ Cloudinary   │
│  Firestore   │ │ Razorpay    │ │ signed upload│
│  (admin SDK) │ │ adapters    │ │ (no secret   │
│  or in-mem   │ │             │ │  in browser) │
└──────────────┘ └─────────────┘ └──────────────┘
```

## Repository layout

| Path | Role |
|---|---|
| `apps/storefront` | Customer-facing Next.js app (SSR/ISR catalogue + client cart/checkout) |
| `apps/admin` | Protected Next.js business panel (client-side, session-token based) |
| `apps/api` | NestJS REST API under `/api/v1`, OpenAPI docs at `/api/docs` |
| `packages/contracts` | Domain types, Zod DTO schemas, state machines, RBAC permission matrix |
| `packages/utils` | Money (integer paise), ids, slugs, IST time helpers |
| `packages/data-core` | `DataClient` interface, Firestore provider, in-memory provider, seed engine |
| `tools/seed-demo-data` | `validate / dry-run / seed / reset-demo` CLI |
| `tools/import-catalogue` | Workbook validation + import CLI (SheetJS reader, demo prices → DRAFT) |
| `tools/export-validation` | Reconciliation checks between exports and source data |

## Key architectural decisions

### 1. One data-access contract, two providers

All reads and writes go through the `DataClient` interface (`packages/data-core`). Two
implementations exist:

- **`FirestoreDataClient`** — production. Uses the Firebase Admin SDK with a service-account
  credential. Transactions map to Firestore `runTransaction`; queued writes apply at commit.
- **`InMemoryDataClient`** — development and tests. Same semantics (including queued-write
  transactions) with a hard constructor refusal when `NODE_ENV=production`.

**Why:** the platform must be runnable, testable and demo-able without external credentials, while
production code paths stay identical. The selection is explicit (`DATA_PROVIDER` env) — never a
silent fallback, and mock mode is structurally impossible in production.

**Trade-off:** the in-memory provider is single-process only. Concurrency correctness for
oversell protection is verified in unit tests against the same transaction semantics; Firestore
provides the real transactional guarantees at runtime.

### 2. Money is integer paise, everywhere

All monetary values are stored and computed as integer paise (`@annaadhya/utils/money`). Rupee
strings parse to paise at the edges; formatting back to ₹ happens only for display. Floating point
arithmetic on money is forbidden and the shared helpers make it unnecessary.

### 3. The server is authoritative for commerce

- Browsers send **cart intent** (variant id + qty), never prices. `/checkout/quote` prices from the
  database and stores a server-side, single-use, TTL-bound quote.
- Order creation re-validates prices and stock, then reserves inventory inside a transaction.
- Payment success is accepted **only** from verified provider events (webhook signature or checkout
  handshake), processed idempotently via the `webhookEvents` collection.
- Admins cannot push an unpaid order into fulfilment; the API enforces the order state machine and
  refuses `refunded` via status edits (refunds must go through the refund endpoint).

### 4. RBAC as code

The permission matrix lives in `packages/contracts/src/permissions.ts` as a role→permission map.
The API's `PermissionsGuard` is the enforcement point; the admin UI reads the same source to hide
controls (cosmetic only). Initial owner provisioning is a documented bootstrap guarded by
`ADMIN_SETUP_KEY`; there is no public staff registration.

### 5. Demo/live data boundary

Every seeded record carries `isDemo: true` + `seedBatch`. Reporting excludes demo records by
default (`settings.reporting.includeDemoDataByDefault`), exports label demo sheets, and the reset
tool deletes only demo-flagged documents. Live orders referencing demo variants are flagged by
`tools/export-validation`.

### 6. Timestamps as epoch millis

Business timestamps are server-generated epoch-millis integers rather than Firestore
`serverTimestamp()`. This keeps ordering deterministic across providers and simplifies seeding.
The trade-off (clock trust) is acceptable because every write path runs on the trusted backend.

### 7. Payments behind an adapter

`PaymentProvider` isolates gateway specifics. The mock adapter drives the *same* verification
pipeline (HMAC-signed webhook bodies) so order/payment state machinery is tested identically.
The Razorpay adapter implements orders API, webhook verification, checkout handshake and refunds,
but is registered only when credentials exist, and stays **sandboxed** (`settings.payments
.sandboxMode`) until the owner explicitly approves production launch.

### 8. No secrets in the browser

Cloudinary uploads use short-lived signed params issued by the API; the API secret never leaves the
server. Firebase client SDK holds only public config. Payment secrets are server-only. The admin
app stores its session token in `sessionStorage` (see Known limitations).

## Request flows

**Checkout (happy path):**
1. `POST /checkout/quote` — server prices items, checks availability, persists quote (15 min TTL).
2. `POST /checkout/orders` — re-validates, consumes quote once, creates order `pending_payment`,
   reserves stock (transaction), creates payment attempt, calls provider (outside the transaction).
3. Provider webhook / verified callback → `applyVerifiedEvent` — idempotent; on success commits
   reservations to `sold` movements, confirms the order.
4. Expiry sweeper releases stale reservations every 5 minutes and cancels still-pending orders.

**Stock receipt:** purchase `receive` → inventory `received` movement → sellable stock.

## Known limitations (honest list)

- Rate limiting is per-process in-memory; horizontal deployments need a shared store.
- Admin listing endpoints paginate crudely (page cap); large catalogues need cursor pagination.
- Admin session uses `sessionStorage` (XSS-hardening review scheduled pre-launch; httpOnly cookie
  proxy is the documented hardening path).
- Export jobs run synchronously below `EXPORT_SYNC_ROW_LIMIT`; larger exports need the background
  job queue (schema present, execution pending).
- GST presentation is intentionally zero/invisible until the business confirms tax handling with
  its CA; shipping/delivery estimates show only when configured.
