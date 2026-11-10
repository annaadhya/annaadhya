"use client";
/** Newsletter capture — wired to the real subscribe API (POST /newsletter/subscribe).
 *  The backend stores the address idempotently (deterministic per-email document),
 *  so success, "already subscribed" and failure are all explicit states; nothing
 *  pretends. Exports for marketing live in Admin → Reports → Newsletter subscribers. */
import { useState } from "react";
import { apiPost } from "../lib/api";
import { IconCheck, IconPenLine } from "./icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type SubscribeResponse = { subscribed: true; alreadySubscribed: boolean };

type FormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; alreadySubscribed: boolean }
  | { kind: "error"; message: string };

export function NewsletterForm({ variant = "hero" }: { variant?: "hero" | "footer" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setState({ kind: "error", message: "Please enter a valid email address." });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await apiPost<SubscribeResponse>("/newsletter/subscribe", {
        email: value,
        source: variant === "hero" ? "homepage-hero" : "footer",
      });
      setState({ kind: "done", alreadySubscribed: res.alreadySubscribed });
    } catch (err) {
      const serverMsg = err instanceof Error ? err.message : "";
      const transient = !serverMsg || /failed to fetch|networkerror|load failed/i.test(serverMsg);
      setState({
        kind: "error",
        message: transient
          ? "We couldn't reach the kitchen just now — please try again in a moment."
          : serverMsg,
      });
    }
  }

  if (state.kind === "done") {
    const hero = variant === "hero";
    return (
      <div
        role="status"
        className={
          hero
            ? "mx-auto max-w-lg rounded-sm border border-gold-deep/40 bg-surface-container-lowest p-space-md text-center shadow-sm"
            : "rounded-sm border border-gold-deep/40 bg-surface-container-lowest p-space-md shadow-sm"
        }
      >
        <p
          className={`flex items-center gap-space-xs text-label-lg font-semibold text-primary ${
            hero ? "justify-center" : ""
          }`}
        >
          <IconCheck size={16} className="text-on-tertiary-container" />
          {state.alreadySubscribed ? "You're already on the list" : "You're on the list"}
        </p>
        <p className={`mt-space-xs text-body-sm text-on-surface-variant ${hero ? "" : ""}`}>
          {state.alreadySubscribed
            ? "This address was subscribed earlier — no need to sign up twice."
            : "Welcome to the pantry. We'll write only when there's something worth opening it for."}
        </p>
      </div>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <div className={variant === "hero" ? "mx-auto max-w-lg" : ""}>
      <form
        onSubmit={onSubmit}
        noValidate
        className={
          variant === "hero"
            ? "flex flex-col items-center gap-space-xs sm:flex-row sm:justify-center"
            : "flex items-center rounded-sm border border-outline-variant/30 bg-surface-container-lowest p-1 shadow-sm"
        }
      >
        <label className="sr-only" htmlFor={`newsletter-${variant}`}>
          Email address
        </label>
        <input
          id={`newsletter-${variant}`}
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          aria-invalid={state.kind === "error"}
          disabled={submitting}
          placeholder={variant === "hero" ? "Enter your email address" : "Enter your email"}
          className={
            variant === "hero"
              ? "w-full rounded-sm bg-surface-container-lowest px-space-md py-3.5 text-body-md text-on-surface shadow-sm transition-shadow placeholder:text-on-surface-variant focus:outline-none sm:flex-grow"
              : "w-full bg-transparent px-3 py-2 text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
          }
        />
        <button
          type="submit"
          disabled={submitting}
          className={
            variant === "hero"
              ? "btn-primary w-full shrink-0 px-8 py-3.5 text-label-md uppercase tracking-wider sm:w-auto disabled:cursor-wait disabled:opacity-70"
              : "shrink-0 rounded-sm bg-primary-container px-4 py-2 text-[0.6875rem] font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary disabled:cursor-wait disabled:opacity-70"
          }
        >
          {submitting ? "Subscribing…" : "Subscribe"}
        </button>
      </form>
      {state.kind === "error" && (
        <p role="alert" className="mt-space-xs text-label-sm text-error">
          {state.message}
        </p>
      )}
      {state.kind === "idle" && variant === "hero" && (
        <p className="mt-space-xs hidden items-center justify-center gap-space-xs text-label-sm text-on-surface-variant sm:flex">
          <IconPenLine size={14} className="text-on-tertiary-container" />
          Seasonal harvests and gift collections — no spam, unsubscribe any time.
        </p>
      )}
    </div>
  );
}
