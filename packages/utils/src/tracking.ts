/**
 * Shipment tracking helpers for the manual Shiprocket workflow.
 *
 * Tracking model (no API integration): shipments are booked manually in the
 * Shiprocket dashboard and the resulting AWB is recorded by an administrator
 * against the order. Live courier scans stay on Shiprocket's public tracking
 * page — nothing here fabricates tracking events or delivery dates. When daily
 * order volume justifies the Shiprocket API, this module is the single place
 * that grows from "public tracking link" to real event retrieval.
 */

const SHIPROCKET_TRACKING_HOST = "shiprocket.co";

/** Conservative AWB shape actually used by carriers on Shiprocket (alnum + . _ -). */
const AWB_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,38}$/;

/**
 * Shiprocket's public tracking page: https://shiprocket.co/tracking/{AWB}.
 * The pattern was verified against Shiprocket's live endpoint and public
 * tracking page (shiprocket.in/shipment-tracking) in Oct 2026. Returns null
 * when the AWB has an unexpected shape — callers must then show the number
 * without a link instead of constructing a URL that can't be vouched for.
 */
export function shiprocketTrackingUrl(trackingNumber: string): string | null {
  const awb = trackingNumber.trim();
  if (!AWB_PATTERN.test(awb)) return null;
  return `https://${SHIPROCKET_TRACKING_HOST}/tracking/${encodeURIComponent(awb)}`;
}
