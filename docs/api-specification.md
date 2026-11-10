# API specification

Base URL: `${API_HOST}/api/v1` — interactive OpenAPI docs at `${API_HOST}/api/docs`.

All responses are enveloped:

```json
{ "ok": true,  "data": { … } }
{ "ok": false, "error": { "code": "validation_failed", "message": "…", "details": { … } } }
```

Error codes: `bad_request`, `validation_failed`, `unauthenticated`, `forbidden`, `not_found`,
`conflict`, `gone`, `unprocessable`, `rate_limited`, `internal`, `service_unconfigured`.

Authentication: `Authorization: Bearer <Firebase ID token>` (mock-mode dev tokens in development
only). Staff roles are resolved server-side from `adminUsers` — never from client claims.
**All amounts are integer paise.**

## Public catalogue

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | provider, mode, collection counts |
| GET | `/categories` | published + ready only |
| GET | `/categories/:slug` | |
| GET | `/products` | `search, category, minPricePaise, maxPricePaise, sort(relevance\|price_asc\|price_desc\|newest), page, pageSize(≤48)` |
| GET | `/products/bestsellers` | rank-ordered |
| GET | `/products/featured` | rank-ordered |
| GET | `/products/slug/:slug` | published only |
| GET | `/products/slug/:slug/related` | same-category |

## Auth & identity

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/verify` | public | body `{ idToken }` → principal + lazily-provisioned customer profile |
| GET | `/auth/me` | bearer | principal + customer |
| POST | `/auth/profile` | bearer | displayName / phone / marketingOptIn |
| POST | `/auth/dev/token` | public | **mock mode only** — issues dev token; 403 when Firebase configured |
| POST | `/auth/bootstrap-owner` | public | one-time owner provisioning; requires `ADMIN_SETUP_KEY` |
| GET | `/auth/platform-status` | public | data/auth/payments mode descriptor |

## Newsletter & public settings

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/newsletter/subscribe` | public (rate-limited) | `{ email, source? }` → `{ subscribed: true, alreadySubscribed }` — idempotent per address (deterministic doc id); re-subscribing a previously unsubscribed address reactivates it |
| GET | `/settings/public` | public | whitelisted store projection: support email/phone, address lines, social links, announcement, newsletter/gift flags — never GSTIN, licences or payment internals |

## Checkout & payments

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/checkout/quote` | public (rate-limited) | `{ items:[{variantId, qty}], pincode? }` → server-priced quote |
| POST | `/checkout/orders` | **required bearer** (no guest checkout — order links to the signed-in account) | `{ quoteId, paymentMethod, customer, address, acceptTerms:true }` → order + client payment payload |
| GET | `/payments/:attemptId/status` | public | poll payment + order state |
| POST | `/payments/razorpay/verify` | public | Razorpay checkout handshake (signature verified) |
| POST | `/payments/webhook/:provider` | public | raw-body signature verification; idempotent |
| POST | `/payments/mock/confirm` | public | **mock mode only** — simulate success/failure through the verification pipeline |

Quote → order invariants: quotes are single-use (transaction-guarded), prices re-checked at order
time, stock reserved transactionally, oversell refused, reservations expire after
`STOCK_RESERVATION_TTL_MINUTES`.

Order states: `pending_payment → confirmed → processing → shipped → delivered`, with
`cancelled` / `refunded` branches — transitions enforced server-side; unpaid orders can never enter
fulfilment states.

## Customer orders

| Method | Path | Notes |
|---|---|---|
| GET | `/orders/mine` | own orders, paginated |
| GET | `/orders/mine/:id` | own order detail (ownership checked server-side) |

## Admin (permission-protected)

Each route requires the listed permission(s) via `RequirePermissions(...)`.

### Catalogue management
- `GET /admin/catalogue/products` — products:read
- `GET /admin/catalogue/products/:id` — products:read
- `POST /admin/catalogue/products` & `POST /admin/catalogue/products/:id` — products:write
  (SKU uniqueness, MRP ≥ price validation, variant upsert by SKU, removals archived)
- `DELETE /admin/catalogue/products/:id` — products:write (archives product + variants)
- `GET/POST /admin/catalogue/categories(/:id)` — categories:read/write

### Orders
- `GET /admin/orders` — orders:read (search, status, paymentStatus, date range)
- `GET /admin/orders/state-machine` — orders:read
- `POST /admin/orders/:id/status` — orders:write (legal transitions only; unpaid guard)
- `POST /admin/orders/:id/refund` — orders:refund (provider refund recorded; capped at balance)
- `POST /admin/orders/reservations/release-expired` — orders:write

### Inventory
- `GET /admin/inventory/balances` — inventory:read
- `GET /admin/inventory/low-stock?threshold=` — inventory:read
- `GET /admin/inventory/movements?variantId=&type=` — inventory:read
- `POST /admin/inventory/movements` — inventory:write (mandatory reason; ledgered transactionally)

### Suppliers & purchases
- `GET/POST /admin/suppliers(/:id)` — suppliers:read/write
- `GET/POST /admin/purchases(/:id)` — purchases:read/write
- `POST /admin/purchases/:id/receive` — purchases:write → creates `received` movements

### Customers
- `GET /admin/customers?search=` / `GET /admin/customers/:id` — customers:read (PII masked without customers:write)
- `POST /admin/customers/:id/status` — customers:write

### Expenses / Dashboard / Reports
- `GET/POST/DELETE /admin/expenses(/:id)`, `GET /admin/expenses/total` — expenses:read/write
- `GET /admin/dashboard/metrics?days=30` — dashboard:read
  Definitions: gross sales (paid orders, range), discounts, refunds, net sales = gross − discounts
  − refunds, payments collected (succeeded attempts, cash basis), AOV = net/paid orders,
  units sold (sum of item quantities across paid orders), status counts (in-range orders grouped by
  the real lifecycle enum), category sales (paid-order line revenue grouped via product → category,
  unmapped lines → "Uncategorised"), low stock (published variants at or below their **own**
  `lowStockThreshold`, enriched with product name/pack label), recent orders (id, order number,
  customer display name, totals, status, payment status/provider).
  `comparison` repeats the identical definitions over the immediately preceding equivalent window
  (`[from − days, from)`) — show period-over-period deltas only against these values.
  Sales-trend buckets are keyed by the **IST calendar date** of each order, so chart totals
  reconcile with the headline figures.
  **Profit: `null` + explanatory note until landed costs + expense coverage are supplied.**
- `GET /admin/reports/types` — reports:read
- `GET /admin/reports/exports/:type` — reports:export (xlsx; types: products, variants, orders,
  customers, inventory_balances, inventory_movements, suppliers, purchases, expenses, sales_summary,
  newsletter_subscribers; `?includeDemo=true` shows demo records, labelled)

### Media / Team / Settings / Audit
- `POST /admin/media/upload-signature` — media:write (short-lived Cloudinary params; 503 if unconfigured)
- `POST /admin/media/register` — media:write (validates folder + delivery URL)
- `GET/POST /admin/team`, `POST /admin/team/:id/role`, `POST /admin/team/:id/status` — team:read/write
- `GET/POST /admin/settings` — settings:read/write
- `GET /admin/audit` — audit:read

## Rate limits

Default 240 requests / 60 s per IP+route (env-tunable); checkout quote 60/min; order creation and
webhooks 30/min. Horizontal deployments should replace the in-memory limiter (see architecture.md).

## Import workbook contract

`tools/import-catalogue` expects sheets `Product Catalogue` and `Pack & Retail Rates` with the
column layout of `Annaadhya_Products_Demo_Catalogue_and_Pricing.xlsx`. Rows with an approved price
(column I) import as published; demo-only prices import as **draft** with `isDemo: true`.
