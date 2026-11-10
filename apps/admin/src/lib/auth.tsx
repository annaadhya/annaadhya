"use client";
/**
 * AuthProvider — client context for the admin session.
 *
 * Firebase-mode flow (production): email/password or Google sign-in via the Firebase JS SDK →
 * Firebase ID token → POST /auth/verify (the API verifies it with the Admin SDK and resolves
 * the staff role from the adminUsers registry) → the ID token itself becomes the session
 * bearer token; an onIdTokenChanged listener keeps it fresh (tokens expire after ~1 hour).
 *
 * Dev/mock-mode flow: POST /auth/dev/token with { uid, email, displayName, provider: "dev" }.
 * When the API has Firebase configured that endpoint refuses with 403 and the login screen
 * switches to the Firebase sign-in form instead.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  API_BASE,
  apiGet,
  apiPost,
  clearSession,
  getStoredPrincipal,
  getToken,
  setSession,
  TOKEN_KEY,
  type DevLoginResponse,
} from "./api";
import { getFirebaseAuth, isFirebaseClientConfigured } from "./firebase";
import type { AuthPrincipal } from "./types";

interface PlatformMode {
  dataProvider?: string;
  authentication?: string;
  payments?: string;
  razorpayConfigured?: boolean;
  cloudinaryConfigured?: boolean;
  sandbox?: boolean;
}

interface VerifyResponse {
  principal: AuthPrincipal;
  customer: unknown;
  staff: unknown;
  mode?: PlatformMode;
}

interface AuthContextValue {
  /** null until the session has been restored on mount. */
  principal: AuthPrincipal | null;
  ready: boolean;
  mode: PlatformMode | null;
  loginDev: (input: { uid: string; email?: string; displayName?: string }) => Promise<AuthPrincipal>;
  loginFirebaseEmail: (email: string, password: string) => Promise<AuthPrincipal>;
  loginFirebaseGoogle: () => Promise<AuthPrincipal>;
  logout: () => void;
  refreshMode: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<PlatformMode | null>(null);

  const refreshMode = useCallback(async () => {
    try {
      const status = await apiGet<{ mode?: PlatformMode }>("/auth/platform-status");
      if (status?.mode) setMode(status.mode);
    } catch {
      setMode(null);
    }
  }, []);

  // Session restore. Firebase builds restore from the Firebase SDK session (survives new
  // tabs via its own persistence); mock builds restore from sessionStorage as before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isFirebaseClientConfigured()) {
          const auth = await getFirebaseAuth();
          if (auth) {
            const { onAuthStateChanged } = await import("firebase/auth");
            await new Promise<void>((resolve) => {
              onAuthStateChanged(auth, (user) => {
                if (!user || cancelled) {
                  resolve();
                  return;
                }
                void user
                  .getIdToken()
                  .then(async (idToken) => {
                    const data = await apiPost<VerifyResponse>("/auth/verify", { idToken });
                    if (!cancelled) {
                      if (data.mode) setMode(data.mode);
                      setSession(idToken, data.principal);
                      setPrincipal(data.principal);
                    }
                  })
                  .catch(() => {
                    /* verification failed — stay signed out */
                  })
                  .finally(resolve);
              });
            });
          }
        } else {
          const stored = getStoredPrincipal();
          if (stored && getToken()) {
            setPrincipal(stored);
            // Dev-token sessions have no SDK session to re-verify against, so the
            // platform mode descriptor (e.g. cloudinaryConfigured) must be re-fetched
            // after every full page navigation — otherwise server-config surfaces go stale.
            void refreshMode();
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMode]);

  // Keep the stored bearer token fresh — Firebase ID tokens expire after ~1 hour and the
  // API verifies the token on every call. Only touches an existing session; logout clears it.
  useEffect(() => {
    if (!isFirebaseClientConfigured()) return;
    let unsub: (() => void) | null = null;
    void (async () => {
      const auth = await getFirebaseAuth();
      if (!auth) return;
      const { onIdTokenChanged } = await import("firebase/auth");
      unsub = onIdTokenChanged(auth, (user) => {
        if (!user || !getToken()) return;
        void user.getIdToken().then((fresh) => {
          window.sessionStorage.setItem(TOKEN_KEY, fresh);
        });
      });
    })();
    return () => unsub?.();
  }, []);

  const loginDev = useCallback(
    async (input: { uid: string; email?: string; displayName?: string }) => {
      const data = await apiPost<DevLoginResponse>("/auth/dev/token", {
        uid: input.uid,
        email: input.email || undefined,
        displayName: input.displayName || undefined,
        provider: "dev",
      });
      if (data.mode) setMode(data.mode);
      const staffPrincipal = data.principal;
      setSession(data.token, staffPrincipal);
      setPrincipal(staffPrincipal);
      return staffPrincipal;
    },
    [],
  );

  const loginFirebase = useCallback(
    async (kind: "password" | "google", email?: string, password?: string) => {
      const auth = await getFirebaseAuth();
      if (!auth) throw new Error("Firebase sign-in is not configured on this deployment.");
      const { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } = await import(
        "firebase/auth"
      );
      const cred =
        kind === "password"
          ? await signInWithEmailAndPassword(auth, email ?? "", password ?? "")
          : await signInWithPopup(auth, new GoogleAuthProvider());
      const idToken = await cred.user.getIdToken();
      const data = await apiPost<VerifyResponse>("/auth/verify", { idToken });
      if (data.mode) setMode(data.mode);
      setSession(idToken, data.principal);
      setPrincipal(data.principal);
      return data.principal;
    },
    [],
  );

  const loginFirebaseEmail = useCallback(
    (email: string, password: string) => loginFirebase("password", email, password),
    [loginFirebase],
  );

  const loginFirebaseGoogle = useCallback(() => loginFirebase("google"), [loginFirebase]);

  const logout = useCallback(() => {
    // Deliberately does NOT sign out of Firebase: the admin and the storefront share the
    // same Firebase project (and origin), so a sign-out here would kill the storefront
    // session too. Clearing the admin session is enough.
    clearSession();
    setPrincipal(null);
  }, []);

  const value = useMemo(
    () => ({
      principal,
      ready,
      mode,
      loginDev,
      loginFirebaseEmail,
      loginFirebaseGoogle,
      logout,
      refreshMode,
    }),
    [principal, ready, mode, loginDev, loginFirebaseEmail, loginFirebaseGoogle, logout, refreshMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export { API_BASE };
