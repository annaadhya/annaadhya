"use client";
/**
 * /account/login — approved "Modern Indian Heritage" Stitch design.
 *
 * Real Firebase Authentication through the shared AuthProvider (no parallel auth system):
 *   - Continue with Google (popup) and email/password sign-in
 *   - Forgot password via Firebase sendPasswordResetEmail (neutral confirmation)
 *   - Safe `?next=` redirects, already-signed-in customers skip the form
 * Honest states only: no fake success, no raw Firebase error codes, no prefilled
 * demo credentials. Phone OTP is intentionally not offered on this page per the
 * approved design; the AuthProvider still supports it for future surfaces.
 * In mock mode (Firebase env unset) an honest dev sign-in is preserved.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";

/* --------------------------------- helpers -------------------------------- */

function safeNext(param: string | null): string | null {
  if (!param) return null;
  // Internal app paths only: single leading "/", never protocol-relative or scheme-bearing.
  if (!param.startsWith("/") || param.startsWith("//") || param.includes("\\") || param.includes(":")) return null;
  return param;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FirebaseErr = Error & { code?: string };

function credentialMessage(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password. Please verify your details or reset your password below.";
    case "auth/invalid-email":
      return "That email address doesn't look right. Please check it and try again.";
    case "auth/too-many-requests":
      return "Too many attempts in a short time. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "We couldn't reach the sign-in service. Check your connection and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Write to concierge@annaadhya.com for help.";
    default:
      return "Sign-in failed just now. Please try again in a moment.";
  }
}

function isCredentialError(code: string): boolean {
  return code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found";
}

function googleMessage(code: string): string {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google window closed before sign-in finished. Continue whenever you're ready.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow popups for this site, or continue with email below.";
    case "auth/operation-not-allowed":
    case "auth/unauthorized-domain":
      return "Google sign-in isn't enabled for this site in the Firebase console yet — email sign-in works below.";
    case "auth/network-request-failed":
      return "We couldn't reach the sign-in service. Check your connection and try again.";
    default:
      return "Google sign-in failed just now. You can continue with email in the meantime.";
  }
}

/* ---------------------------------- icons --------------------------------- */

function IconGoogle() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function IconStroke({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const IconLeaf = ({ className }: { className?: string }) => (
  <IconStroke
    className={className}
    d="M12 21v-8m0 0c0-4 3-7 8-7 0 4-3 7-8 7zm0 0c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"
  />
);

const IconRosette = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5L11 15l4.5-5.5" />
  </svg>
);

const IconThermometer = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M10 4a2 2 0 014 0v9.3a4.5 4.5 0 11-4 0z" />
    <path d="M12 16.5h.01" strokeWidth="2.6" />
  </svg>
);

const IconError = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V13m0 3.5h.01" />
  </svg>
);

const Spinner = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className ?? ""}`} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/* ------------------------------ shared pieces ------------------------------ */

function Eyebrow({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-block h-0.5 w-6 bg-tertiary-fixed-dim" aria-hidden="true" />
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">{children}</span>
    </div>
  );
}

function AlertBanner({ title, body, onDismiss }: { title: string; body: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg bg-error-container p-4 text-[13px] leading-5 text-on-error-container shadow-sm">
      <IconError className="mt-0.5 h-5 w-5 shrink-0 text-error" />
      <div className="flex-1">
        <span className="block font-semibold text-error">{title}</span>
        {body}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="rounded p-0.5 text-on-error-container/70 transition-colors hover:text-on-error-container"
      >
        <IconStroke className="h-4 w-4" d="M6 6l12 12M18 6L6 18" />
      </button>
    </div>
  );
}

const inputClasses =
  "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-[15px] leading-6 text-on-surface " +
  "shadow-sm outline-none transition placeholder:text-on-surface-variant/60 " +
  "focus:border-primary focus:bg-surface-container-low focus:ring-2 focus:ring-primary";

const primaryButtonClasses =
  "flex h-12 w-full items-center justify-center gap-2.5 rounded-lg bg-primary text-[14px] font-semibold tracking-[0.04em] text-on-primary " +
  "shadow-sm transition hover:bg-primary-container active:scale-[0.99] " +
  "disabled:cursor-not-allowed disabled:opacity-70";

/* ------------------------------ editorial panel ---------------------------- */

function EditorialPanel() {
  return (
    <aside
      className="relative flex min-h-[360px] flex-col justify-between overflow-hidden rounded-xl lg:col-span-5 lg:min-h-[640px]"
      aria-label="About Annaadhya"
    >
      <div className="absolute inset-0 bg-[url('/demo-images/hero.svg')] bg-cover bg-center" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary-container via-primary-container/55 to-primary/25" aria-hidden="true" />

      <div className="relative z-10 flex items-center justify-between gap-3 p-5 md:p-6">
        <span className="flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1 text-primary shadow-sm backdrop-blur">
          <IconLeaf className="h-4 w-4 text-tertiary-container" />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em]">Artisanal Provenance</span>
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-primary/80">Harvest No. 1928</span>
      </div>

      <div className="relative z-10 m-4 rounded-lg bg-surface-container-lowest/95 p-5 shadow-md backdrop-blur md:m-6 md:p-6">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-secondary">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
          Members Consignment
        </p>
        <h2 className="mt-2 font-display text-[22px] font-medium leading-[30px] tracking-tight text-primary">
          A little closer to what you love.
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-on-surface-variant">
          Welcome back to Annaadhya. Return to your reserved pantry harvests, tracked consignments, and bespoke
          artisanal traditions.
        </p>
        <ul className="mt-3 space-y-1.5 text-on-surface">
          <li className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em]">
            <IconRosette className="h-4 w-4 shrink-0 text-secondary" />
            Direct Estate Provenance
          </li>
          <li className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em]">
            <IconLeaf className="h-4 w-4 shrink-0 text-secondary" />
            Cold-Pressed &amp; Unadulterated
          </li>
          <li className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.06em]">
            <IconThermometer className="h-4 w-4 shrink-0 text-secondary" />
            Temperature-Guarded Transit
          </li>
        </ul>
      </div>
    </aside>
  );
}

/* -------------------------------- the page --------------------------------- */

export default function LoginPage() {
  return (
    <div className="w-full bg-surface font-body text-on-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14">
        <LoginExperience />
      </div>
    </div>
  );
}

function LoginExperience() {
  const auth = useAuth();
  const router = useRouter();
  // Read the intended destination straight from the URL on the client — no
  // useSearchParams/Suspense boundary needed, so the page prerenders fully.
  // `next` never affects markup (redirects/handlers only), so SSR/CSR stay identical.
  const [next] = useState(() =>
    typeof window === "undefined" ? null : safeNext(new URLSearchParams(window.location.search).get("next")),
  );

  const [view, setView] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [alert, setAlert] = useState<{ title: string; body: string } | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const [dev, setDev] = useState({ uid: "", displayName: "", email: "" });
  const [devBusy, setDevBusy] = useState(false);

  /* Already-authenticated customers never see the form — go straight to their destination. */
  useEffect(() => {
    if (!auth.loading && auth.principal) router.replace(next ?? "/account");
  }, [auth.loading, auth.principal, next, router]);

  function submitSignIn(e: FormEvent) {
    e.preventDefault();
    if (signingIn || googleBusy) return;
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = "Please enter your email address.";
    else if (!EMAIL_RE.test(email.trim())) errors.email = "Please enter a valid email address.";
    if (!password) errors.password = "Please enter your password.";
    else if (password.length < 6) errors.password = "Password must be at least 6 characters.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSigningIn(true);
    setAlert(null);
    auth
      .signInEmail(email.trim(), password)
      .then(() => router.replace(next ?? "/account"))
      .catch((err: FirebaseErr) => {
        setAlert(
          err.code
            ? {
                title: isCredentialError(err.code) ? "Access Restricted" : "Sign-in failed",
                body: credentialMessage(err.code),
              }
            : { title: "Sign-in failed", body: err.message || credentialMessage("") },
        );
      })
      .finally(() => setSigningIn(false));
  }

  function continueWithGoogle() {
    if (signingIn || googleBusy) return;
    setGoogleBusy(true);
    setAlert(null);
    auth
      .signInGoogle()
      .then(() => router.replace(next ?? "/account"))
      .catch((err: FirebaseErr) => {
        setAlert({
          title: "Google sign-in",
          body: err.code ? googleMessage(err.code) : err.message || googleMessage(""),
        });
      })
      .finally(() => setGoogleBusy(false));
  }

  function submitReset(e: FormEvent) {
    e.preventDefault();
    if (resetBusy) return;
    if (!EMAIL_RE.test(resetEmail.trim())) {
      setResetError("Please enter a valid email address.");
      return;
    }
    setResetError(null);
    setResetBusy(true);
    auth
      .sendPasswordReset(resetEmail.trim())
      .then(() => setResetSent(true))
      .catch((err: FirebaseErr) => {
        // Stay neutral about whether the address has an account (anti-enumeration).
        if (err.code === "auth/user-not-found") setResetSent(true);
        else if (err.code === "auth/network-request-failed")
          setResetError("We couldn't reach the reset service. Check your connection and try again.");
        else setResetError("Couldn't send the reset link just now. Please try again in a moment.");
      })
      .finally(() => setResetBusy(false));
  }

  function submitDev(e: FormEvent) {
    e.preventDefault();
    if (devBusy) return;
    setDevBusy(true);
    setAlert(null);
    auth
      .devSignIn(dev.uid.trim() || `customer-${Date.now().toString(36)}`, dev.displayName.trim() || "Demo Customer", dev.email.trim() || undefined)
      .then(() => router.replace(next ?? "/account"))
      .catch((err: Error) => setAlert({ title: "Demo sign-in failed", body: err.message }))
      .finally(() => setDevBusy(false));
  }

  const emailValid = EMAIL_RE.test(email.trim());

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
      <EditorialPanel />

      <div className="flex flex-col justify-center lg:col-span-7">
        <div className="w-full rounded-xl bg-surface-container-lowest p-6 shadow-md sm:p-10">
          {auth.loading && auth.firebaseReady ? (
            <div className="flex min-h-[420px] items-center justify-center" role="status">
              <p className="text-sm text-on-surface-variant">Checking your session…</p>
            </div>
          ) : !auth.firebaseReady ? (
            /* ------------------- mock mode — honest dev sign-in ------------------- */
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <Eyebrow>Account Access</Eyebrow>
                <h1 className="mt-1 font-display text-[28px] font-medium leading-9 tracking-tight text-primary">
                  Welcome Back
                </h1>
              </div>
              <p className="rounded-lg bg-surface-container-high p-4 text-[13px] leading-5 text-on-surface">
                <strong className="font-semibold">Demo mode:</strong> Firebase isn&apos;t configured yet, so sign-in uses
                a local development identity against the API&apos;s dev-token endpoint. Production sign-in (Google &amp;
                email) activates automatically once the Firebase environment variables are set — see
                docs/environment-setup.md.
              </p>
              {alert && <AlertBanner title={alert.title} body={alert.body} onDismiss={() => setAlert(null)} />}
              <form className="flex flex-col gap-4" onSubmit={submitDev}>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="dev-name" className="text-[14px] font-semibold tracking-[0.04em] text-on-surface">
                    Display name
                  </label>
                  <input
                    id="dev-name"
                    className={inputClasses}
                    value={dev.displayName}
                    onChange={(e) => setDev({ ...dev, displayName: e.target.value })}
                    autoComplete="name"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="dev-email" className="text-[14px] font-semibold tracking-[0.04em] text-on-surface">
                    Email (optional)
                  </label>
                  <input
                    id="dev-email"
                    type="email"
                    className={inputClasses}
                    value={dev.email}
                    onChange={(e) => setDev({ ...dev, email: e.target.value })}
                    autoComplete="email"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="dev-uid" className="text-[14px] font-semibold tracking-[0.04em] text-on-surface">
                    User id (any stable string)
                  </label>
                  <input id="dev-uid" className={inputClasses} value={dev.uid} onChange={(e) => setDev({ ...dev, uid: e.target.value })} />
                </div>
                <button type="submit" className={primaryButtonClasses} disabled={devBusy}>
                  {devBusy && <Spinner className="h-5 w-5" />}
                  {devBusy ? "Signing In…" : "Continue (demo)"}
                </button>
              </form>
            </div>
          ) : view === "signin" ? (
            /* -------------------------- main sign-in view -------------------------- */
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <Eyebrow>Account Access</Eyebrow>
                <h1 className="mt-1 font-display text-[28px] font-medium leading-9 tracking-tight text-primary">
                  Welcome Back
                </h1>
                <p className="text-[15px] leading-6 text-on-surface-variant">
                  Sign in to your Annaadhya account to continue.
                </p>
              </div>

              {alert && <AlertBanner title={alert.title} body={alert.body} onDismiss={() => setAlert(null)} />}

              <button
                type="button"
                onClick={continueWithGoogle}
                disabled={signingIn || googleBusy}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-surface-container-lowest text-[14px] font-semibold tracking-[0.04em] text-on-surface shadow-sm ring-1 ring-outline-variant transition hover:bg-surface-container-low active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {googleBusy ? <Spinner className="h-5 w-5 text-primary" /> : <IconGoogle />}
                {googleBusy ? "Authenticating with Google…" : "Continue with Google"}
              </button>

              <div className="relative flex items-center justify-center" aria-hidden="true">
                <div className="h-px w-full bg-surface-container-highest" />
                <span className="absolute bg-surface-container-lowest px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                  or continue with email
                </span>
              </div>

              <form className="flex flex-col gap-4" onSubmit={submitSignIn} noValidate>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="login-email" className="flex items-center justify-between text-[14px] font-semibold tracking-[0.04em] text-on-surface">
                    <span>Email Address</span>
                    <span className="text-[11px] font-normal tracking-[0.08em] text-on-surface-variant">Registered user</span>
                  </label>
                  <div className="relative">
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      className={`${inputClasses} h-12 pr-11`}
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                      }}
                      aria-invalid={fieldErrors.email ? true : undefined}
                      aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                    />
                    {emailValid && !fieldErrors.email && (
                      <IconRosette className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-secondary" />
                    )}
                  </div>
                  {fieldErrors.email && (
                    <p id="login-email-error" className="flex items-center gap-1 text-[13px] leading-5 text-error">
                      <IconError className="h-4 w-4 shrink-0" />
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="text-[14px] font-semibold tracking-[0.04em] text-on-surface">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setView("forgot");
                        setAlert(null);
                        setResetSent(false);
                        setResetError(null);
                      }}
                      className="text-[12px] font-semibold tracking-[0.06em] text-on-primary-fixed-variant underline underline-offset-2 transition-colors hover:text-primary"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className={`${inputClasses} h-12 pl-4 pr-12`}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
                      }}
                      aria-invalid={fieldErrors.password ? true : undefined}
                      aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-on-surface-variant transition-colors hover:text-on-surface"
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                          <path d="M3 3l18 18" />
                          <path d="M10.6 5.8A9.8 9.8 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 01-2.4 3.2M6.4 6.9A16.9 16.9 0 002.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.1-1" />
                          <path d="M9.9 9.9a3 3 0 004.2 4.2" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p id="login-password-error" className="flex items-center gap-1 text-[13px] leading-5 text-error">
                      <IconError className="h-4 w-4 shrink-0" />
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <button type="submit" className={`${primaryButtonClasses} mt-1`} disabled={signingIn || googleBusy}>
                  {signingIn && <Spinner className="h-5 w-5" />}
                  {signingIn ? "Signing In…" : "Sign In"}
                </button>
              </form>

              <div className="flex flex-col items-center gap-2 pt-1">
                <Link
                  href="/shop"
                  className="group flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-on-surface-variant transition-colors hover:text-primary"
                >
                  <IconStroke className="h-4 w-4 transition-transform group-hover:-translate-x-1" d="M19 12H5m6-6l-6 6 6 6" />
                  Return to Shopping
                </Link>
                <p className="flex items-center gap-1.5 text-center text-[13px] leading-5 text-on-surface-variant">
                  <IconStroke className="h-4 w-4 shrink-0 text-secondary" d="M5 11h14v9H5zM8 11V8a4 4 0 018 0v3" />
                  Protected with 256-bit SSL encryption. Personal details are never shared.
                </p>
                <p className="text-[12px] tracking-[0.04em] text-on-surface-variant">
                  New to Annaadhya? Continue with Google — your account is created automatically.
                </p>
              </div>
            </div>
          ) : (
            /* ------------------------ forgot-password view ------------------------ */
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <Eyebrow>Account Recovery</Eyebrow>
                <h2 className="mt-1 font-display text-[28px] font-medium leading-9 tracking-tight text-primary">
                  Reset Your Password
                </h2>
                <p className="text-[15px] leading-6 text-on-surface-variant">
                  Enter the email address associated with your account and we&apos;ll help you reset your password.
                </p>
              </div>

              {resetSent && (
                <div role="status" className="flex items-start gap-3 rounded-lg bg-secondary-container p-4 text-[13px] leading-5 text-on-secondary-container shadow-sm">
                  <IconStroke className="mt-0.5 h-[22px] w-[22px] shrink-0 text-secondary" d="M3 7l9 6 9-6M3 7v10h18V7M3 7l9 6 9-6m-6.5 3.5L17 12l2-2" />
                  <div className="flex-1">
                    <strong className="block font-semibold">Instructions Dispatched</strong>
                    If an account exists for this email, we have sent instructions to reset your password. Please check
                    your inbox and spam folders.
                  </div>
                </div>
              )}

              {resetError && (
                <p role="alert" className="flex items-center gap-1.5 rounded-lg bg-error-container p-3 text-[13px] leading-5 text-on-error-container">
                  <IconError className="h-4 w-4 shrink-0 text-error" />
                  {resetError}
                </p>
              )}

              <form className="flex flex-col gap-4" onSubmit={submitReset} noValidate>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="forgot-email" className="text-[14px] font-semibold tracking-[0.04em] text-on-surface">
                    Account Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    className={`${inputClasses} h-12`}
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => {
                      setResetEmail(e.target.value);
                      if (resetError) setResetError(null);
                    }}
                    aria-invalid={resetError ? true : undefined}
                  />
                </div>
                <button type="submit" className={primaryButtonClasses} disabled={resetBusy}>
                  {resetBusy && <Spinner className="h-5 w-5" />}
                  {resetBusy ? "Sending Link…" : "Send Reset Link"}
                </button>
              </form>

              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setView("signin");
                    setAlert(null);
                    setFieldErrors({});
                  }}
                  className="group flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-primary transition-colors hover:text-primary-container"
                >
                  <IconStroke className="h-[18px] w-[18px] transition-transform group-hover:-translate-x-1" d="M19 12H5m6-6l-6 6 6 6" />
                  Back to Sign In
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
