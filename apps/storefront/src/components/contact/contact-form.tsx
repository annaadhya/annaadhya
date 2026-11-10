"use client";
/**
 * Contact form — the functional heart of the /contact page.
 *
 * Submission goes to the real backend (POST /contact/messages): server-side
 * zod validation, per-IP rate limiting, durable Firestore persistence. There is
 * deliberately no email provider in this project, so the success state claims
 * exactly what the backend confirms — received and stored, with the real
 * document reference — and nothing more (no delivery promises, no invented
 * ticket theatre).
 *
 * Network-retry safety: a clientRef is generated once per composed message and
 * the backend derives a deterministic document id from (email, clientRef), so
 * re-sending after a timeout can never create a duplicate. Field values are
 * preserved on every failure path.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PUBLIC_API_URL, type ApiEnvelope } from "@/lib/api";
import {
  IconCheck,
  IconChevronDown,
  IconCircleAlert,
  IconLock,
  IconSend,
  IconX,
} from "@/components/icons";

/** Mirrors CONTACT_ENQUIRY_TYPES from @annaadhya/contracts (storefront client code
 *  mirrors contracts values — the package's Node entry is not browser-bundleable;
 *  the server-side zod enum remains the single validating authority). */
const CONTACT_ENQUIRY_TYPES = [
  "General Enquiry",
  "Product Question",
  "Order Support",
  "Shipping and Delivery",
  "Return or Refund",
  "Gifting or Business Enquiry",
  "Other",
] as const;
type ContactEnquiryType = (typeof CONTACT_ENQUIRY_TYPES)[number];

type FieldErrors = Partial<Record<"fullName" | "email" | "enquiryType" | "orderNumber" | "subject" | "message", string>>;

const INITIAL = {
  fullName: "",
  email: "",
  enquiryType: "General Enquiry" as ContactEnquiryType,
  orderNumber: "",
  subject: "",
  message: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(values: typeof INITIAL): FieldErrors {
  const errors: FieldErrors = {};
  if (values.fullName.trim().length < 2) errors.fullName = "Please enter your full name.";
  if (!EMAIL_RE.test(values.email.trim())) errors.email = "Please enter a valid email address.";
  if (!(CONTACT_ENQUIRY_TYPES as readonly string[]).includes(values.enquiryType)) errors.enquiryType = "Please choose an enquiry type.";
  if (values.orderNumber.trim() && !/^[A-Za-z0-9-]{1,20}$/.test(values.orderNumber.trim())) {
    errors.orderNumber = "Letters, numbers and dashes only (up to 20 characters).";
  }
  if (values.subject.trim().length > 120) errors.subject = "Keep the subject under 120 characters.";
  if (values.message.trim().length < 10) errors.message = "Please tell us a little more (at least 10 characters).";
  if (values.message.trim().length > 2000) errors.message = "Keep your message under 2,000 characters.";
  return errors;
}

/** Server 422 payload — zod issues mapped to form fields. */
function fieldErrorsFromResponse(body: ApiEnvelope<unknown> | null): FieldErrors {
  const details = body?.error?.details;
  const errors: FieldErrors = {};
  if (Array.isArray(details)) {
    for (const d of details) {
      const path = typeof (d as { path?: unknown })?.path === "string" ? (d as { path: string }).path : "";
      const message = typeof (d as { message?: unknown })?.message === "string" ? (d as { message: string }).message : "";
      if (path && message && path in INITIAL) {
        errors[path as keyof FieldErrors] ??= message;
      }
    }
  }
  return errors;
}

export function ContactForm() {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [banner, setBanner] = useState<{ kind: "failed" | "uncertain"; text: string } | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  // One reference per composed message: survives retries, regenerated on reset.
  const clientRef = useRef<string>("");

  useEffect(() => {
    clientRef.current = crypto.randomUUID().replaceAll("-", "");
    // Gifting / order-support cards elsewhere on the page deep-link a preselected type.
    const preselect = new URLSearchParams(window.location.search).get("enquiry");
    if (preselect && (CONTACT_ENQUIRY_TYPES as readonly string[]).includes(preselect)) {
      setValues((v) => ({ ...v, enquiryType: preselect as ContactEnquiryType }));
    }
  }, []);

  function set<K extends keyof typeof INITIAL>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return; // double-submit guard
    setBanner(null);

    const clientErrors = validate(values);
    if (Object.values(clientErrors).some(Boolean)) {
      setErrors(clientErrors);
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch(`${PUBLIC_API_URL}/contact/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, clientRef: clientRef.current }),
      });
      const body = (await res.json().catch(() => null)) as ApiEnvelope<{ received: boolean; reference: string }> | null;

      if (res.ok && body?.ok && body.data?.received) {
        setReference(body.data.reference);
        setStatus("success");
        return;
      }
      if (res.status === 422 && body) {
        const serverErrors = fieldErrorsFromResponse(body);
        setErrors(
          Object.keys(serverErrors).length
            ? serverErrors
            : { message: body.error?.message ?? "Please review the highlighted fields." },
        );
        setStatus("idle");
        return;
      }
      // Definitive rejection (429 rate limit, 500…) — safe to invite a retry.
      setBanner({
        kind: "failed",
        text:
          res.status === 429
            ? "Too many attempts in a short time. Please wait a minute and send your message again — your text is preserved below."
            : `We couldn't submit your message just now${body?.error?.message ? ` — ${body.error.message}` : ""}. Please try again; your text is preserved below.`,
      });
      setStatus("idle");
    } catch {
      // Network error / timeout — the outcome is genuinely unknown. The same
      // clientRef is reused, so retrying cannot create a duplicate submission.
      setBanner({
        kind: "uncertain",
        text: "We couldn't confirm whether your message reached us — the connection was interrupted. Your text is preserved below, and sending again is safe: the same message reference is reused, so no duplicate is created.",
      });
      setStatus("idle");
    }
  }

  function resetForm() {
    setValues(INITIAL);
    setErrors({});
    setReference(null);
    setBanner(null);
    clientRef.current = crypto.randomUUID().replaceAll("-", "");
    setStatus("idle");
  }

  const field =
    "w-full min-h-12 bg-surface-container-low px-4 py-3 rounded text-body-md text-on-surface placeholder:text-on-surface-variant/60 outline-none border border-transparent focus:bg-surface-container-lowest focus:border-primary focus:ring-2 focus:ring-primary/30 transition-colors";
  const invalidField = "border-error focus:border-error focus:ring-error/25";
  const labelCls = "flex items-center justify-between text-label-md font-semibold tracking-wide text-on-surface";

  if (status === "success") {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest p-6 shadow-lg sm:p-10" aria-live="polite">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-on-tertiary-container to-secondary" aria-hidden />
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            <IconCheck size={32} strokeWidth={2.5} aria-hidden />
          </span>
          <span className="text-label-sm font-bold uppercase tracking-widest text-on-secondary-container">Message received</span>
          <h3 className="mt-1 font-display text-headline-md font-semibold text-primary sm:text-headline-lg">Thank you for reaching out.</h3>
          <p className="mt-3 max-w-lg text-body-md leading-relaxed text-on-surface-variant">
            We&apos;ve received your message and appreciate you getting in touch. Keep the reference below — it helps us find your enquiry quickly if you write again.
          </p>
          <p className="mt-6 w-full max-w-md rounded-xl bg-surface-container-low px-4 py-3 text-left text-body-sm text-on-surface-variant">
            <span className="block font-label-md font-semibold text-on-surface">Reference</span>
            <span className="block break-all font-mono text-xs">{reference}</span>
          </p>
          <button
            type="button"
            onClick={resetForm}
            className="mt-6 rounded bg-primary px-6 py-3 text-label-lg font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest p-6 shadow-lg sm:p-10">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-on-tertiary-container to-secondary" aria-hidden />

      <div className="mb-8">
        <span className="text-label-sm font-semibold uppercase tracking-widest text-on-tertiary-container">Send us a message</span>
        <h2 className="mt-1 mb-2 font-display text-headline-md font-semibold text-primary sm:text-headline-lg">We read every note</h2>
        <p className="text-body-md text-on-surface-variant">
          Fill in the details below and we&apos;ll get back to you by email. Fields marked{" "}
          <span aria-hidden className="font-bold text-error">*</span> are required.
        </p>
      </div>

      {banner ? (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl bg-error-container p-4 text-on-error-container shadow-sm">
          <IconCircleAlert size={20} className="mt-0.5 shrink-0 text-error" aria-hidden />
          <div className="flex-1">
            <p className="text-label-lg font-semibold text-error">
              {banner.kind === "uncertain" ? "We couldn't confirm your submission" : "Your message wasn't submitted"}
            </p>
            <p className="mt-0.5 text-body-sm leading-relaxed">{banner.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="shrink-0 rounded p-1 text-on-error-container transition-colors hover:text-error"
            aria-label="Dismiss message"
          >
            <IconX size={18} aria-hidden />
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* Row 1: name + email */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-name" className={labelCls}>
              <span>
                Full name <span aria-hidden className="font-bold text-error">*</span>
              </span>
            </label>
            <input
              id="contact-name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={values.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={errors.fullName ? "contact-name-error" : undefined}
              className={`${field} ${errors.fullName ? invalidField : ""}`}
              placeholder="Enter your full name"
            />
            {errors.fullName ? (
              <p id="contact-name-error" className="flex items-center gap-1 text-body-sm text-error">
                <IconCircleAlert size={14} aria-hidden /> {errors.fullName}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-email" className={labelCls}>
              <span>
                Email address <span aria-hidden className="font-bold text-error">*</span>
              </span>
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "contact-email-error" : undefined}
              className={`${field} ${errors.email ? invalidField : ""}`}
              placeholder="you@example.com"
            />
            {errors.email ? (
              <p id="contact-email-error" className="flex items-center gap-1 text-body-sm text-error">
                <IconCircleAlert size={14} aria-hidden /> {errors.email}
              </p>
            ) : null}
          </div>
        </div>

        {/* Row 2: enquiry type + order number */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-enquiry-type" className={labelCls}>
              <span>
                Enquiry type <span aria-hidden className="font-bold text-error">*</span>
              </span>
            </label>
            <div className="relative">
              <select
                id="contact-enquiry-type"
                name="enquiryType"
                value={values.enquiryType}
                onChange={(e) => set("enquiryType", e.target.value)}
                aria-invalid={Boolean(errors.enquiryType)}
                className={`${field} cursor-pointer appearance-none pr-10 ${errors.enquiryType ? invalidField : ""}`}
              >
                {CONTACT_ENQUIRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <IconChevronDown
                size={18}
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
                aria-hidden
              />
            </div>
            {errors.enquiryType ? (
              <p className="flex items-center gap-1 text-body-sm text-error">
                <IconCircleAlert size={14} aria-hidden /> {errors.enquiryType}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-order-id" className={labelCls}>
              <span>Order number</span>
              <span className="font-normal text-on-surface-variant">Optional</span>
            </label>
            <input
              id="contact-order-id"
              name="orderId"
              type="text"
              maxLength={20}
              value={values.orderNumber}
              onChange={(e) => set("orderNumber", e.target.value)}
              aria-invalid={Boolean(errors.orderNumber)}
              aria-describedby={errors.orderNumber ? "contact-order-error" : "contact-order-hint"}
              className={`${field} ${errors.orderNumber ? invalidField : ""}`}
              placeholder="e.g. AN-2026-000123"
            />
            {errors.orderNumber ? (
              <p id="contact-order-error" className="flex items-center gap-1 text-body-sm text-error">
                <IconCircleAlert size={14} aria-hidden /> {errors.orderNumber}
              </p>
            ) : (
              <p id="contact-order-hint" className="text-[12px] leading-snug text-on-surface-variant">
                Helpful if your enquiry concerns an existing order — you&apos;ll find it under Account → Orders.
              </p>
            )}
          </div>
        </div>

        {/* Row 3: subject */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-subject" className={labelCls}>
            <span>Subject</span>
            <span className="font-normal text-on-surface-variant">Optional</span>
          </label>
          <input
            id="contact-subject"
            name="subject"
            type="text"
            maxLength={120}
            value={values.subject}
            onChange={(e) => set("subject", e.target.value)}
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={errors.subject ? "contact-subject-error" : undefined}
            className={`${field} ${errors.subject ? invalidField : ""}`}
            placeholder="What can we help you with?"
          />
          {errors.subject ? (
            <p id="contact-subject-error" className="flex items-center gap-1 text-body-sm text-error">
              <IconCircleAlert size={14} aria-hidden /> {errors.subject}
            </p>
          ) : null}
        </div>

        {/* Row 4: message */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-message" className={labelCls}>
            <span>
              Message <span aria-hidden className="font-bold text-error">*</span>
            </span>
            <span className="font-normal text-on-surface-variant">{values.message.trim().length}/2000</span>
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={5}
            maxLength={2000}
            value={values.message}
            onChange={(e) => set("message", e.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "contact-message-error" : undefined}
            className={`${field} resize-y ${errors.message ? invalidField : ""}`}
            placeholder="Tell us a little more about your enquiry…"
          />
          {errors.message ? (
            <p id="contact-message-error" className="flex items-center gap-1 text-body-sm text-error">
              <IconCircleAlert size={14} aria-hidden /> {errors.message}
            </p>
          ) : null}
        </div>

        {/* Privacy note */}
        <div className="flex items-start gap-3 pt-1">
          <IconLock size={18} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden />
          <p className="text-body-sm leading-relaxed text-on-surface-variant">
            Your details are used only to respond to your enquiry, in line with our{" "}
            <Link href="/policies/privacy" className="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-container">
              Privacy Policy
            </Link>
            . We never share customer information or add you to marketing emails without consent.
          </p>
        </div>

        {/* Submit */}
        <div className="pt-1">
          <button
            type="submit"
            disabled={status === "submitting"}
            className="group inline-flex h-12 min-h-12 min-w-[220px] items-center justify-center gap-2 rounded bg-primary px-8 text-label-lg font-semibold text-on-primary shadow-md transition-all hover:bg-primary-container hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "submitting" ? (
              <>
                <span className="size-5 animate-spin rounded-full border-2 border-on-primary/30 border-t-on-primary" aria-hidden />
                <span role="status">Sending…</span>
              </>
            ) : (
              <>
                Send message
                <IconSend size={18} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
