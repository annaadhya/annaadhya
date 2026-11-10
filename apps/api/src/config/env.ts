/**
 * Environment configuration — validated with Zod at boot. The API never starts with
 * silently-missing configuration; integrations that are unconfigured downgrade to explicit
 * mock/service-unconfigured states, never silent fake success.
 */
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001"),

  // Data provider
  DATA_PROVIDER: z.enum(["memory", "firestore"]).default("memory"),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIRESTORE_DATABASE_ID: z.string().optional(),

  // Dev-token auth (mock mode only; ignored when Firebase credentials exist).
  // Default secret keeps local mock mode frictionless — production forbids mock auth entirely.
  DEV_TOKEN_SECRET: z.string().min(16).default("dev-only-secret-change-me-0123456789"),

  // Admin bootstrap
  ADMIN_SETUP_KEY: z.string().min(8).optional(),

  // Payments
  PAYMENT_PROVIDER: z.enum(["mock", "razorpay"]).default("mock"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Media
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Storefront cache revalidation (CMS freshness). Optional: when unset, the
  // storefront still picks up content changes via its time-based revalidation.
  STOREFRONT_REVALIDATE_URL: z.string().url().optional(),
  STOREFRONT_REVALIDATE_SECRET: z.string().min(16).optional(),

  // Behaviour
  CHECKOUT_QUOTE_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  STOCK_RESERVATION_TTL_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  EXPORT_SYNC_ROW_LIMIT: z.coerce.number().int().min(500).max(200000).default(20000),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(10).max(10000).default(240),
});

export type ApiEnv = z.infer<typeof envSchema> & {
  isProduction: boolean;
  firebaseConfigured: boolean;
  razorpayConfigured: boolean;
  cloudinaryConfigured: boolean;
};

let cached: ApiEnv | null = null;

export function loadEnv(): ApiEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration -> ${issues}`);
  }
  const env = parsed.data;
  const firebaseConfigured = Boolean(
    env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY,
  );
  const razorpayConfigured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const cloudinaryConfigured = Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );
  const isProduction = env.NODE_ENV === "production";

  if (isProduction && env.DATA_PROVIDER === "memory") {
    throw new Error(
      "DATA_PROVIDER=memory is mock mode and is forbidden in production. Configure Firestore credentials.",
    );
  }
  if (isProduction && !firebaseConfigured) {
    throw new Error(
      "Production requires Firebase credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).",
    );
  }

  cached = {
    ...env,
    isProduction,
    firebaseConfigured,
    razorpayConfigured,
    cloudinaryConfigured,
  };
  return cached;
}

/** Test helper. */
export function resetEnvCache(): void {
  cached = null;
}
