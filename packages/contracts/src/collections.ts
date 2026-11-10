/**
 * Firestore collection names — single source of truth.
 * See docs/firestore-schema.md for field-level documentation and indexes.
 */
export const COLLECTIONS = {
  products: "products",
  productVariants: "productVariants",
  categories: "categories",
  orders: "orders",
  orderNotes: "orderNotes",
  customers: "customers",
  newsletterSubscribers: "newsletterSubscribers",
  contactMessages: "contactMessages",
  inventoryMovements: "inventoryMovements",
  stockReservations: "stockReservations",
  suppliers: "suppliers",
  purchases: "purchases",
  expenses: "expenses",
  adminUsers: "adminUsers",
  auditLogs: "auditLogs",
  paymentAttempts: "paymentAttempts",
  checkoutQuotes: "checkoutQuotes",
  exportJobs: "exportJobs",
  settings: "settings",
  counters: "counters",
  webhookEvents: "webhookEvents",
  idempotencyKeys: "idempotencyKeys",
  pages: "pages",
  navigationItems: "navigationItems",
  homepage: "homepage",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
