# Permissions matrix

Source of truth: `packages/contracts/src/permissions.ts` (`ROLE_PERMISSION_MAP`). The API's
`PermissionsGuard` enforces this on every admin route; the admin UI uses it only to hide controls.
**Roles are resolved server-side from the `adminUsers` collection — never from browser input.**

| Permission | Owner | Manager | Inventory | Orders/Support | Reports |
|---|:--:|:--:|:--:|:--:|:--:|
| dashboard:read | ✔ | ✔ | | | ✔ |
| products:read | ✔ | ✔ | ✔ | ✔ | ✔ |
| products:write | ✔ | ✔ | | | |
| categories:read | ✔ | ✔ | ✔ | ✔ | ✔ |
| categories:write | ✔ | ✔ | | | |
| orders:read | ✔ | ✔ | | ✔ | ✔ |
| orders:write | ✔ | ✔ | | ✔ | |
| orders:refund | ✔ | ✔ | | | |
| inventory:read | ✔ | ✔ | ✔ | ✔ | ✔ |
| inventory:write | ✔ | ✔ | ✔ | | |
| suppliers:read | ✔ | ✔ | ✔ | | ✔ |
| suppliers:write | ✔ | ✔ | ✔ | | |
| purchases:read | ✔ | ✔ | ✔ | | ✔ |
| purchases:write | ✔ | ✔ | ✔ | | |
| customers:read | ✔ | ✔ | | ✔ | ✔ |
| customers:write | ✔ | ✔ | | ✔ | |
| expenses:read | ✔ | ✔ | | | ✔ |
| expenses:write | ✔ | ✔ | | | |
| reports:read | ✔ | ✔ | ✔ | ✔ | ✔ |
| reports:export | ✔ | ✔ | | | ✔ |
| media:write | ✔ | ✔ | | | |
| team:read | ✔ | ✔ | | | ✔ |
| team:write | ✔ | | | | |
| settings:read | ✔ | ✔ | | | ✔ |
| settings:write | ✔ | | | | |
| audit:read | ✔ | | | | |

## Role intents

- **Owner** — full business control: team administration, sensitive settings, audit history.
- **Manager** — day-to-day commerce: catalogue, orders, refunds, customers, expenses, exports.
  Cannot manage the team, change settings or read the audit log.
- **Inventory** — stock, purchasing and supplier operations; read-only catalogue context.
- **Orders/Support** — order handling and customer support; no money movement beyond assigned
  order states, no refunds.
- **Reports** — read-everything relevant + controlled export rights; no writes anywhere.

## Server-enforced sensitive operations

| Action | Guard | Audit action |
|---|---|---|
| Refund (full/partial) | `orders:refund` + paymentStatus==succeeded + amount ≤ refundable | `order.refund` |
| Order status change | `orders:write` + state machine + unpaid guard | `order.status_change` |
| Stock movement | `inventory:write` + mandatory reason | ledger row (immutable) |
| Purchase receipt | `purchases:write` | `purchase.receive` |
| Team invite / role / status | `team:write` + sole-owner protections | `team.*` |
| Settings update | `settings:write` | `settings.update` |
| Export | `reports:export` | `report.export` |
| Owner bootstrap | `ADMIN_SETUP_KEY` + no existing owner | `team.bootstrap_owner` |

## Structural protections

- Public admin registration does not exist.
- Suspended staff are rejected at token verification (`auth.loadStaff`).
- The last active owner cannot be demoted or suspended; owners cannot demote themselves.
- Customers (non-staff principals) receive 403 on every `/admin/*` route.
- Demo reset refuses production-like environments and requires `--i-understand-demo-reset`.
