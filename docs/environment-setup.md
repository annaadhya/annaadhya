# Environment setup

Every integration works in an explicit mock mode without credentials and upgrades to the real
service purely by adding environment variables. Nothing falls back silently.

## 1. Prerequisites

- Node.js ≥ 20.9 (tested on Node 24)
- pnpm 9 (`npm i -g pnpm@9` or `corepack enable`)

```bash
pnpm install
pnpm -r build        # compiles shared packages (required before running node dist)
```

## 2. Zero-credential development (mock mode)

Copy the example files and start:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/storefront/.env.example apps/storefront/.env.local
cp apps/admin/.env.example apps/admin/.env.local

pnpm dev:api          # :4000 — in-memory data, mock auth, mock payments; auto-seeds demo data
pnpm dev:storefront   # :3000
pnpm dev:admin        # :3001
```

These files are auto-loaded — no `export`/`set` commands needed: the storefront and admin
read their `.env.local` through Next.js' built-in support, while the API dev server and the
seed CLI load `apps/api/.env` themselves (requires Node ≥ 20.12; older runtimes print a
warning and fall back to shell-set variables only). Variables already set in the shell
(`export`, CMD `set`, PowerShell `$env:`) always take precedence over file values, so
one-off overrides keep working.

In mock mode: data lives in memory (auto-seeded with the 20-product demo catalogue), sign-in uses
dev tokens (`POST /api/v1/auth/dev/token`), and payments complete through the signed mock adapter.
The storefront and admin show honest mode notices instead of pretending integrations work.

## 3. Firebase Authentication + Firestore

Create a Firebase project (start with a **test** project), then:

1. **Authentication** → enable Google, Email/Password and Phone providers.
   Phone SMS has per-verification cost — review Firebase pricing before enabling in production.
2. **Firestore** → create a Native-mode database. Start in production mode (locked) — the API
   writes with the Admin SDK; client access stays denied by `firestore.rules`.
3. **Service account** → Project settings → Service accounts → Generate new private key.
   Store the JSON outside Git.

API env (`apps/api/.env`):

```
DATA_PROVIDER=firestore
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
# FIRESTORE_DATABASE_ID=   # optional named database
```

`apps/api/.env` is auto-loaded by BOTH the API dev server and the seed CLI (`seed --firestore`)
— one credentials file serves every local command, no `export`/`set` needed. It is gitignored
and never exists on Vercel, where the dashboard injects the same variables instead. Keep the
private key on ONE line with literal `\n` escapes inside double quotes — the code converts them
to real newlines (packages/data-core/src/firestore.provider.ts). To seed against a different
Firebase project than the API's, either edit the file or set the three variables in the shell
(shell values win).

Storefront env (`apps/storefront/.env.local`) — the *public* client config:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=1:…:web:…
```

Load rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Seed real data (writes go to Firestore):

> **Build first (fresh clones):** the workspace libraries (`@annaadhya/contracts`, `@annaadhya/utils`,
> `@annaadhya/data-core`) resolve runtime imports to `./dist/index.js`, which only exists after a
> build. Without it the CLI fails with `ERR_MODULE_NOT_FOUND … @annaadhya/data-core/dist/index.js`:
>
> ```bash
> pnpm --filter "@annaadhya/data-core..." build
> ```
>
> The `...` suffix builds the package **and** its workspace dependencies in topological order.

> **Flag form matters:** pnpm forwards arguments to the script directly — do **not** put `--`
> before the flag. Everything after `--` becomes positional to `parseArgs`, the `--firestore`
> option is silently dropped, and the seed would run against in-memory storage instead of
> Firestore (no error raised, nothing persisted).

```bash
pnpm --filter @annaadhya/seed-demo-data seed --firestore
pnpm --filter @annaadhya/seed-demo-data reset-demo --firestore --i-understand-demo-reset
```

**Verify before claiming it works:** sign in with Google, email and phone on the storefront; check
`GET /api/v1/health` shows `provider: "firestore"` and `auth: "firebase"`.

## 4. Cloudinary (product media)

Create a Cloudinary project and note Cloud name + API key + API secret.

```
CLOUDINARY_CLOUD_NAME=…
CLOUDINARY_API_KEY=…
CLOUDINARY_API_SECRET=…   # server-side only, never exposed to browsers
```

Flow implemented: admin requests `POST /admin/media/upload-signature` → browser uploads directly
to Cloudinary with the signed params → `POST /admin/media/register` validates the asset → attach
the URL to a product via the product editor. Restricted to `annaadhya/*` folders, images ≤ 10 MB,
jpg/png/webp/avif.

## 5. Razorpay (payments)

1. Create a Razorpay account → Dashboard → Settings → API keys → generate **Test mode** keys.
2. Configure a webhook to `https://<api-host>/api/v1/payments/webhook/razorpay` with events
   `payment.captured`, `payment.failed`, `refund.processed`, and set a webhook secret.

```
RAZORPAY_KEY_ID=rzp_test_…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…   # optional — only for the push webhook endpoint
```

The gateway activates on the credential pair alone (`RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`)
— no other flag is required. `RAZORPAY_WEBHOOK_SECRET` only enables the push webhook endpoint;
the standard checkout handshake verifies every payment server-side without it. The API also
refuses mock payment simulation whenever Razorpay/Firebase is configured. Test with Razorpay's
standard test cards, then swap in live keys when the owner approves launch.

## 6. Admin bootstrap (first owner)

One-time setup to open the admin console (`https://<your-domain>/admin`). Order matters — the
panel reads the Firebase client config at build time:

1. **Firebase Console → Authentication → Sign-in method** — enable Email/Password (and Google if
   desired). Then **Authentication → Settings → Authorized domains** — add your Vercel domain
   (e.g. `annaadhya-products-v1.vercel.app`), or the sign-in popup fails with
   `auth/unauthorized-domain`.
2. **Vercel — admin + storefront services**: set `NEXT_PUBLIC_FIREBASE_API_KEY`,
   `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
   (values from Firebase Console → Project settings → General → Your apps → Web app). They are
   inlined at build time → **redeploy both services after setting them**.
3. **Vercel — api service**: set `ADMIN_SETUP_KEY` to a long random value → redeploy the API.
4. **Create your login**: Firebase Console → Authentication → Users → Add user (or register
   through the storefront).
5. **Sign in on `/admin`** with that account. A fresh account has no staff record, so the screen
   shows your **account UID** — copy it.
6. **Bootstrap** (Swagger: `/api/docs` → `POST /auth/bootstrap-owner`, or curl):

   ```
   ADMIN_SETUP_KEY=choose-a-long-random-value
   ```

   ```bash
   curl -X POST $API/api/v1/auth/bootstrap-owner \
     -H 'content-type: application/json' \
     -d '{"uid":"<your-uid-from-step-5>","displayName":"Owner","email":"owner@…","setupKey":"…"}'
   ```

   The seed's demo owner (`isDemo: true`) never blocks this. Once a real owner exists the
   endpoint refuses additional bootstraps — further staff are invited from the admin Team page.
7. **Sign in again on `/admin`** — you land on the dashboard as owner.

## 7. Full variable reference

| Variable | Apps | Purpose |
|---|---|---|
| `PORT` | api | listen port (default 4000) |
| `CORS_ORIGINS` | api | allowed browser origins, comma-separated |
| `DATA_PROVIDER` | api | `memory` (dev) or `firestore` (production requires it) |
| `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` | api | Admin SDK credentials |
| `FIRESTORE_DATABASE_ID` | api | optional named database |
| `DEV_TOKEN_SECRET` | api | mock-mode token signing (default dev value; never production) |
| `ADMIN_SETUP_KEY` | api | one-time owner bootstrap guard |
| `PAYMENT_PROVIDER` | api | `mock` or `razorpay` |
| `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` | api | gateway credentials |
| `CLOUDINARY_*` | api | media credentials |
| `CHECKOUT_QUOTE_TTL_MINUTES` | api | quote lifetime (default 15) |
| `STOCK_RESERVATION_TTL_MINUTES` | api | reservation lifetime (default 30) |
| `EXPORT_SYNC_ROW_LIMIT` | api | sync export cap (default 20000) |
| `RATE_LIMIT_WINDOW_SECONDS` / `RATE_LIMIT_MAX_REQUESTS` | api | limiter tuning |
| `API_URL` | storefront | server-side fetch base for the API |
| `NEXT_PUBLIC_API_URL` | storefront/admin | browser fetch base |
| `NEXT_PUBLIC_SITE_URL` | storefront | canonical/OG/sitemap base |
| `NEXT_PUBLIC_FIREBASE_*` | storefront | public Firebase client config |

## 8. Verification checklist

- [ ] `curl $API/api/v1/health` → expected `provider` and `auth`
- [ ] `pnpm --filter @annaadhya/seed-demo-data dry-run` prints the planned dataset
- [ ] Storefront home lists products; product page shows correct pack prices
- [ ] Checkout completes in the configured payment mode
- [ ] `pnpm --filter @annaadhya/export-validation start` reports all checks PASS
