"use client";
/**
 * /login — admin sign-in, "Modern Indian Heritage Editorial" Stitch design.
 *
 * Modes (the API decides, surfaced via GET /auth/platform-status):
 *  - Firebase mode (production): Google + email/password via the Firebase JS SDK. The ID
 *    token is exchanged at POST /auth/verify, where the API verifies it with the Admin SDK
 *    and resolves the staff role from the adminUsers registry. Authentication is NOT
 *    authorization: a valid Firebase account without a staff record lands on the
 *    access-denied view — customers can never open the console this way. The first-owner
 *    bootstrap disclosure (POST /auth/bootstrap-owner, guarded by ADMIN_SETUP_KEY) is
 *    preserved inside that view. Password reset uses Firebase sendPasswordResetEmail with
 *    a deliberately neutral confirmation that never discloses whether an email exists.
 *  - Mock mode (non-production): POST /auth/dev/token form — same behaviour as before,
 *    restyled. The API refuses dev tokens whenever real authentication is configured.
 *
 * Design fidelity notes: the Stitch prototype's state-switcher ribbon, prefilled demo
 * credentials and preview-only image URLs are intentionally NOT reproduced. Fabricated
 * system metrics (states count, "RBAC vault", SLA) are replaced with true statements about
 * this console; see the implementation report for the full copy-substitution list.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase";
import { ApiError } from "@/lib/api";

/* ------------------------------- utilities ------------------------------- */

/**
 * The admin mounts under basePath "/admin" (next.config.ts) — plain <img> and
 * other non-Next asset URLs must carry that prefix or they fall through to the
 * storefront catch-all in production. Keep in sync with next.config.ts.
 */
const ASSET_BASE = "/admin";

/** Read + sanitize the ?next= return-to target (same-origin paths only). */
function safeNextFromWindow(): string {
  if (typeof window === "undefined") return "/dashboard";
  const raw = new URLSearchParams(window.location.search).get("next") ?? "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return "/dashboard";
  return raw;
}

function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) {
    return "Incorrect email or password.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts — wait a moment and try again.";
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized for sign-in — add it under Firebase Console → Authentication → Settings → Authorized domains.";
  }
  if (code === "auth/operation-not-allowed") {
    return "This sign-in provider is not enabled — turn it on under Firebase Console → Authentication → Sign-in method.";
  }
  if (code === "auth/popup-blocked") {
    return "The browser blocked the Google sign-in popup — allow popups for this page and try again.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Google sign-in was cancelled.";
  }
  if (code === "auth/network-request-failed") return "Network error — check your connection.";
  return err instanceof Error ? err.message : "Sign-in failed — try again.";
}

function resetErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/too-many-requests") return "Too many attempts — wait a moment and try again.";
  if (code === "auth/network-request-failed") return "Network error — check your connection.";
  return err instanceof Error ? err.message : "Could not send the reset link — try again.";
}

function validateEmail(value: string): string | null {
  if (!value.trim()) return "Work email is required.";
  if (!/^\S+@\S+\.\S+$/.test(value.trim())) return "Enter a valid email address.";
  return null;
}

/* --------------------------------- icons --------------------------------- */
/** Inline SVG icons on a 24px grid — Material-Symbols style, no icon font. */

type IconProps = { className?: string };

function IconLock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconShield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 2.8v5.1c0 4.4-2.9 7.9-7 10.1-4.1-2.2-7-5.7-7-10.1V5.8L12 3z" />
    </svg>
  );
}

function IconBox({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8l8-4.5L20 8v8l-8 4.5L4 16V8z" />
      <path d="M4 8l8 4.5L20 8M12 12.5V20" />
    </svg>
  );
}

function IconError({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.2" />
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconLockClock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="10.5" width="12.5" height="9" rx="2" />
      <path d="M6 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <circle cx="17.5" cy="16.5" r="4.3" />
      <path d="M17.5 14.6v2l1.4 1.3" />
    </svg>
  );
}

function IconClose({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconAtSign({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M15.6 12v1.3a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.4 6.9" />
    </svg>
  );
}

function IconKey({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="M10.5 12.5L20 3M16.5 6.5l2.8 2.8M13.7 9.3l2 2" />
    </svg>
  );
}

function IconEye({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function IconEyeOff({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6 0 9.5 7 9.5 7a17.6 17.6 0 0 1-3 3.9M6.1 6.9A16.4 16.4 0 0 0 2.5 12S6 19 12 19a9.4 9.4 0 0 0 4.3-1" />
      <path d="M9.5 9.8a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

function IconVerified({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 2.8v5.1c0 4.4-2.9 7.9-7 10.1-4.1-2.2-7-5.7-7-10.1V5.8L12 3z" />
      <path d="M9.2 12.1l2 2 3.6-4.2" />
    </svg>
  );
}

function IconShieldBad({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 2.8v5.1c0 4.4-2.9 7.9-7 10.1-4.1-2.2-7-5.7-7-10.1V5.8L12 3z" />
      <path d="M9.8 9.8l4.4 4.4M14.2 9.8l-4.4 4.4" />
    </svg>
  );
}

function IconHelp({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.6c0 1.6-2.5 2-2.5 3.4" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconArrowBack({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5m6-6l-6 6 6 6" />
    </svg>
  );
}

function IconArrowForward({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14m-6-6l6 6-6 6" />
    </svg>
  );
}

function IconMail({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7.2l8.5 5.8 8.5-5.8" />
    </svg>
  );
}

function IconMailRead({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.5 11v5.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h8.3" />
      <path d="M3.5 7.2L10 11.8" />
      <path d="M14.5 10.5l2.2 2.2 4-4.4" />
    </svg>
  );
}

function IconSend({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 3L10.2 13.8M21 3l-6.8 18-3.9-7.2L3 9.9 21 3z" />
    </svg>
  );
}

function GoogleMonogram({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" fill="#4285F4" />
      <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z" fill="#34A853" />
      <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z" fill="#FBBC05" />
      <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" fill="#EA4335" />
    </svg>
  );
}

function Spinner({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${className ?? ""} animate-spin`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" fill="currentColor" className="opacity-75" />
    </svg>
  );
}

/* ------------------------------ shared pieces ----------------------------- */

const INPUT_CLASSES =
  "w-full rounded-lg bg-surface-container-low focus:bg-surface-container-lowest text-on-surface pl-10 pr-4 py-3 text-body-md text-on-surface transition-colors outline-none focus:ring-2 focus:ring-primary shadow-sm disabled:cursor-not-allowed disabled:opacity-60 placeholder:text-on-surface-variant/60";

/** Label row (label + right hint) in the heritage style. */
function FieldLabel({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={htmlFor} className="text-label-md text-on-surface font-semibold flex items-center gap-1">
        {children}
        <span className="text-error">*</span>
      </label>
      {hint ? <span className="text-label-sm text-on-surface-variant">{hint}</span> : null}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-label-sm text-error flex items-center gap-1 pt-0.5">
      <IconError className="h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

/** Dismissible error banner (Google failures) — error-container styling from the design. */
function GoogleErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="mb-6 bg-error-container text-on-error-container rounded-lg p-3.5 shadow-sm flex items-start gap-3 justify-between">
      <div className="flex items-start gap-2.5">
        <IconError className="h-5 w-5 text-error mt-0.5 shrink-0" />
        <div>
          <p className="text-label-lg font-bold">Google Sign-In Failed</p>
          <p className="text-body-sm text-on-surface-variant">{message}</p>
        </div>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="text-on-surface-variant hover:text-error p-1 rounded focus-visible:outline-2 focus-visible:outline-error">
        <IconClose className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}

/** Non-dismissible auth-failure banner (email/password failures). */
function AuthErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-6 bg-error-container text-on-error-container rounded-lg p-3.5 shadow-sm flex items-start gap-3">
      <IconLockClock className="h-5 w-5 text-error mt-0.5 shrink-0" />
      <div>
        <p className="text-label-lg font-bold">Authentication Failed</p>
        <p className="text-body-sm text-on-surface-variant">{message}</p>
      </div>
    </div>
  );
}

/** Eyebrow chip above the welcome heading. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-label-sm uppercase tracking-widest font-bold">
      <span className="w-1.5 h-1.5 rounded-full bg-secondary" aria-hidden />
      {children}
    </div>
  );
}

/** The left brand panel — constant across every state of the page. */
function BrandPanel() {
  return (
    <div className="lg:col-span-5 flex flex-col justify-between bg-surface-container-low rounded-xl p-6 sm:p-8 lg:p-10 relative overflow-hidden shadow-sm">
      {/* Ambient decorative glows */}
      <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-primary-fixed-dim/30 blur-3xl pointer-events-none" aria-hidden />
      <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-secondary-fixed/40 blur-3xl pointer-events-none" aria-hidden />

      <div className="relative z-10 space-y-6">
        {/* Logo & badge row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-surface-container-lowest p-1.5 shadow-sm flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- static PNG crest, next/image adds nothing */}
              <img src={`${ASSET_BASE}/brand/annaadhya-logo.png`} alt="Annaadhya crest" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-heritage-display text-headline-sm text-primary leading-tight">Annaadhya</span>
              <span className="text-label-sm tracking-wider uppercase text-on-surface-variant">Heritage Provisions</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-label-sm uppercase tracking-wider shadow-sm">
            <IconShield className="h-3.5 w-3.5" />
            Headquarters
          </span>
        </div>

        {/* Editorial header */}
        <div className="space-y-2">
          <h1 className="font-heritage-display text-headline-md text-primary tracking-tight">
            Your Business. <br className="hidden sm:inline" />
            <span className="italic font-normal">Beautifully in Balance.</span>
          </h1>
          <p className="text-body-md text-on-surface-variant leading-relaxed">
            The private portal for Annaadhya Products stewardship — orchestrating single-origin
            harvests, artisanal batch inventory, cold-chain consignments, and pan-India fulfillment.
          </p>
        </div>

        {/* Arched pantry still-life frame */}
        <div className="relative">
          <div className="relative rounded-t-[5rem] rounded-b-xl overflow-hidden shadow-md bg-surface-container-high">
            {/* eslint-disable-next-line @next/next/no-img-element -- self-hosted decorative still life */}
            <img
              src={`${ASSET_BASE}/login-still-life.jpg`}
              alt="Artisanal still life: saffron threads in a brass bowl with almonds, cashews, pistachios and a jar of golden wild honey on rustic wood in warm light"
              className="w-full h-56 sm:h-64 lg:h-72 object-cover object-center"
            />
            <div className="absolute bottom-3 left-3 right-3 bg-surface/95 backdrop-blur-md rounded-lg p-3 shadow-md flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <IconBox className="h-[22px] w-[22px] text-secondary shrink-0" />
                <div className="min-w-0">
                  <p className="text-label-md text-on-surface font-semibold">Kashmir &amp; Malabar Batches</p>
                  <p className="text-label-sm text-on-surface-variant truncate">Single-origin harvests · Batch tracked</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-label-sm font-bold tracking-wider shrink-0">SECURE</span>
            </div>
          </div>
        </div>

        {/* Capability pills — true statements about this console (design had fabricated metrics) */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface-container-lowest rounded-lg p-2.5 shadow-sm text-center">
            <span className="block font-heritage-display text-headline-sm text-primary">5</span>
            <span className="block text-label-sm text-on-surface-variant leading-tight">Staff roles</span>
          </div>
          <div className="bg-surface-container-lowest rounded-lg p-2.5 shadow-sm text-center">
            <span className="block font-heritage-display text-headline-sm text-secondary">11</span>
            <span className="block text-label-sm text-on-surface-variant leading-tight">Console sections</span>
          </div>
          <div className="bg-surface-container-lowest rounded-lg p-2.5 shadow-sm text-center">
            <span className="block font-heritage-display text-headline-sm text-tertiary-container">SSO</span>
            <span className="block text-label-sm text-on-surface-variant leading-tight">Google sign-in</span>
          </div>
        </div>
      </div>

      {/* Footer notice */}
      <div className="relative z-10 pt-6 mt-6">
        <p className="bg-surface-container-lowest/60 rounded-lg p-3 text-center text-label-sm text-on-surface-variant tracking-wide uppercase">
          Restricted gateway • Authorized Annaadhya personnel only
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- page ---------------------------------- */

export default function LoginPage() {
  const router = useRouter();
  const { principal, ready, mode, loginDev, loginFirebaseEmail, loginFirebaseGoogle, logout, refreshMode } =
    useAuth();

  const [view, setView] = useState<"form" | "denied" | "reset">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Dev (mock-mode) form state — same fields as before the redesign.
  const [devUid, setDevUid] = useState("");
  const [devDisplayName, setDevDisplayName] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [devBlocked, setDevBlocked] = useState<string | null>(null);
  const [deniedReason, setDeniedReason] = useState<string | null>(null);

  // Password-reset view state.
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // Validated return-to target (read once on mount, client only).
  const nextHref = useRef("/dashboard");
  useEffect(() => {
    nextHref.current = safeNextFromWindow();
  }, []);

  // Surface the platform auth mode up-front so the correct form renders before the first attempt.
  useEffect(() => {
    void refreshMode();
  }, [refreshMode]);

  // Staff sessions go straight to the console (honouring ?next); authenticated
  // non-staff sessions land on the access-denied view — never auto-granted.
  useEffect(() => {
    if (!ready) return;
    if (principal?.isStaff) {
      router.replace(nextHref.current);
      return;
    }
    if (principal && !principal.isStaff) setView("denied");
  }, [ready, principal, router]);

  const firebaseMode = mode?.authentication === "firebase";
  const firebaseClientReady = isFirebaseClientConfigured();
  // Firebase-capable builds wait for the API's mode verdict so the right form
  // renders first; pure mock builds render immediately.
  const deciding = !ready || (mode === null && firebaseClientReady);

  /** Apply the remember-device choice to the Firebase session before signing in. */
  const applyPersistence = useCallback(async () => {
    const auth = await getFirebaseAuth();
    if (!auth) return;
    const { setPersistence, browserSessionPersistence, browserLocalPersistence } = await import(
      "firebase/auth"
    );
    await setPersistence(auth, rememberDevice ? browserLocalPersistence : browserSessionPersistence);
  }, [rememberDevice]);

  async function onFirebaseSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setGoogleError(null);
    const emailInvalid = validateEmail(email);
    const passwordInvalid = password ? null : "Password is required for portal authentication.";
    setEmailError(emailInvalid);
    setPasswordError(passwordInvalid);
    if (emailInvalid || passwordInvalid) return;

    setSubmitting(true);
    try {
      await applyPersistence();
      const authPrincipal = await loginFirebaseEmail(email.trim(), password);
      if (!authPrincipal.isStaff) return; // access-denied view takes over via the principal effect
      router.replace(nextHref.current);
    } catch (err) {
      setAuthError(firebaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogleSubmit() {
    setAuthError(null);
    setGoogleError(null);
    setEmailError(null);
    setPasswordError(null);
    setSubmitting(true);
    try {
      await applyPersistence();
      const authPrincipal = await loginFirebaseGoogle();
      if (!authPrincipal.isStaff) return; // access-denied view takes over via the principal effect
      router.replace(nextHref.current);
    } catch (err) {
      setGoogleError(firebaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDevSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setDevBlocked(null);
    setSubmitting(true);
    try {
      const authPrincipal = await loginDev({ uid: devUid, displayName: devDisplayName, email: devEmail });
      if (!authPrincipal.isStaff) {
        setDeniedReason(
          `Signed in as "${authPrincipal.role}" — this account has no staff record. Ask an owner to invite you from Team, or use a staff UID.`,
        );
        return;
      }
      router.replace(nextHref.current);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403 || err.status === 503 || err.code === "service_unconfigured") {
          setDevBlocked(err.message);
        } else {
          setAuthError(err.message);
        }
      } else {
        setAuthError("Unexpected error — try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    const invalid = validateEmail(resetEmail);
    if (invalid) {
      setResetError(invalid);
      return;
    }
    setResetSubmitting(true);
    try {
      const auth = await getFirebaseAuth();
      if (!auth) throw new Error("Firebase sign-in is not configured on this deployment.");
      const { sendPasswordResetEmail } = await import("firebase/auth");
      await sendPasswordResetEmail(auth, resetEmail.trim());
      // Deliberately neutral: shown for unknown addresses too, so the form never
      // discloses whether an email is registered.
      setResetSent(true);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/user-not-found") {
        setResetSent(true); // same neutral path — never disclose registration
        return;
      }
      setResetError(resetErrorMessage(err));
    } finally {
      setResetSubmitting(false);
    }
  }

  /** Back to the sign-in form: clear the local admin session only. */
  function backToSignIn() {
    setDeniedReason(null);
    logout();
    setView("form");
  }

  /** Switch account: also sign out of Firebase on this origin so the chooser reappears. */
  async function switchAccount() {
    if (firebaseClientReady) {
      try {
        const auth = await getFirebaseAuth();
        if (auth) {
          const { signOut } = await import("firebase/auth");
          await signOut(auth);
        }
      } catch {
        // fall through — the local session is cleared regardless
      }
    }
    setDeniedReason(null);
    logout();
    setView("form");
  }

  function startPasswordReset() {
    setResetError(null);
    setResetSent(false);
    setResetEmail(email);
    setView("reset");
  }

  const deniedUid = principal?.uid ?? "";

  return (
    <div className="font-heritage-sans min-h-screen bg-surface text-on-surface">
      {/* Top chrome */}
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(39,24,16,0.04)]">
        <div className="h-16 max-w-7xl mx-auto px-5 lg:px-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-heritage-display text-headline-sm text-primary tracking-tight">Annaadhya</span>
            <span className="text-label-sm text-on-surface-variant uppercase tracking-widest pl-2.5 border-l border-outline-variant/40">
              Portal Staff
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-label-md text-on-surface-variant">
            <IconLock className="h-[18px] w-[18px] text-secondary" />
            <span className="hidden sm:inline">Encrypted Gateway</span>
          </div>
        </div>
      </header>

      <main className="w-full pt-16 bg-surface min-h-screen flex flex-col justify-center">
        <section className="max-w-7xl mx-auto w-full px-5 lg:px-12 py-6 lg:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
            <BrandPanel />

            {/* Right panel — the workspace that switches between views */}
            <div className="lg:col-span-7 flex flex-col justify-center bg-surface-container-lowest rounded-xl p-6 sm:p-8 lg:p-10 shadow-md relative">
              {view === "denied" ? (
                /* ------------------- VIEW: access denied (authenticated, not staff) ------------------- */
                <div className="py-4 text-center space-y-6">
                  <div className="w-16 h-16 rounded-full bg-error-container text-error mx-auto flex items-center justify-center shadow-sm">
                    <IconShieldBad className="h-9 w-9" />
                  </div>
                  <div className="space-y-2 max-w-md mx-auto">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-error-container text-on-error-container text-label-sm font-bold uppercase tracking-wider">
                      Error 403 • Authorization Denied
                    </span>
                    <h2 className="font-heritage-display text-headline-md text-primary pt-2">Restricted Access Portal</h2>
                    <p className="text-body-md text-on-surface-variant">
                      This account doesn’t have permission to open the Annaadhya Products admin.
                      Valid storefront customer accounts are not staff accounts — admin access is
                      granted only through the team registry, verified server-side on every request.
                    </p>
                    {deniedReason ? <p className="text-body-sm text-on-surface-variant italic">{deniedReason}</p> : null}
                  </div>

                  <div className="bg-surface-container-low rounded-lg p-5 max-w-md mx-auto text-left space-y-2">
                    <div className="flex items-center gap-2 text-on-surface text-label-md font-semibold">
                      <IconHelp className="h-[18px] w-[18px] text-primary" />
                      Need administrative rights?
                    </div>
                    <p className="text-body-sm text-on-surface-variant">
                      Ask an existing owner to invite you from <strong className="text-on-surface">Team</strong> —
                      the API checks the staff registry before every console request.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={backToSignIn}
                      className="w-full sm:w-auto px-6 py-3 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-label-lg transition-colors shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Back to Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => void switchAccount()}
                      className="w-full sm:w-auto px-6 py-3 rounded-lg bg-surface-container-low text-on-surface text-label-lg hover:bg-surface-container transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Switch Account
                    </button>
                  </div>

                  {/* First-owner bootstrap — preserved operational flow from the previous login page. */}
                  {deniedUid ? (
                    <details className="max-w-md mx-auto w-full text-left bg-surface-container-low rounded-lg p-4">
                      <summary className="text-label-md text-on-surface font-semibold cursor-pointer select-none">
                        First-time owner setup
                      </summary>
                      <div className="mt-3 space-y-2.5 text-body-sm text-on-surface-variant">
                        <p>
                          This Firebase account is not on the team registry yet. The{" "}
                          <strong className="text-on-surface">first owner</strong> can provision
                          themselves with the one-time bootstrap endpoint:
                        </p>
                        <div className="rounded-md bg-surface-container p-3">
                          <p className="mb-1 font-medium text-on-surface">Your account UID:</p>
                          <code className="block break-all rounded bg-surface-container-highest/60 px-2 py-1 text-xs text-on-surface">
                            {deniedUid}
                          </code>
                        </div>
                        <ol className="list-decimal space-y-1 pl-5">
                          <li>
                            Open <code className="rounded bg-surface-container px-1 py-0.5 text-xs text-on-surface">/api/docs</code>{" "}
                            →{" "}
                            <code className="rounded bg-surface-container px-1 py-0.5 text-xs text-on-surface">POST /auth/bootstrap-owner</code>
                          </li>
                          <li>
                            Body:{" "}
                            <code className="break-all rounded bg-surface-container px-1 py-0.5 text-xs text-on-surface">
                              {`{ "setupKey": "<ADMIN_SETUP_KEY>", "uid": "${deniedUid}", "displayName": "Owner", "email": "<your email>" }`}
                            </code>
                          </li>
                          <li>Come back here and sign in again.</li>
                        </ol>
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : view === "reset" && firebaseMode && firebaseClientReady ? (
                /* ------------------------- VIEW: staff password reset ------------------------- */
                <div className="space-y-6 max-w-lg mx-auto w-full">
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={backToSignIn}
                      className="inline-flex items-center gap-1 text-primary hover:underline text-label-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
                    >
                      <IconArrowBack className="h-4 w-4" />
                      Back to Sign In
                    </button>
                    <h2 className="font-heritage-display text-headline-md text-primary pt-1">Reset Staff Credentials</h2>
                    <p className="text-body-md text-on-surface-variant">
                      Enter your email and Firebase Authentication will send a password-reset link to
                      your inbox.
                    </p>
                  </div>

                  {resetSent ? (
                    <div role="status" className="bg-secondary-container text-on-secondary-container rounded-lg p-4 shadow-sm space-y-1">
                      <div className="flex items-center gap-2 text-label-lg font-semibold">
                        <IconMailRead className="h-5 w-5 text-secondary" />
                        Reset link sent
                      </div>
                      <p className="text-body-sm">
                        If an account exists for this email, a reset link is on its way. Links
                        expire — use yours soon.
                      </p>
                    </div>
                  ) : null}

                  <form onSubmit={onResetSubmit} className="space-y-5" noValidate>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="reset-email" hint="Registered staff email">
                        Email Address
                      </FieldLabel>
                      <div className="relative">
                        <IconMail className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-on-surface-variant" />
                        <input
                          id="reset-email"
                          name="reset-email"
                          type="email"
                          autoComplete="email"
                          placeholder="staff@annaadhya.com"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          disabled={resetSubmitting}
                          aria-invalid={resetError ? true : undefined}
                          aria-describedby={resetError ? "reset-email-error" : undefined}
                          className={INPUT_CLASSES}
                        />
                      </div>
                      <FieldError id="reset-email-error" message={resetError} />
                    </div>

                    <button
                      type="submit"
                      disabled={resetSubmitting}
                      className="w-full py-3.5 px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-label-lg transition-colors shadow-md flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {resetSubmitting ? <Spinner className="h-5 w-5" /> : <IconSend className="h-[18px] w-[18px]" />}
                      {resetSubmitting ? "Sending…" : "Send Reset Link"}
                    </button>
                  </form>

                  <div className="bg-surface-container-low rounded-lg p-3 text-center">
                    <p className="text-label-sm text-on-surface-variant">
                      Notice: Annaadhya will never ask for your password or any verification codes.
                    </p>
                  </div>
                </div>
              ) : deciding ? (
                /* ------------------------------ VIEW: restoring ------------------------------ */
                <div className="py-16 flex flex-col items-center gap-3 text-center">
                  <Spinner className="h-6 w-6 text-secondary" />
                  <p className="text-label-md text-on-surface-variant">Restoring session…</p>
                </div>
              ) : firebaseMode && firebaseClientReady ? (
                /* -------------------------- VIEW: Firebase sign-in -------------------------- */
                <div className="space-y-5">
                  {googleError ? <GoogleErrorBanner message={googleError} onDismiss={() => setGoogleError(null)} /> : null}
                  {authError ? <AuthErrorBanner message={authError} /> : null}

                  <div className="space-y-1.5">
                    <Eyebrow>Admin Portal • Secure Gateway</Eyebrow>
                    <h2 className="font-heritage-display text-headline-md text-primary pt-1">Welcome back</h2>
                    <p className="text-body-md text-on-surface-variant">
                      Sign in with your authorized team credentials to access inventory, batches, and
                      operations.
                    </p>
                  </div>

                  {/* Google sign-in */}
                  <div>
                    <button
                      type="button"
                      onClick={() => void onGoogleSubmit()}
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {submitting ? <Spinner className="h-5 w-5 text-secondary" /> : <GoogleMonogram className="h-5 w-5" />}
                      <span className="text-label-lg text-on-surface font-semibold">
                        {submitting ? "Connecting to Identity Gateway…" : "Continue with Google Workspace"}
                      </span>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="relative flex items-center justify-center py-1">
                    <div className="w-full h-px bg-surface-container-high" aria-hidden />
                    <span className="absolute bg-surface-container-lowest px-3 text-label-sm uppercase tracking-wider text-on-surface-variant font-medium">
                      or sign in with email
                    </span>
                  </div>

                  {/* Email + password */}
                  <form onSubmit={onFirebaseSubmit} className="space-y-5" noValidate>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="work-email" hint="Google SSO or staff email">
                        Work Email Address
                      </FieldLabel>
                      <div className="relative">
                        <IconAtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-on-surface-variant" />
                        <input
                          id="work-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          placeholder="staff@annaadhya.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (emailError) setEmailError(null);
                          }}
                          disabled={submitting}
                          aria-invalid={emailError ? true : undefined}
                          aria-describedby={emailError ? "email-error" : undefined}
                          className={INPUT_CLASSES}
                        />
                      </div>
                      <FieldError id="email-error" message={emailError} />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="staff-password" hint="Verified by Firebase Auth">
                        Master Password
                      </FieldLabel>
                      <div className="relative">
                        <IconKey className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-on-surface-variant" />
                        <input
                          id="staff-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••••••••••"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (passwordError) setPasswordError(null);
                          }}
                          disabled={submitting}
                          aria-invalid={passwordError ? true : undefined}
                          aria-describedby={passwordError ? "password-error" : undefined}
                          className={`${INPUT_CLASSES} pr-12`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors p-1 rounded focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          {showPassword ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
                        </button>
                      </div>
                      <FieldError id="password-error" message={passwordError} />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberDevice}
                          onChange={(e) => setRememberDevice(e.target.checked)}
                          className="w-4 h-4 rounded accent-primary bg-surface-container-low cursor-pointer"
                        />
                        <span className="text-label-md text-on-surface-variant">Remember this device for 30 days</span>
                      </label>
                      <button
                        type="button"
                        onClick={startPasswordReset}
                        className="text-label-md text-primary font-semibold hover:underline rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <div className="pt-1">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-label-lg transition-colors shadow-md disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {submitting ? <Spinner className="h-5 w-5" /> : null}
                        {submitting ? "Verifying Credentials…" : "Sign In to Admin Portal"}
                        {submitting ? null : <IconArrowForward className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </form>

                  <div className="pt-1 flex items-center justify-center gap-2 text-center text-on-surface-variant">
                    <IconVerified className="h-4 w-4 text-secondary shrink-0" />
                    <p className="text-label-sm">
                      Sign-ins are verified by Firebase Authentication. Staff access is re-checked by
                      the API on every request.
                    </p>
                  </div>
                </div>
              ) : firebaseMode ? (
                /* ---------------- Firebase mode, client config missing (honest block) ---------------- */
                <div className="space-y-3 max-w-lg mx-auto w-full">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-label-sm uppercase tracking-widest font-bold">
                    Setup Required
                  </div>
                  <h2 className="font-heritage-display text-headline-md text-primary">Firebase client config missing</h2>
                  <p className="text-body-md text-on-surface-variant">
                    The API uses Firebase authentication, but this admin build has no{" "}
                    <code className="rounded bg-surface-container px-1 py-0.5 text-xs">NEXT_PUBLIC_FIREBASE_*</code>{" "}
                    variables, so the panel cannot open a Firebase sign-in.
                  </p>
                  <p className="rounded-lg bg-surface-container-low p-3.5 text-body-sm text-on-surface-variant">
                    Set NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
                    NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_APP_ID on the admin
                    service and redeploy — they are inlined at build time.
                  </p>
                </div>
              ) : (
                /* --------------------- VIEW: mock-mode dev sign-in (sandbox only) --------------------- */
                <div className="space-y-5 max-w-lg mx-auto w-full">
                  {authError ? <AuthErrorBanner message={authError} /> : null}

                  <div className="space-y-1.5">
                    <Eyebrow>Admin Console • Sandbox Mode</Eyebrow>
                    <h2 className="font-heritage-display text-headline-md text-primary pt-1">Welcome back</h2>
                    <p className="text-body-md text-on-surface-variant">
                      Sign in with a staff UID. In mock mode the API mints a dev session for
                      development — the server resolves your role and permissions from the staff
                      registry, never from this form.
                    </p>
                  </div>

                  <form onSubmit={onDevSubmit} className="space-y-5" noValidate>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="uid" hint="Required">
                        User ID (UID)
                      </FieldLabel>
                      <div className="relative">
                        <IconKey className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-on-surface-variant" />
                        <input
                          id="uid"
                          name="uid"
                          value={devUid}
                          onChange={(e) => setDevUid(e.target.value)}
                          placeholder="e.g. dev-owner-01"
                          autoComplete="username"
                          minLength={4}
                          required
                          disabled={submitting}
                          className={INPUT_CLASSES}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="displayName" className="text-label-md text-on-surface font-semibold">
                        Display name
                      </label>
                      <div className="relative">
                        <input
                          id="displayName"
                          name="displayName"
                          value={devDisplayName}
                          onChange={(e) => setDevDisplayName(e.target.value)}
                          placeholder="How your name appears in audit logs"
                          autoComplete="name"
                          disabled={submitting}
                          className={`${INPUT_CLASSES} pl-4`}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="dev-email" className="text-label-md text-on-surface font-semibold">
                        Email
                      </label>
                      <div className="relative">
                        <IconAtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-on-surface-variant" />
                        <input
                          id="dev-email"
                          name="email"
                          type="email"
                          value={devEmail}
                          onChange={(e) => setDevEmail(e.target.value)}
                          placeholder="you@annaadhya.example"
                          autoComplete="email"
                          disabled={submitting}
                          className={INPUT_CLASSES}
                        />
                      </div>
                    </div>

                    {devBlocked ? (
                      <div role="alert" className="bg-tertiary-fixed/40 rounded-lg p-3.5 text-body-sm text-on-surface">
                        {devBlocked}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      disabled={submitting || !devUid.trim()}
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-label-lg transition-colors shadow-md disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {submitting ? <Spinner className="h-5 w-5" /> : null}
                      {submitting ? "Verifying Credentials…" : "Sign In to Admin Portal"}
                    </button>
                  </form>

                  <div className="pt-1 flex items-center justify-center gap-2 text-center text-on-surface-variant">
                    <IconVerified className="h-4 w-4 text-secondary shrink-0" />
                    <p className="text-label-sm">
                      Platform mode: <strong>mock dev tokens</strong> (non-production). Sessions last
                      12 hours and live in sessionStorage only.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
