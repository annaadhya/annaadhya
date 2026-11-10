"use client";
/**
 * Checkout status — the confirmation step of the approved design. States are driven
 * by the URL plus live payment-attempt polling (server truth, never client belief):
 *
 *   result=success    server already verified the payment before this redirect
 *   result=pending    gateway outcome unknown — polls GET /payments/:attemptId/status
 *   result=cancelled  Razorpay modal dismissed — order stays unpaid, cart preserved
 *   result=failure    payment failed — cart preserved, safe to retry
 *   result=placed     COD — order confirmed, payment due on delivery
 *
 * The cart is cleared here only when the server reports a succeeded attempt.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PUBLIC_API_URL } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { IconArrowRight, IconBadgeCheck, IconShieldCheck, IconShoppingBag } from "@/components/icons";

interface AttemptStatus {
  status: string;
  order: { orderNumber: string; status: string; paymentStatus: string } | null;
}

const HEADLINES: Record<string, { title: string; body: string }> = {
  success: {
    title: "Order confirmed",
    body: "Thank you! Your payment is verified and your order is confirmed. A confirmation email follows once dispatch begins — you can also track it from your account.",
  },
  pending: {
    title: "Order received",
    body: "We're waiting for the payment gateway to confirm. This page updates automatically — you can also check your account orders.",
  },
  cancelled: {
    title: "Payment cancelled",
    body: "The payment window was closed before completion — nothing was charged and your basket is intact. You can retry checkout whenever you're ready.",
  },
  failure: {
    title: "Payment didn't go through",
    body: "The payment attempt failed or was cancelled. Your basket items were reserved briefly and released — nothing was charged. You can retry checkout anytime.",
  },
  placed: {
    title: "Order placed",
    body: "Your order is confirmed — pay in cash or by UPI when it arrives at your doorstep. You can track it anytime from your account.",
  },
};

function StatusInner() {
  const sp = useSearchParams();
  const cart = useCart();
  const result = sp.get("result") ?? "pending";
  const orderNumber = sp.get("order");
  const [live, setLive] = useState<AttemptStatus | null>(null);
  const cartCleared = useRef(false);

  // Poll the payment attempt for server-side truth (pending/uncertain outcomes).
  useEffect(() => {
    const attemptId = sp.get("attemptId");
    if (!attemptId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${PUBLIC_API_URL}/payments/${attemptId}/status`);
        const body = (await res.json()) as { ok: boolean; data?: AttemptStatus };
        if (body.ok && body.data) {
          setLive(body.data);
          if (body.data.status === "succeeded" || body.data.status === "failed") clearInterval(timer);
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [sp]);

  const verifiedSuccess = result === "success" || live?.status === "succeeded";
  const headline = HEADLINES[verifiedSuccess ? "success" : result] ?? HEADLINES.pending;

  // Belt-and-braces: clear the cart only when the server confirms the payment.
  useEffect(() => {
    if (verifiedSuccess && !cartCleared.current) {
      cartCleared.current = true;
      cart.clear();
    }
  }, [verifiedSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = verifiedSuccess || result === "placed" ? "success" : result === "pending" ? "pending" : "failure";

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-margin-mobile py-space-xl text-center lg:px-margin">
      <div
        className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
          tone === "success"
            ? "bg-secondary-fixed text-on-secondary-fixed"
            : tone === "pending"
              ? "bg-surface-container-high text-on-surface-variant"
              : "bg-error-container text-on-error-container"
        }`}
        aria-hidden
      >
        {tone === "success" ? (
          <IconBadgeCheck size={36} />
        ) : tone === "pending" ? (
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-on-surface-variant/25 border-t-on-surface-variant" />
        ) : (
          <IconShoppingBag size={32} />
        )}
      </div>

      <p className="text-label-sm font-bold uppercase tracking-widest text-secondary">Step 3 of 3 — Confirmation</p>
      <h1 className="mt-2 font-display text-headline-lg-mobile text-primary lg:text-headline-lg">{headline.title}</h1>
      {orderNumber && (
        <p className="mt-2 rounded-full bg-surface-container-high px-4 py-1 text-label-md text-on-surface-variant">
          Order <span className="font-bold text-on-surface">{orderNumber}</span>
        </p>
      )}
      <p className="mx-auto mt-4 max-w-md text-body-md leading-relaxed text-on-surface-variant">{headline.body}</p>

      {(result === "pending" || (live && !["succeeded", "failed"].includes(live.status))) && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-label-sm text-on-surface-variant">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary" aria-hidden />
          Checking with the gateway…
        </p>
      )}

      <div className="mt-space-lg flex flex-wrap justify-center gap-3">
        <Link href="/account/orders" className="btn-primary inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-label-lg">
          View my orders
          <IconArrowRight size={15} />
        </Link>
        <Link href="/shop" className="btn-outline inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-label-lg">
          Continue shopping
        </Link>
      </div>

      <p className="mt-space-md inline-flex items-center gap-1.5 text-body-sm text-on-surface-variant">
        <IconShieldCheck size={14} className="text-secondary" />
        Payment status is confirmed by our servers — never assumed from your browser.
      </p>
    </div>
  );
}

export default function CheckoutStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="py-space-xl text-center text-on-surface-variant">Loading…</div>
      }
    >
      <StatusInner />
    </Suspense>
  );
}
