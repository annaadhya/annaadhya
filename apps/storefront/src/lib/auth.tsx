"use client";
/**
 * AuthProvider — identity for the storefront.
 *
 * Production: Firebase Authentication (Google, email/password, phone OTP) via the Firebase JS
 * SDK; the resulting ID token is exchanged at POST /auth/verify.
 * Mock mode (no Firebase env): dev sign-in against POST /auth/dev/token (development only) —
 * the UI states this honestly and links to setup docs.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PUBLIC_API_URL, apiPost } from "./api";
import type { CustomerDoc, Principal } from "./types";

interface AuthCtx {
  principal: Principal | null;
  customer: CustomerDoc | null;
  token: string | null;
  mode: "firebase" | "mock";
  firebaseReady: boolean;
  loading: boolean;
  /** Real Firebase email-verification state. Null = unknown (mock mode / no session) —
   *  callers must not render a "Verified" badge from a guess. */
  emailVerified: boolean | null;
  // Email/password (Firebase mode)
  signInEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (name: string, email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInPhone: (otp: string) => Promise<void>;
  startPhone: (phone: string, recaptchaContainerId: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  // Dev mode
  devSignIn: (uid: string, displayName: string, email?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  phoneConfirmationPending: boolean;
}

const AuthContext = createContext<AuthCtx | null>(null);
const TOKEN_KEY = "annaadhya.auth.token";

/* Firebase lazy loading — only imported when configured */
let firebaseAuth: import("firebase/auth").Auth | null = null;
async function getFirebaseAuth(): Promise<import("firebase/auth").Auth | null> {
  if (firebaseAuth) return firebaseAuth;
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!cfg.apiKey || !cfg.projectId) return null;
  const { initializeApp, getApps } = await import("firebase/app");
  const app = getApps()[0] ?? initializeApp(cfg);
  const { getAuth } = await import("firebase/auth");
  firebaseAuth = getAuth(app);
  return firebaseAuth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [customer, setCustomer] = useState<CustomerDoc | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneConfirmationPending, setPhoneConfirmationPending] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [phoneConfirmation, setPhoneConfirmation] = useState<any>(null);

  const firebaseReady = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  const adoptSession = useCallback(async (idToken: string, verified?: boolean) => {
    const res = await apiPost<{ principal: Principal; customer: CustomerDoc | null }>("/auth/verify", { idToken });
    setPrincipal(res.principal);
    setCustomer(res.customer);
    setToken(idToken);
    setEmailVerified(typeof verified === "boolean" ? verified : null);
    if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, idToken);
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        if (firebaseReady) {
          const auth = await getFirebaseAuth();
          if (auth) {
            const { onIdTokenChanged } = await import("firebase/auth");
            // onIdTokenChanged (not one-shot onAuthStateChanged): it fires on mount with the
            // restored user AND again whenever the SDK refreshes the ID token, so the API
            // bearer stays valid in long-lived tabs (Firebase ID tokens expire after 1 hour).
            await new Promise<void>((resolve) => {
              unsub = onIdTokenChanged(auth, async (user) => {
                try {
                  if (user) await adoptSession(await user.getIdToken(), user.emailVerified);
                } catch {
                  /* verification failed — stay signed out; refreshProfile can self-heal */
                }
                resolve();
              });
            });
          }
        } else {
          const saved = localStorage.getItem(TOKEN_KEY);
          if (saved) {
            try {
              await adoptSession(saved);
            } catch {
              localStorage.removeItem(TOKEN_KEY);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => unsub?.();
  }, [adoptSession, firebaseReady]);

  const signInEmail = useCallback(
    async (email: string, password: string) => {
      if (!firebaseReady) throw new Error("Email sign-in requires Firebase configuration (see docs/environment-setup.md). Use dev sign-in in mock mode.");
      const auth = (await getFirebaseAuth())!;
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await adoptSession(await cred.user.getIdToken());
    },
    [adoptSession, firebaseReady],
  );

  const registerEmail = useCallback(
    async (name: string, email: string, password: string) => {
      if (!firebaseReady) throw new Error("Registration requires Firebase configuration. Use dev sign-in in mock mode.");
      const auth = (await getFirebaseAuth())!;
      const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await adoptSession(await cred.user.getIdToken());
    },
    [adoptSession, firebaseReady],
  );

  const signInGoogle = useCallback(async () => {
    if (!firebaseReady) throw new Error("Google sign-in requires Firebase configuration (docs/environment-setup.md).");
    const auth = (await getFirebaseAuth())!;
    const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await adoptSession(await cred.user.getIdToken());
  }, [adoptSession, firebaseReady]);

  const sendPasswordReset = useCallback(
    async (email: string) => {
      if (!firebaseReady) throw new Error("Password reset requires Firebase configuration (see docs/environment-setup.md).");
      const auth = (await getFirebaseAuth())!;
      const { sendPasswordResetEmail } = await import("firebase/auth");
      await sendPasswordResetEmail(auth, email);
    },
    [firebaseReady],
  );

  const startPhone = useCallback(
    async (phone: string, containerId: string) => {
      if (!firebaseReady) throw new Error("Phone OTP requires Firebase configuration (note: SMS costs apply).");
      const auth = (await getFirebaseAuth())!;
      const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
      const verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
      const confirmation = await signInWithPhoneNumber(auth, phone, verifier);
      setPhoneConfirmation(confirmation);
      setPhoneConfirmationPending(true);
    },
    [firebaseReady],
  );

  const signInPhone = useCallback(
    async (_otp: string) => {
      if (!phoneConfirmation) throw new Error("Request an OTP first");
      const cred = await phoneConfirmation.confirm(_otp);
      setPhoneConfirmationPending(false);
      setPhoneConfirmation(null);
      await adoptSession(await cred.user.getIdToken());
    },
    [adoptSession, phoneConfirmation],
  );

  const devSignIn = useCallback(
    async (uid: string, displayName: string, email?: string) => {
      const res = await apiPost<{ token: string; principal: Principal }>("/auth/dev/token", {
        uid,
        displayName,
        email,
        provider: "dev",
      });
      setPrincipal(res.principal);
      setToken(res.token);
      if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, res.token);
      await refreshProfile(res.token);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const refreshProfile = useCallback(async (explicitToken?: string) => {
    const t = explicitToken ?? localStorage.getItem(TOKEN_KEY);
    if (!t) return;
    try {
      const res = await fetch(`${PUBLIC_API_URL}/auth/me`, { headers: { authorization: `Bearer ${t}` } });
      const body = (await res.json()) as { ok: boolean; data?: { principal: Principal; customer: CustomerDoc | null } };
      if (body.ok && body.data) {
        setPrincipal(body.data.principal);
        setCustomer(body.data.customer);
        if (body.data.customer) healAttempted.current = true;
      }
    } catch {
      /* offline — keep cached profile */
    }
  }, []);

  // Self-heal: identity restored but the customer profile is missing (e.g. a transient
  // failure while /auth/verify provisioned it). One quiet re-pull after the restore
  // settles — never a loop: a failed refresh keeps state and this never re-arms.
  const healAttempted = useRef(false);
  useEffect(() => {
    if (loading || healAttempted.current || !principal || customer) return;
    healAttempted.current = true;
    const t = window.setTimeout(() => void refreshProfile(), 1500);
    return () => window.clearTimeout(t);
  }, [loading, principal, customer, refreshProfile]);

  const signOut = useCallback(async () => {
    if (firebaseReady) {
      const auth = await getFirebaseAuth();
      await auth?.signOut();
    }
    localStorage.removeItem(TOKEN_KEY);
    setPrincipal(null);
    setCustomer(null);
    setToken(null);
    setEmailVerified(null);
  }, [firebaseReady]);

  const value = useMemo<AuthCtx>(
    () => ({
      principal,
      customer,
      token,
      mode: firebaseReady ? "firebase" : "mock",
      firebaseReady,
      loading,
      emailVerified,
      signInEmail,
      registerEmail,
      signInGoogle,
      signInPhone,
      startPhone,
      sendPasswordReset,
      devSignIn,
      signOut,
      refreshProfile,
      phoneConfirmationPending,
    }),
    [
      principal, customer, token, firebaseReady, loading, emailVerified, signInEmail, registerEmail, signInGoogle,
      signInPhone, startPhone, sendPasswordReset, devSignIn, signOut, refreshProfile, phoneConfirmationPending,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
