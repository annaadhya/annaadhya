# Deployment

## Targets

| App | Staging/preview | Production |
|---|---|---|
| `apps/storefront` | Vercel preview (per-PR) | Vercel (Next.js runtime) |
| `apps/admin` | Vercel preview | Vercel |
| `apps/api` | Hostinger Node.js VPS (or any Node 20+ host) | same host behind HTTPS |

The API is a standard NestJS/Express server — it is **not** designed for serverless deployment.
Hostinger's Node.js hosting works when the plan provides persistent Node 20+, port binding and
process restarts; otherwise deploy to any VPS/container host. Do not force it onto Vercel functions.

## One-time setup

### Staging
1. Create staging Firebase project + Razorpay test account + Cloudinary (see environment-setup.md).
2. Vercel: import the repo, add `apps/storefront` and `apps/admin` as two projects with **Root
   Directory** set accordingly; install command `pnpm install`, build `pnpm build` (Vercel runs
   workspace builds in dependency order).
3. API host: clone the repo, `pnpm install && pnpm -r build`, run
   `node apps/api/dist/src/main.js` behind a process manager:

```bash
# systemd unit (sketch)
[Service]
WorkingDirectory=/srv/annaadhya/apps/api
ExecStart=/usr/bin/node dist/src/main.js
Environment=NODE_ENV=staging
EnvironmentFile=/srv/annaadhya/apps/api/.env
Restart=always
User=annaadhya
```

4. Reverse proxy TLS (Caddy example):
```
api.staging.example.com {
    reverse_proxy localhost:4000
}
```

### Environments must stay separate
- staging Firebase project ≠ production project
- staging Razorpay keys are `rzp_test_*`; production keys are created only at go-live
- `DATA_PROVIDER=firestore` in staging/production; `memory` is structurally refused in production
- `.env` files live only on the host / Vercel project settings — never in Git

## Build & release flow

```bash
pnpm install --frozen-lockfile
pnpm -r build          # packages → api → storefront/admin (pnpm topological order)
pnpm test
node apps/api/dist/src/main.js   # or pm2/systemd restart
```

Storefront/admin deploy automatically from the connected Git branch (preview per PR; production
branch promote via Vercel). Set `NEXT_PUBLIC_SITE_URL` to the final domain so canonical URLs,
OG metadata, sitemap and robots work correctly.

## Health checks & monitoring

- `GET /api/v1/health` — provider, mode, collection counts; wire to the host's uptime monitor.
- `GET /api/v1/health/live` — liveness probe.
- Reservation sweeper logs failures; alert on repeated `[reservations] expiry sweep failed`.
- Provider webhooks: check Razorpay dashboard delivery logs on payment anomalies.

## Backups & rollback

- Firestore: enable PITR (point-in-time recovery) + scheduled exports
  (`gcloud firestore export`) to a separate project bucket.
- Rollback app: redeploy previous Git tag/commit; Vercel keeps instant rollbacks.
- Rollback API: previous build directory + systemd restart. Schema changes are additive; run the
  previous image against the same data safely.

## Custom domain & go-live sequence (payments)

1. Point domains, issue TLS, verify canonical URLs + sitemap on the production domain.
2. Swap `NEXT_PUBLIC_*` Firebase config to the production project.
3. Razorpay: complete KYC, create live keys, register the production webhook URL, run one live
   ₹1 transaction end-to-end and refund it.
4. Owner flips `settings.payments.sandboxMode` to false **only after** the test transaction passes.
5. Verify `firestore.rules` deployed and staging URLs are noindexed (robots.ts handles it when
   `NEXT_PUBLIC_SITE_URL` is not https).

## Pre-launch gate

Do not announce the store before every item in `docs/launch-checklist.md` is checked. The demo
prices must be replaced with approved prices (catalogue importer marks unapproved rows DRAFT).
