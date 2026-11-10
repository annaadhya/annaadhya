# Firestore schema

Collections, document shapes and the query patterns they support. All monetary values are integer
paise. Timestamps are epoch-millis integers set by the trusted backend.

## Demo data boundary

Documents created by the seed tool or catalogue importer carry:

- `isDemo: true`
- `seedBatch: "demo-2026-10-19"` (or the importing batch id)

Rules enforced across the platform:

- reporting excludes `isDemo` records unless `settings.reporting.includeDemoDataByDefault` is true
- Excel exports label demo sheets and exclude demo data by default
- `reset-demo` deletes **only** documents where `isDemo == true`
- live documents never get `isDemo` set; tools treat `isDemo != true` as live and refuse to overwrite

## Collections

### products
| Field | Type | Notes |
|---|---|---|
| id | string | deterministic for seeds/imports (`prod_<sku-derived>`) |
| sku | string | unique business key (AN-HNY-001) |
| slug | string | unique, URL-safe |
| name, subtitle, description | string | draft copy pending supplier verification |
| categoryId | string | → categories |
| typeLabel | string | variety/type |
| status | draft \| published \| archived | only `published` is public |
| images | ProductImage[] | ordered; url/cloudinaryPublicId/alt |
| ingredients, netQuantityLabel, storageInstructions, allergenInfo, manufacturerDetails, fssaiLicense | string? | shown only when the business supplies them |
| bestsellerRank, featuredRank | number? | drive home-page placement |
| giftItem | boolean | |
| seo | { title?, description? } | |
| createdAt, updatedAt, isDemo, seedBatch | | |

### productVariants
| Field | Type | Notes |
|---|---|---|
| productId | string | → products |
| sku | string | unique (AN-HNY-001-250G) |
| packLabel | string | "250 g" |
| grams | number | 0.5 for kesar half-gram |
| pricePaise | number | server-authoritative selling price |
| mrpPaise | number? | only when business supplies it |
| status | draft \| published \| archived | |
| stockOnHand | number | transactionally maintained |
| reservedQty | number | held for in-flight checkouts |
| lowStockThreshold | number | drives alerts |

### categories
slug (unique), name, tagline, description, sortOrder, `isReady` (categories without stock are
hidden), heroImage?, status.

### orders
orderNumber (`AN-2026-000123`), customerUid?, customerContact, shippingAddress,
`items[]` (full snapshot: sku, name, variantLabel, unitPricePaise, mrpPaise, qty, lineTotalPaise),
subtotalPaise, discountTotalPaise, shippingPaise, taxPaise (+taxLabel when configured), totalPaise,
status, paymentStatus, paymentProvider, refundStatus, refundPaise, tracking?, cancelledReason?.

**Snapshots are immutable** — historical orders keep the exact names/prices purchased even if the
catalogue changes later.

### orderNotes
orderId, orderNumber, note, authorUid, authorName, authorRole. Internal staff notes written
through `POST /admin/orders/:id/notes` (orders:write) and read through `GET :id/notes`
(orders:read). Admin-only by construction: customer order endpoints return OrderDoc, which
carries no notes field, and the default-deny Firestore rules block direct client access.
Every create is audited (`order.note_add`).

### paymentAttempts
orderId, provider, providerOrderId?, status (state machine: created→pending→succeeded/failed/
cancelled; succeeded→refunded), amountPaise, attempts, lastError?, refundPaise.

### checkoutQuotes
quoteId, items (server-priced lines), totals, unavailable[], pincode?, expiresAt, `consumed`.
Single-use; checked-and-consumed inside a transaction.

### stockReservations
orderId, variantId, qty, status (active|committed|released), expiresAt.

### inventoryMovements
variantId, variantSku, type (received|sold|damaged|manual_adjustment|returned|reserved|released|
other), qtyDelta, reservedDelta, resultingStockOnHand, resultingReservedQty, **reason** (mandatory),
referenceType/referenceId, performedByUid/Name.

### customers
uid (Firebase UID, stable key), displayName, email?, phone?, providers[], accountStatus,
addresses[] (labelled Indian addresses with 6-digit pincode), defaultAddressId?, notes? (internal),
marketingOptIn.

### newsletterSubscribers
email (normalized lowercase; deterministic doc id `nls_<sha256(email)[:24]>` so one address can
never occupy two rows), status (`active` | `unsubscribed`), source (capture surface:
`footer`, `homepage-hero`, `api`), customerUid? (when signed in at capture time), unsubscribedAt?.
Public capture via `POST /newsletter/subscribe`; consumed for marketing via Admin → Reports →
Newsletter subscribers (.xlsx). No unsubscribe workflow yet — flip the tool's own list hygiene
until the in-platform flow ships.

### contactMessages
Storefront /contact form submissions. fullName, email (normalized lowercase), enquiryType
(one of CONTACT_ENQUIRY_TYPES), orderNumber?, subject?, message, customerUid? (when signed in at
submission time). Deterministic doc id `cmsg_<sha256(email + "\n" + clientRef)[:24]>` where
clientRef is generated once per composed message in the browser — retries after a network
timeout converge on the same document, so duplicate submissions are structurally impossible.
Public capture via `POST /contact/messages` (@Public, per-IP rate limit 8/window, server-side
zod validation). No email provider is configured: persistence IS the delivery workflow, and each
submission writes a `contact.message_received` audit entry (reference + enquiry type only) that
the owner reads in the existing Admin → Audit log. Message bodies are retrieved by querying this
collection by document id.

### suppliers / purchases
Suppliers: name, type? (farmer_apiarist|estate_producer|wholesaler_coop|packaging_artisan|other),
contactPerson?, phone?, email?, location? (legacy free text), village?, city?, state?, pincode?,
addressLines?, status? (active|inactive — default active), paymentTerms?, licenseNumber?, notes?,
productSkus[], rates?[] (label, productSku?, variantSku?, unitCostPaise — procurement cost,
unit, moqQty?, notes?). All extended fields are additive; legacy docs without them render with
the documented fallbacks (type "other", status "active", no rates). Status changes never touch
purchase history.
Purchases: supplierId, reference, status (draft|ordered|partially_received|received|cancelled),
items[] (variantSku, description, qtyOrdered, qtyReceived, unitCostPaise — actual landed costs),
createdByUid.

### expenses
date, category, amountPaise, description, payee?, reference?, attachmentUrl?, notes?,
status (`paid`|`pending`|`partially_paid` — rows recorded before settlement tracking may
omit it and read as `paid`), amountPaidPaise? (normalized: paid → amountPaise, pending → 0),
paymentMethod? (`cash`|`upi`|`bank_transfer`|`card`|`other`), createdByUid/Name,
updatedByUid/Name?. Operating overheads only — stock procurement stays under purchases;
expense writes never touch inventory.

### adminUsers
uid (Firebase UID), displayName, email, role (owner|manager|inventory|orders_support|reports),
status (active|suspended), invitedByUid?, lastLoginAt?.

### auditLogs
actorUid, actorName, actorRole, action (`product.update`, `order.status_change`,
`payment.webhook.razorpay`, …), targetType/targetId, summary, metadata?. Append-only.

### settings (singleton: `global`)
store (name, legalName, supportEmail/Phone, addressLines, gstin?, fssaiLicense?, socialLinks,
announcement), shipping (mode, flatRatePaise, freeAbovePaise, deliveryEstimateDays?,
serviceablePincodesNote), payments (provider, `sandboxMode` — stays true until explicit owner
approval, codEnabled), reporting (includeDemoDataByDefault), storefront (hero copy, newsletter and
gift flags — both default off until compliant workflows exist).

### webhookEvents / counters / exportJobs
Provider event idempotency; per-year order-number counters; async export tracking.

## Security rules

See `firestore.rules` at the repo root. Principle: **default deny**. The trusted backend (Admin
SDK) bypasses rules by design, so rules exist to block *direct client access* to business
collections. Only `customers/{uid}` self-doc access is allowed for profile convenience, and even
that is mirrored server-side.

Deploy with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Indexes

Query patterns used by the API are declared in `firestore.indexes.json` (31 composite indexes).
Every composite must declare **≥ 2 fields** — single-field queries (e.g. expenses by `date DESC`,
variants by `productId`) are served by Firestore's automatic single-field indexes, and the deploy
API rejects one-field declarations with `400 … not necessary, configure using single field index
controls`:

- categories: `status ASC, sortOrder ASC`; `slug ASC, createdAt DESC`
- products: `status ASC, createdAt DESC`; `slug ASC, createdAt DESC`; `status ASC, categoryId ASC, createdAt DESC`
- productVariants: `productId ASC, grams ASC`; `status ASC, createdAt DESC`; `sku ASC, createdAt DESC`
- orders: `orderNumber ASC, createdAt DESC`; `customerUid ASC, createdAt DESC`; `status ASC, createdAt DESC`; `paymentStatus ASC, createdAt DESC`; `status ASC, paymentStatus ASC, createdAt DESC`
- customers: `uid ASC, createdAt DESC`
- paymentAttempts: `providerOrderId ASC, createdAt DESC`; `orderId ASC, createdAt DESC`
- inventoryMovements: `variantId ASC, createdAt DESC`; `type ASC, createdAt DESC`; `variantId ASC, type ASC, createdAt DESC`
- stockReservations: `orderId ASC, createdAt DESC`; `status ASC, createdAt DESC`
- webhookEvents: `eventId ASC, createdAt DESC`
- adminUsers: `role ASC, createdAt DESC`; `uid ASC, createdAt DESC`
- auditLogs: `action ASC, createdAt DESC`; `actorUid ASC, createdAt DESC`; `action ASC, actorUid ASC, createdAt DESC`
- purchases: `supplierId ASC, createdAt DESC`; `status ASC, createdAt DESC`; `supplierId ASC, status ASC, createdAt DESC`
- expenses: `category ASC, date DESC`

### Query-shape policy (no hidden index dependencies)

The data layer applies **no implicit ordering** — `orderBy` exists only where a caller
states it (a former hidden `createdAt desc` default silently turned equality queries into
"equality + orderBy" queries, which Firestore refuses without a matching composite index;
that was the production-500 class behind the admin order filters and the order
timeline/notes endpoints). Callers must keep every query shape servable by automatic
single-field indexes:

- **equality-only** where clauses (no orderBy) — always servable; sort the results in
  memory (order timeline, order notes, customer order list, order-number lookup);
- **range + orderBy on the same field** — servable by that field's automatic index
  (dashboard range scans, report pulls);
- **newest-first scans with no where clauses** — servable, used where arbitrary filter
  combinations must never depend on composite indexes: admin order list views filter in
  memory after a bounded 1000-order scan (same for the admin order search), so no filter
  combination can ever hit a missing composite again. Totals stay honest within the
  scan bound, documented at `ORDER_LIST_SCAN_LIMIT` in `orders.service.ts`.

