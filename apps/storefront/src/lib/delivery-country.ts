/** India-only delivery constants for the storefront client.
 *
 *  Mirrors `DELIVERY_COUNTRY` / `DELIVERY_COUNTRY_ERROR` / the alias list of
 *  `deliveryCountrySchema` in @annaadhya/contracts. Deliberately duplicated here:
 *  a client bundle must not import the contracts RUNTIME (its utils barrel drags
 *  node:fs/node:path into webpack), so storefront code may only use type imports
 *  from contracts. The API remains the enforcement point — the server re-validates
 *  every order — and the exact API message is pinned by
 *  apps/api/tests/india-only-delivery.test.ts, so the two sides cannot drift
 *  silently (a change there breaks that test and must be mirrored here).
 */
export const DELIVERY_COUNTRY = "India";

export const DELIVERY_COUNTRY_ERROR =
  "We currently deliver only within India — international delivery isn't available yet.";

/** Common representations of India accepted by the API's deliveryCountrySchema. */
const INDIA_ALIASES = ["india", "in", "ind", "bharat", "भारत", "hindustan", "republic of india"];

/** True when the given country value resolves to India (absent → India: the
 *  storefront never offered international addresses, so legacy entries are
 *  Indian by construction). */
export function isIndianCountry(country: string | undefined): boolean {
  const raw = (country ?? DELIVERY_COUNTRY).trim().toLowerCase();
  return INDIA_ALIASES.includes(raw);
}
