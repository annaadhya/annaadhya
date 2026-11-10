/**
 * Firebase client (admin panel) — lazy-loaded only when the NEXT_PUBLIC_FIREBASE_* variables
 * are present at build time. In mock-mode deployments (no variables) every helper returns null
 * and the login screen falls back to the dev-token form, exactly like the storefront does.
 *
 * The panel has no other Firebase touchpoints: sign-in yields a Firebase ID token which is
 * exchanged at POST /auth/verify and then used as the session bearer token (the API verifies
 * it with the Admin SDK on every call, so refreshing the token keeps the session alive).
 */

let authPromise: Promise<import("firebase/auth").Auth | null> | null = null;

/** True when the build has the minimum Firebase client config inlined. */
export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  );
}

export function getFirebaseAuth(): Promise<import("firebase/auth").Auth | null> {
  if (!isFirebaseClientConfigured()) return Promise.resolve(null);
  if (authPromise) return authPromise;
  authPromise = (async () => {
    const cfg = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    const { initializeApp, getApps } = await import("firebase/app");
    const app = getApps()[0] ?? initializeApp(cfg);
    const { getAuth } = await import("firebase/auth");
    return getAuth(app);
  })();
  return authPromise;
}
