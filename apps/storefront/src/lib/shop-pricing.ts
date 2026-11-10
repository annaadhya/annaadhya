/** Price-tier presets shared by the shop page (server) and toolbar (client).
 *  Lives outside the "use client" toolbar module — importing runtime values from a
 *  client module into a server component yields client-reference proxies, not data. */
export const PRICE_TIERS: Record<
  string,
  { label: string; chip: string; minPaise?: number; maxPaise?: number }
> = {
  under800: { label: "Price: Under ₹800", chip: "Under ₹800", maxPaise: 79999 },
  "800to1500": { label: "₹800 — ₹1,500", chip: "₹800 — ₹1,500", minPaise: 80000, maxPaise: 150000 },
  above1500: { label: "Above ₹1,500", chip: "Above ₹1,500", minPaise: 150001 },
};
