# Testing

## What is automated

36 unit/integration tests across three suites, all runnable without credentials:

```bash
pnpm test          # runs every suite
```

| Suite | Location | Covers |
|---|---|---|
| money | `packages/utils/tests/money.test.ts` | rupee parsing, Indian formatting, percent/bps rounding, schema guards |
| data core & seed | `packages/data-core/tests/provider.test.ts` | in-memory provider semantics, transaction atomicity, dataset validation, idempotent seed, **demo-only reset**, order totals in paise |
| API business rules | `apps/api/tests/checkout.test.ts` | server-authoritative pricing, shipping thresholds, oversell prevention, quote single-use, payment idempotency, amount-mismatch hold, failed-payment release, reservation expiry, dev-token signing/expiry, webhook signature verification, RBAC (support can't refund), refund caps, unpaid-fulfilment guard, state-machine legality, ledger reasons, dashboard demo exclusion |

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR: install → build packages →
lint → typecheck → tests → build all three apps.

## Live smoke test

With the API running (`pnpm dev:api`), the canonical end-to-end flow is:

1. `GET /api/v1/products/bestsellers` → pick a variant
2. `POST /api/v1/checkout/quote` → verify server totals
3. `POST /api/v1/checkout/orders` → pending order + mock payment payload
4. `POST /api/v1/payments/mock/confirm` (dev only) → `applied: true`
5. `GET /api/v1/payments/:attemptId/status` → `succeeded` / `confirmed`
6. Repeat step 4 → `applied: false, note: duplicate` (idempotency)
7. `GET /api/v1/products/slug/:slug` → stock decremented
8. `GET /api/v1/admin/dashboard/metrics` without a token → 401
9. Dev-token as `demo-owner-uid` → dashboard shows live orders, demo excluded
10. `GET /api/v1/admin/reports/exports/orders` with the token → xlsx bytes

## Manual QA checklist (per release)

- Storefront: browse → filter → variant switch updates price/SKU → cart persists on reload →
  checkout as guest and as signed-in user → success/pending/failure screens → order appears in
  account history with correct snapshot.
- Mobile: 360px-wide viewport on home, product, cart, checkout; sticky footer; touch targets.
- Admin: every section loads with the section's role (try inventory and reports roles for 403s).
- Accessibility spot checks: keyboard-only navigation through checkout; visible focus rings;
  form labels; colour contrast of honey-on-cream text.

## What is NOT yet automated

- Playwright browser flows (config placeholder documented; add once staging URL is stable).
- Razorpay sandbox round-trip (needs real keys — see launch checklist).
- Firestore provider integration tests against an emulator (recommended before production).
