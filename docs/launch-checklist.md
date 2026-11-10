# Launch checklist

Status vocabulary used here: **Implemented** (code exists) · **Configured** (credentials set) ·
**Verified** (a real test passed) · **Live** (approved for production).
Nothing should be marked Verified/Live without evidence. Items marked ⚠️ need business decisions.

## 1. Business data — replace all demo content ⚠️
- [ ] Confirm final product names, subtitles and descriptions against actual supplied goods
- [ ] Obtain supplier cost/quote documentation for every SKU (Supplier Tracker sheet)
- [ ] Approve retail prices per pack (accounting for cost, freight, packaging, fulfilment, taxes,
      payment fees, returns, advertising) → fill "Approved Customer Price" column and re-import
- [ ] Upload real product photography (Cloudinary) and remove SVG placeholders
- [ ] Provide legal entity name, registered address policy, GSTIN (if registered) ⚠️
- [ ] Provide FSSAI licence number (mandatory for food e-commerce) ⚠️
- [ ] Decide COD operations (enable only if operationally ready) ⚠️
- [ ] Confirm shipping partner, rates and serviceable pincodes; set admin settings accordingly ⚠️
- [ ] Confirm support email/phone and social links

## 2. Legal & policy review ⚠️
- [ ] Privacy policy reviewed (DPDP Act 2023 alignment) — current text is DRAFT
- [ ] Terms & conditions reviewed (jurisdiction, entity details)
- [ ] Returns/refunds policy reviewed (window, SLA)
- [ ] Shipping policy reviewed (estimates → confirmed SLAs or remove estimates)
- [ ] Food-labelling compliance: net quantity, ingredients, allergens, storage, MRP per Legal
      Metrology on every pack/page
- [ ] Remove "demo catalogue" announcement once real prices are live

## 3. Platform configuration
- [ ] Firebase production project: Auth providers on (Google, Email, Phone; SMS cost reviewed)
- [ ] Firestore production DB + `firestore.rules` + `firestore.indexes.json` deployed
- [ ] `DATA_PROVIDER=firestore` verified via `/api/v1/health`
- [ ] Cloudinary configured; upload signature flow tested end-to-end
- [ ] Razorpay live keys created after KYC; webhook registered on the production API URL
- [ ] One live ₹1 transaction + refund completed and reconciled
- [ ] `settings.payments.sandboxMode` flipped to false by the owner
- [ ] Admin: owner bootstrapped; team roles assigned per permissions matrix
- [ ] Settings: store details, shipping, storefront hero copy finalised

## 4. Quality gates
- [ ] `pnpm -r build` green
- [ ] `pnpm test` green (36 automated tests)
- [ ] `pnpm --filter @annaadhya/export-validation start` PASS on production data
- [ ] Storefront Lighthouse mobile ≥ 85 performance / ≥ 95 accessibility on key pages (measure, don't assume)
- [ ] Keyboard-only checkout pass
- [ ] Mobile device checkout pass (real device, not just emulator)
- [ ] Order→refund round-trip exercised in admin
- [ ] Demo reset executed on production? **Never.** (reset is dev/staging only)

## 5. Operations
- [ ] Domain + TLS live; `NEXT_PUBLIC_SITE_URL` set to https domain
- [ ] `/api/v1/health` wired to uptime monitoring
- [ ] Firestore PITR/backups scheduled
- [ ] Log retention + access reviewed (no secrets in logs)
- [ ] Rollback procedure rehearsed once on staging
- [ ] Branch protection on `main` enabled; PRs required
- [ ] GitHub token used during development **rotated/revoked** (it was shared in chat)

## 6. Honest status of integrations (as of this build)

| Integration | State |
|---|---|
| Storefront + admin + API | Implemented; production builds pass; live smoke test green |
| Firebase Auth (all 3 methods) | Implemented; **not verified** — needs configured project |
| Firestore | Implemented; **not verified** — needs configured project |
| Cloudinary | Implemented; **not verified** — needs credentials |
| Razorpay | Implemented; **not verified** — needs test-mode keys + webhook round-trip |
| Mock payments / dev auth | Implemented and **tested** (unit + smoke) |
| Playwright browser suite | Not yet written (documented follow-up) |
