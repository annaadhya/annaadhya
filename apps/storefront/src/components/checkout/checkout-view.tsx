"use client";
/**
 * CheckoutView — the approved Stitch checkout design wired to the real flow:
 *
 *   cart (localStorage intent) → server quote (re-checked at pay time)
 *   → saved address (default preselected, token-scoped) OR validated new address
 *   → POST /checkout/orders  (server owns every rupee; stock reserved atomically)
 *   → provider dispatch:
 *       mock (dev only)  → POST /payments/mock/confirm → verified server-side
 *       razorpay         → checkout.js hosted flow → POST /payments/razorpay/verify
 *                          (HMAC order_id|payment_id verified on the server)
 *   → cart cleared ONLY after the server confirms the payment
 *   → /checkout/status?order=…&result=…&attemptId=… (polls the attempt)
 *
 * Honesty rules encoded here:
 *  - no guest purchase: placing an order requires an Annaadhya account (Google or
 *    email). Browsing, basket and wishlist stay open to everyone — the checkout
 *    gate only guards the paying step, and the basket survives the sign-in round-trip
 *  - no fabricated delivery dates, "verified PIN" badges, GST rows, coupons or
 *    calligraphy-note services — only what the backend actually computes
 *  - mock mode is labelled as demo mode; Razorpay copy appears only when Razorpay
 *    is the configured provider (platform-status)
 *  - the payable amount on the button is always the server quote's total
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { PUBLIC_API_URL } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { DELIVERY_COUNTRY, DELIVERY_COUNTRY_ERROR, isIndianCountry } from "@/lib/delivery-country";
import type { CustomerAddressShape } from "./checkout-types";
import { PaymentLogos } from "../payment-logos";
import {
  IconArrowRight,
  IconBadgeCheck,
  IconCheck,
  IconGift,
  IconMapPin,
  IconShieldCheck,
  IconShoppingBag,
  IconTruck,
} from "../icons";

interface Quote {
  quoteId: string;
  items: { variantId: string; qty: number; unitPricePaise: number; lineTotalPaise: number }[];
  subtotalPaise: number;
  discountTotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  unavailable: { variantId: string; reason: string }[];
}

interface PlatformStatus {
  mode: { payments: string };
  paymentsSandbox: boolean;
  codEnabled: boolean;
}

interface PublicShipping {
  mode: string;
  flatRatePaise: number;
  freeAbovePaise: number | null;
}

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

const EMPTY_FORM = {
  label: "Home",
  fullName: "",
  phone: "",
  email: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "Uttar Pradesh",
  pincode: "",
  country: DELIVERY_COUNTRY,
  saveToProfile: true,
  acceptTerms: false,
};

type FormState = typeof EMPTY_FORM;

/* ----------------------------- payment gateway ----------------------------- */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      /** Gateway lifecycle events — payment.failed is the standard failure signal. */
      on?: (event: "payment.failed", handler: (response: unknown) => void) => void;
    };
  }
}

/** Loads Razorpay's hosted checkout SDK on demand. This is the one external script
 *  in the storefront: the payment gateway itself (functionally required, PCI-scoped).
 *  It is only ever loaded when the backend reports Razorpay as the configured provider. */
function loadRazorpaySdk(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/* --------------------------------- helpers --------------------------------- */

function sameAddressContent(a: CustomerAddressShape, b: CustomerAddressShape): boolean {
  return (
    a.fullName.trim() === b.fullName.trim() &&
    a.phone.replace(/\D/g, "").slice(-10) === b.phone.replace(/\D/g, "").slice(-10) &&
    a.line1.trim() === b.line1.trim() &&
    (a.line2 ?? "").trim() === (b.line2 ?? "").trim() &&
    a.city.trim() === b.city.trim() &&
    a.pincode.trim() === b.pincode.trim()
  );
}

function validateAddress(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.fullName.trim().length < 1) errors.fullName = "Full name is required";
  if (!/^(\+91[\s-]?)?[6-9]\d{9}$/.test(form.phone.trim())) errors.phone = "Enter a valid 10-digit Indian mobile number";
  if (form.line1.trim().length < 3) errors.line1 = "Flat / house no. / building is required";
  if (form.city.trim().length < 2) errors.city = "City is required";
  if (form.state.trim().length < 2) errors.state = "State is required";
  if (!/^\d{6}$/.test(form.pincode.trim())) errors.pincode = "PIN code must be exactly 6 digits";
  if (!isIndianCountry(form.country)) errors.country = DELIVERY_COUNTRY_ERROR;
  return errors;
}

function toAddressPayload(form: FormState) {
  return {
    label: form.label,
    fullName: form.fullName.trim(),
    phone: form.phone.trim(),
    line1: form.line1.trim(),
    line2: form.line2.trim() || undefined,
    landmark: form.landmark.trim() || undefined,
    city: form.city.trim(),
    state: form.state.trim(),
    pincode: form.pincode.trim(),
    country: DELIVERY_COUNTRY,
  };
}

/* ------------------------- gift delivery ("someone else") ------------------------- */

const EMPTY_GIFT = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "Uttar Pradesh",
  pincode: "",
  country: DELIVERY_COUNTRY,
};
type GiftFormState = typeof EMPTY_GIFT;

const GIFT_MESSAGE_MAX = 250;

/** Field-level validation for the gift recipient form — mirrors the API's zod rules. */
function validateGift(gift: GiftFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (gift.fullName.trim().length < 1) errors.fullName = "Recipient's name is required";
  if (!/^(\+91[\s-]?)?[6-9]\d{9}$/.test(gift.phone.trim())) errors.phone = "Enter a valid 10-digit Indian mobile number";
  if (gift.line1.trim().length < 3) errors.line1 = "Flat / house no. / building is required";
  if (gift.city.trim().length < 2) errors.city = "City is required";
  if (gift.state.trim().length < 2) errors.state = "State is required";
  if (!/^\d{6}$/.test(gift.pincode.trim())) errors.pincode = "PIN code must be exactly 6 digits";
  if (!isIndianCountry(gift.country)) errors.country = DELIVERY_COUNTRY_ERROR;
  return errors;
}

function toGiftAddressPayload(gift: GiftFormState) {
  return {
    label: "Gift delivery",
    fullName: gift.fullName.trim(),
    phone: gift.phone.trim(),
    line1: gift.line1.trim(),
    line2: gift.line2.trim() || undefined,
    landmark: gift.landmark.trim() || undefined,
    city: gift.city.trim(),
    state: gift.state.trim(),
    pincode: gift.pincode.trim(),
    country: DELIVERY_COUNTRY,
  };
}

/* ------------------------------- the view ---------------------------------- */

export function CheckoutView() {
  const cart = useCart();
  const auth = useAuth();
  const router = useRouter();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [shipping, setShipping] = useState<PublicShipping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [paying, setPaying] = useState(false);
  const [payLabel, setPayLabel] = useState<string>("Preparing secure payment…");

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"gateway" | "cod">("gateway");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savingAddress, setSavingAddress] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Gift delivery — "Deliver to someone else": the purchaser pays from their own account
  // while the parcel ships to the recipient's address. The recipient never needs an
  // account and no OTP is involved (sign-in is Google/email only).
  const [giftMode, setGiftMode] = useState(false);
  const [gift, setGift] = useState<GiftFormState>(EMPTY_GIFT);
  const [giftErrors, setGiftErrors] = useState<Record<string, string>>({});
  const [giftMessage, setGiftMessage] = useState("");
  const [purchaserPhone, setPurchaserPhone] = useState("");

  const addresses = auth.customer?.addresses ?? [];
  const paymentsMode: "razorpay" | "mock" = platform?.mode.payments === "razorpay" ? "razorpay" : "mock";
  const codEnabled = platform?.codEnabled === true;

  /* -------- bootstrap: platform mode + shipping facts + prefill + quote -------- */
  useEffect(() => {
    fetch(`${PUBLIC_API_URL}/auth/platform-status`)
      .then((r) => r.json())
      .then((b: { ok: boolean; data?: PlatformStatus }) => setPlatform(b.ok ? (b.data ?? null) : null))
      .catch(() => setPlatform(null));
    // Same public settings the cart progress card and announcement strip read —
    // the shipping facts shown here can never drift from what checkout charges.
    fetch(`${PUBLIC_API_URL}/settings/public`)
      .then((r) => r.json())
      .then((b: { ok: boolean; data?: { shipping?: PublicShipping } }) => setShipping(b.ok ? (b.data?.shipping ?? null) : null))
      .catch(() => setShipping(null));
  }, []);

  // Prefill the new-address form from the profile (name/phone/email) once known.
  useEffect(() => {
    if (!auth.customer) return;
    setForm((f) => ({
      ...f,
      fullName: f.fullName || auth.customer?.displayName || "",
      phone: f.phone || auth.customer?.phone || "",
      email: f.email || auth.customer?.email || "",
    }));
    // The gift flow needs the PURCHASER's own contact number even when the address
    // form is never opened (profile phone may be empty — the field stays editable).
    setPurchaserPhone((p) => p || auth.customer?.phone || "");
  }, [auth.customer?.id, auth.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default-address auto-prefill: the designated default, else the profile's
  // defaultAddressId, else the first saved address (established fallback order).
  useEffect(() => {
    if (selectedAddressId || addresses.length === 0) return;
    const def =
      addresses.find((a) => a.isDefault) ??
      (auth.customer?.defaultAddressId
        ? addresses.find((a) => a.id === auth.customer!.defaultAddressId)
        : undefined) ??
      addresses[0];
    setSelectedAddressId(def.id);
  }, [addresses, selectedAddressId, auth.customer?.defaultAddressId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guests AND signed-in customers with an empty address book land on the open
  // delivery form — nobody should face an empty address card with no visible path.
  // The selectedAddressId guard keeps a just-saved address from re-opening the form.
  useEffect(() => {
    if (auth.loading) return;
    if ((!auth.customer || auth.customer.addresses.length === 0) && !selectedAddressId) setFormOpen(true);
  }, [auth.loading, auth.customer?.id, auth.customer?.addresses.length, selectedAddressId]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestQuote = useCallback(async (): Promise<Quote> => {
    const res = await fetch(`${PUBLIC_API_URL}/checkout/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: cart.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
        pincode: (giftMode ? gift.pincode : form.pincode) || undefined,
      }),
    });
    const body = (await res.json()) as { ok: boolean; data?: Quote; error?: { message: string } };
    if (!body.ok || !body.data) throw new Error(body.error?.message ?? "Could not price your basket");
    return body.data;
  }, [cart.items, form.pincode, giftMode, gift.pincode]);

  useEffect(() => {
    if (cart.ready && cart.items.length > 0 && !quote) {
      requestQuote()
        .then((q) => {
          setQuote(q);
          setPhase("ready");
        })
        .catch((e: Error) => {
          setError(e.message);
          setPhase("ready");
        });
    } else if (cart.ready && cart.items.length === 0) {
      setPhase("ready");
    }
  }, [cart.ready, cart.items.length, quote, requestQuote]);

  /* ------------------------------ address saving ----------------------------- */

  async function saveAddressToProfile(): Promise<CustomerAddressShape | null> {
    if (!auth.token || !auth.customer) return null;
    const payload = toAddressPayload(form);
    // Don't create duplicates — select the existing identical address instead.
    const existing = auth.customer.addresses.find((a) => sameAddressContent(a, { ...payload, id: "", isDefault: false }));
    if (existing) return existing;
    const res = await fetch(`${PUBLIC_API_URL}/customers/me/addresses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ ...payload, isDefault: auth.customer.addresses.length === 0 }),
    });
    const body = (await res.json()) as { ok: boolean; data?: { addresses: CustomerAddressShape[] }; error?: { message: string } };
    if (!body.ok || !body.data) throw new Error(body.error?.message ?? "Could not save the address");
    await auth.refreshProfile();
    const known = new Set(auth.customer.addresses.map((a) => a.id));
    const created = body.data.addresses.find((a) => !known.has(a.id)) ?? body.data.addresses[body.data.addresses.length - 1] ?? null;
    return created;
  }

  function openNewAddressForm() {
    setFormOpen(true);
    setFieldErrors({});
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function closeNewAddressForm() {
    setFormOpen(false);
    setFieldErrors({});
  }

  async function handleSaveAddressOnly() {
    const errors = validateAddress(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!auth.token) return; // guests cannot save; the checkbox is hidden for them
    setSavingAddress(true);
    setError(null);
    try {
      const saved = await saveAddressToProfile();
      if (saved) {
        setSelectedAddressId(saved.id);
        closeNewAddressForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the address");
    } finally {
      setSavingAddress(false);
    }
  }

  /* ------------------------------ the pay flow ------------------------------- */

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (paying || !quote) return;

    // Resolve the delivery destination: the gift recipient, a saved selection, or the open form.
    let addressPayload: ReturnType<typeof toAddressPayload> | null = null;
    if (giftMode) {
      const errors = validateGift(gift);
      setGiftErrors(errors);
      const purchaserPhoneOk = /^(\+91[\s-]?)?[6-9]\d{9}$/.test(purchaserPhone.trim());
      if (Object.keys(errors).length > 0 || !purchaserPhoneOk) {
        setError(
          purchaserPhoneOk
            ? "Please complete your gift recipient's name, phone and delivery address before paying."
            : "Add your own mobile number in the gift section — order and payment updates go to you, not the recipient.",
        );
        document.getElementById("gift-delivery-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    } else {
      const selected = addresses.find((a) => a.id === selectedAddressId);
      if (selected && !formOpen) {
        // India-only delivery applies to saved addresses too: a legacy book entry
        // (written before the country field existed) was Indian by construction, but
        // anything explicitly non-Indian is refused here — before any payment step.
        if (!isIndianCountry(selected.country)) {
          setError(DELIVERY_COUNTRY_ERROR);
          document.getElementById("delivery-address-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        addressPayload = {
          label: selected.label,
          fullName: selected.fullName,
          phone: selected.phone,
          line1: selected.line1,
          line2: selected.line2,
          landmark: selected.landmark,
          city: selected.city,
          state: selected.state,
          pincode: selected.pincode,
          country: DELIVERY_COUNTRY,
        };
      } else {
        const errors = validateAddress(form);
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
          setError("Please correct the highlighted delivery details before paying.");
          if (!formOpen) openNewAddressForm();
          return;
        }
        addressPayload = toAddressPayload(form);
      }
    }

    setPaying(true);
    setError(null);
    try {
      // Signed-in + "save to profile" checked: persist the address first so the
      // order's address and the profile's address are the same data. A failure here
      // stops checkout — we never silently drop the customer's own request.
      // Gift mode never saves anything to the purchaser's address book.
      if (!giftMode && auth.customer && auth.token && formOpen && form.saveToProfile) {
        setPayLabel("Saving your address…");
        const saved = await saveAddressToProfile();
        if (saved) setSelectedAddressId(saved.id);
      }

      // Server re-prices everything at pay time — the browser never sets amounts.
      const fresh = await requestQuote();
      setQuote(fresh);
      if (fresh.unavailable.length > 0) {
        const names = fresh.unavailable
          .map((u) => {
            const item = cart.items.find((i) => i.variantId === u.variantId);
            return item ? `${item.name} (${item.packLabel})` : "An item";
          })
          .join(", ");
        setError(`Some items need attention before payment: ${names}. Please review your basket.`);
        return;
      }

      // The purchaser's own identity stays the order contact in gift mode — the
      // recipient's details are delivery data only and never substitute the
      // account/payment identity (no OTP, no sign-in for the recipient).
      const purchaserName = (auth.customer?.displayName ?? auth.principal?.displayName ?? "").trim() || "Annaadhya customer";
      const purchaserEmail = (auth.customer?.email ?? "").trim();
      const purchaserPhoneTrimmed = purchaserPhone.trim();

      const orderPayload = giftMode
        ? {
            quoteId: fresh.quoteId,
            paymentMethod: payMethod,
            customer: { displayName: purchaserName, email: purchaserEmail, phone: purchaserPhoneTrimmed },
            acceptTerms: true,
            deliverToSomeoneElse: true,
            recipient: { fullName: gift.fullName.trim(), phone: gift.phone.trim() },
            recipientAddress: toGiftAddressPayload(gift),
            giftMessage: giftMessage.trim() || undefined,
          }
        : {
            quoteId: fresh.quoteId,
            paymentMethod: payMethod,
            customer: { displayName: addressPayload!.fullName, email: form.email.trim(), phone: addressPayload!.phone },
            address: addressPayload!,
            acceptTerms: true,
          };

      setPayLabel(payMethod === "cod" ? "Placing your COD order…" : paymentsMode === "razorpay" ? "Creating your secure order…" : "Placing your order…");
      const res = await fetch(`${PUBLIC_API_URL}/checkout/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}),
        },
        body: JSON.stringify(orderPayload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { order: { id: string; orderNumber: string }; payment: Record<string, unknown> | null };
        error?: { message: string };
      };
      if (!body.ok || !body.data) throw new Error(body.error?.message ?? "Order could not be created");

      const { order, payment } = body.data;
      const statusBase = `/checkout/status?order=${encodeURIComponent(order.orderNumber)}`;

      /* ---- COD: no gateway involved — the server confirms the order directly ---- */
      if (payMethod === "cod") {
        cart.clear(); // order confirmed pending payment-on-delivery — nothing to verify
        router.push(`${statusBase}&result=placed`);
        return;
      }

      /* ---- mock provider: development only; the server verifies & applies ---- */
      if (payment && (payment as { provider?: string }).provider === "mock") {
        setPayLabel("Confirming with the demo gateway…");
        const confirmRes = await fetch(`${PUBLIC_API_URL}/payments/mock/confirm`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId: (payment as { attemptId: string }).attemptId, outcome: "succeeded" }),
        });
        const confirmBody = (await confirmRes.json()) as { ok: boolean };
        if (confirmBody.ok) {
          cart.clear(); // verified server-side → safe to clear
          router.push(`${statusBase}&result=success&attemptId=${(payment as { attemptId: string }).attemptId}`);
        } else {
          router.push(`${statusBase}&result=pending&attemptId=${(payment as { attemptId: string }).attemptId}`);
        }
        return;
      }

      /* ---- razorpay: hosted checkout, then server-side signature verification ---- */
      if (payment && (payment as { provider?: string }).provider === "razorpay") {
        const p = payment as {
          keyId: string;
          providerOrderId: string;
          attemptId: string;
          amountPaise: number;
          currency: string;
        };
        setPayLabel("Opening the secure Razorpay window…");
        const loaded = await loadRazorpaySdk();
        if (!loaded) throw new Error("Could not reach the payment gateway. Check your connection and try again.");
        // Exactly one navigation out of the modal lifecycle: the first of success /
        // gateway-reported failure / user dismissal wins, the rest are ignored.
        let modalSettled = false;
        const rzp = new window.Razorpay!({
          key: p.keyId,
          order_id: p.providerOrderId,
          amount: p.amountPaise,
          currency: p.currency,
          name: "Annaadhya Products",
          description: "Pantry order payment",
          prefill: {
            name: purchaserName,
            contact: giftMode ? purchaserPhoneTrimmed : addressPayload!.phone,
            email: purchaserEmail || form.email.trim() || undefined,
          },
          theme: { color: "#541620" },
          handler: async (response: Record<string, string>) => {
            if (modalSettled) return;
            modalSettled = true;
            try {
              const verifyRes = await fetch(`${PUBLIC_API_URL}/payments/razorpay/verify`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ...response, attemptId: p.attemptId }),
              });
              const verifyBody = (await verifyRes.json()) as { ok: boolean; data?: { applied: boolean } };
              if (verifyBody.ok) {
                cart.clear(); // signature verified on the server → safe to clear
                router.push(`${statusBase}&result=success&attemptId=${p.attemptId}`);
              } else {
                router.push(`${statusBase}&result=pending&attemptId=${p.attemptId}`);
              }
            } catch {
              router.push(`${statusBase}&result=pending&attemptId=${p.attemptId}`);
            }
          },
          modal: {
            ondismiss: () => {
              // Cancelled is not failed and definitely not paid — cart is kept.
              if (modalSettled) return;
              modalSettled = true;
              router.push(`${statusBase}&result=cancelled&attemptId=${p.attemptId}`);
            },
          },
        });
        // Gateway-reported failure (declined card, bank timeout…). The browser cannot forge
        // server state — we only navigate to the honest failure screen; the attempt stays
        // pending server-side until a verified event or a retry decides the outcome. The
        // close that follows a failed payment also fires ondismiss — modalSettled guards it.
        rzp.on?.("payment.failed", () => {
          if (modalSettled) return;
          modalSettled = true;
          router.push(`${statusBase}&result=failure&attemptId=${p.attemptId}`);
        });
        rzp.open();
        return;
      }

      throw new Error("No payment provider is available for this order. Please contact support.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed — please try again.");
    } finally {
      setPaying(false);
      setPayLabel("Preparing secure payment…");
    }
  }

  /* --------------------------------- renders --------------------------------- */

  // Derived render data — computed unconditionally (rules of hooks): the early
  // returns below must never sit between this component's hooks.
  const showSavedAddresses = Boolean(auth.customer) && addresses.length > 0;
  const purchaserPhoneOk = /^(\+91[\s-]?)?[6-9]\d{9}$/.test(purchaserPhone.trim());
  const unavailableNames = useMemo(() => {
    if (!quote || quote.unavailable.length === 0) return [] as string[];
    return quote.unavailable.map((u) => {
      const item = cart.items.find((i) => i.variantId === u.variantId);
      return item ? `${item.name} · ${item.packLabel} — ${u.reason}` : u.reason;
    });
  }, [quote, cart.items]);
  const itemCount = cart.items.reduce((n, i) => n + i.qty, 0);

  // The checkout UI must not render while the auth session restore is in flight —
  // otherwise a signed-in customer briefly sees (and can act on) the guest variant:
  // "sign in to save addresses" prompts and orders that silently skip address saving.
  if (phase === "loading" || auth.loading) {
    return (
      <div className="mx-auto max-w-[1320px] px-margin-mobile py-space-xl lg:px-margin" aria-busy="true" aria-live="polite">
        <div className="mx-auto max-w-2xl py-16 text-center">
          <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-full bg-surface-container-high" />
          <div className="mx-auto h-7 w-64 animate-pulse rounded bg-surface-container-high" />
          <p className="mt-3 text-body-md text-on-surface-variant">Preparing secure checkout…</p>
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-margin-mobile py-space-xl text-center lg:px-margin">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <IconShoppingBag size={34} />
        </div>
        <h1 className="font-display text-headline-md text-primary">Your Basket is Currently Empty</h1>
        <p className="mb-8 mt-3 max-w-md text-body-md text-on-surface-variant">
          Your artisanal selection has cleared. Explore our heritage harvests to begin filling your pantry with
          purest honey, royal cashews, and Kashmiri saffron.
        </p>
        <Link href="/shop" className="btn-primary inline-flex items-center gap-2 rounded-lg px-8 py-3.5 text-label-lg shadow-md">
          Explore the Pantry
          <IconArrowRight size={17} />
        </Link>
      </div>
    );
  }

  // No guest purchase: an account (Google or email) is required to place an order.
  // Browsing stays open — this gate guards only the paying step, and the basket
  // survives the sign-in round-trip via ?next=/checkout.
  if (!auth.principal) {
    return <CheckoutSignInGate />;
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-margin-mobile py-space-lg lg:px-margin lg:py-space-xl">
      <header className="mb-space-lg lg:mb-space-xl">
        {/* ------------- header + stepper (approved design) ------------- */}
        <div className="flex flex-col justify-between gap-space-md border-b border-surface-container-high pb-space-md md:flex-row md:items-end">
          <div>
            <span className="mb-1 block text-label-sm uppercase tracking-widest text-secondary">
              Single-page Heritage Checkout
            </span>
            <h1 className="font-display text-headline-lg-mobile tracking-tight text-primary lg:text-headline-lg">
              Complete Your Order
            </h1>
            <p className="mt-1 text-body-lg text-on-surface-variant">Your favourites are almost home.</p>
          </div>
          <ol className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest px-5 py-3 shadow-sm sm:gap-4" aria-label="Checkout progress">
            <li className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed">
                <IconCheck size={15} />
              </span>
              <span className="hidden text-label-md font-medium text-secondary sm:inline">Cart</span>
            </li>
            <li aria-hidden className="h-0.5 w-6 bg-secondary-fixed sm:w-10" />
            <li className="flex items-center gap-2" aria-current="step">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-label-sm text-on-primary shadow-sm ring-4 ring-primary-fixed/40">
                2
              </span>
              <span className="text-label-md font-bold text-primary">Delivery &amp; Pay</span>
            </li>
            <li aria-hidden className="h-0.5 w-6 bg-surface-container-highest sm:w-10" />
            <li className="flex items-center gap-2 opacity-50">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-highest text-label-sm text-on-surface-variant">
                3
              </span>
              <span className="hidden text-label-md text-on-surface-variant sm:inline">Confirmation</span>
            </li>
          </ol>
        </div>
      </header>

      {/* ------------- error banner ------------- */}
      {(error || unavailableNames.length > 0) && (
        <div
          className="mb-space-lg flex items-start gap-3 rounded-xl bg-error-container p-4 text-on-error-container shadow-sm"
          role="alert"
        >
          <IconShieldCheck size={20} className="mt-0.5 shrink-0 text-on-error-container" />
          <div>
            <p className="text-label-lg font-semibold">
              {unavailableNames.length > 0 ? "Some items need attention" : "Something needs your attention"}
            </p>
            <p className="mt-0.5 text-body-sm">
              {unavailableNames.length > 0
                ? unavailableNames.join(" · ")
                : error}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handlePay} className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12 lg:gap-space-xl">
        {/* ================= LEFT: address + payment ================= */}
        <section className="flex flex-col gap-space-lg lg:col-span-7">
          {/* ---- Delivery address ---- */}
          <div id="delivery-address-card" className="rounded-2xl bg-surface-container-lowest p-space-md shadow-sm sm:p-space-lg">
            <div className="mb-space-md flex items-center justify-between gap-space-sm border-b border-surface-container-low pb-space-md">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-fixed text-primary">
                  <IconMapPin size={17} />
                </span>
                <div>
                  <h2 className="font-display text-headline-sm text-on-surface">Delivery Address</h2>
                  <p className="text-body-sm text-on-surface-variant">Where should we deliver your order?</p>
                </div>
              </div>
              {auth.customer && (
                <button
                  type="button"
                  onClick={() => (formOpen ? closeNewAddressForm() : openNewAddressForm())}
                  className="flex items-center gap-1 text-label-sm font-semibold text-primary transition-colors hover:text-primary-container"
                >
                  {formOpen ? "Cancel" : "+ Add New Address"}
                </button>
              )}
            </div>

            {/* Saved addresses (signed-in only) */}
            {giftMode && (
              <div className="mb-4 rounded-xl bg-tertiary-fixed/30 p-3.5 text-body-sm text-on-surface-variant">
                <strong className="text-on-surface">Gift mode is on.</strong> This order ships straight to your
                recipient — collect their address in the gift section below. Your own saved addresses stay saved
                and untouched, and nothing new is added to them.
              </div>
            )}
            {showSavedAddresses && (
              <div className="space-y-4" role="radiogroup" aria-label="Saved delivery addresses">
                {addresses.map((a) => {
                  const isSel = a.id === selectedAddressId && !formOpen;
                  return (
                    <div
                      key={a.id}
                      role="radio"
                      aria-checked={isSel}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedAddressId(a.id);
                          setFormOpen(false);
                        }
                      }}
                      onClick={() => {
                        setSelectedAddressId(a.id);
                        setFormOpen(false);
                      }}
                      className={`cursor-pointer rounded-xl p-5 transition-all ${
                        isSel
                          ? "bg-surface-container-lowest shadow-[0_0_0_1.5px_#702C35,0_8px_20px_-4px_rgba(112,44,53,0.12)]"
                          : "bg-surface-container-low hover:bg-surface-container"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-label-sm font-bold uppercase tracking-wider ${
                              a.isDefault ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-surface-container-highest text-on-surface-variant"
                            }`}
                          >
                            {a.isDefault ? `Default Address • ${a.label}` : a.label}
                          </span>
                          {isSel && (
                            <span className="inline-flex items-center gap-1 text-label-sm font-semibold text-secondary">
                              <IconCheck size={14} /> Selected
                            </span>
                          )}
                        </div>
                        {!isSel && (
                          <span className="text-label-sm font-semibold text-primary">Deliver Here</span>
                        )}
                      </div>
                      <p className="text-label-lg font-semibold text-on-surface">
                        {a.fullName}
                        <span className="ml-2 font-normal text-body-sm text-on-surface-variant">{a.phone}</span>
                      </p>
                      <p className="text-body-md text-on-surface-variant">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ""}
                      </p>
                      <p className="text-body-md text-on-surface-variant">
                        {a.city}, {a.state}, {a.country ?? "India"} — <span className="font-semibold text-on-surface">{a.pincode}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {!auth.customer && auth.principal && (
              <div className="mb-4 rounded-xl bg-surface-container p-4">
                <p className="text-body-sm text-on-surface-variant">
                  Your account is connected, but your saved address book couldn&apos;t be loaded right now — you can
                  still check out with the address below and the order will be linked to your account.
                </p>
              </div>
            )}

            {/* New / guest address form */}
            {formOpen && (
              <div ref={formRef} className="mt-space-md space-y-4 border-t border-surface-container-high pt-space-md">
                <h3 className="font-display text-headline-sm text-on-surface">
                  {auth.customer ? "Enter New Delivery Address" : "Delivery Details"}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ck-fullname" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Full Name *
                    </label>
                    <input
                      id="ck-fullname"
                      className="input-base"
                      autoComplete="name"
                      placeholder="e.g. Aarav Sharma"
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.fullName)}
                      aria-describedby={fieldErrors.fullName ? "ck-fullname-err" : undefined}
                    />
                    {fieldErrors.fullName && (
                      <p id="ck-fullname-err" className="mt-1 text-label-sm text-error">{fieldErrors.fullName}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="ck-phone" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Mobile Number *
                    </label>
                    <div className="relative flex">
                      <span className="inline-flex items-center rounded-l-lg border border-r-0 border-outline-variant bg-surface-container-high px-3 text-label-md text-on-surface">
                        +91
                      </span>
                      <input
                        id="ck-phone"
                        className="input-base rounded-l-none"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="10-digit mobile number"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+\s-]/g, "").trimStart() })}
                        aria-invalid={Boolean(fieldErrors.phone)}
                        aria-describedby={fieldErrors.phone ? "ck-phone-err" : undefined}
                      />
                    </div>
                    {fieldErrors.phone && (
                      <p id="ck-phone-err" className="mt-1 text-label-sm text-error">{fieldErrors.phone}</p>
                    )}
                  </div>
                </div>

                {!auth.customer && (
                  <div>
                    <label htmlFor="ck-email" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Email (for order updates)
                    </label>
                    <input
                      id="ck-email"
                      className="input-base"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ck-pincode" className="mb-1 block text-label-sm font-medium text-on-surface">
                      PIN Code (6 digits) *
                    </label>
                    <input
                      id="ck-pincode"
                      className="input-base text-tabular"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={6}
                      placeholder="560038"
                      value={form.pincode}
                      onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                      aria-invalid={Boolean(fieldErrors.pincode)}
                      aria-describedby={fieldErrors.pincode ? "ck-pincode-err" : undefined}
                    />
                    {fieldErrors.pincode ? (
                      <p id="ck-pincode-err" className="mt-1 text-label-sm text-error">{fieldErrors.pincode}</p>
                    ) : (
                      <p className="mt-1 text-label-sm text-on-surface-variant">Serviceability is confirmed at checkout.</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="ck-locality" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Locality / Sector / Area
                    </label>
                    <input
                      id="ck-locality"
                      className="input-base"
                      autoComplete="address-line2"
                      placeholder="e.g. Indiranagar, 12th Main"
                      value={form.line2}
                      onChange={(e) => setForm({ ...form, line2: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="ck-street" className="mb-1 block text-label-sm font-medium text-on-surface">
                    Flat, House No., Building, Apartment *
                  </label>
                  <input
                    id="ck-street"
                    className="input-base"
                    autoComplete="address-line1"
                    placeholder="e.g. Flat 402, Nilgiri Heights, 14th Cross"
                    value={form.line1}
                    onChange={(e) => setForm({ ...form, line1: e.target.value })}
                    aria-invalid={Boolean(fieldErrors.line1)}
                    aria-describedby={fieldErrors.line1 ? "ck-street-err" : undefined}
                  />
                  {fieldErrors.line1 && (
                    <p id="ck-street-err" className="mt-1 text-label-sm text-error">{fieldErrors.line1}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ck-landmark" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Landmark (Optional)
                    </label>
                    <input
                      id="ck-landmark"
                      className="input-base"
                      placeholder="e.g. Near the community club"
                      value={form.landmark}
                      onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="ck-city" className="mb-1 block text-label-sm font-medium text-on-surface">
                      City *
                    </label>
                    <input
                      id="ck-city"
                      className="input-base"
                      autoComplete="address-level2"
                      placeholder="e.g. Bengaluru"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      aria-invalid={Boolean(fieldErrors.city)}
                      aria-describedby={fieldErrors.city ? "ck-city-err" : undefined}
                    />
                    {fieldErrors.city && (
                      <p id="ck-city-err" className="mt-1 text-label-sm text-error">{fieldErrors.city}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ck-state" className="mb-1 block text-label-sm font-medium text-on-surface">
                      State *
                    </label>
                    <select
                      id="ck-state"
                      className="input-base"
                      autoComplete="address-level1"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                    >
                      {STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ck-country" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Country *
                    </label>
                    {/* India-only delivery: the select is pinned to India — the API
                        re-validates the final address server-side regardless. */}
                    <select
                      id="ck-country"
                      className="input-base"
                      autoComplete="country-name"
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    >
                      <option value={DELIVERY_COUNTRY}>India</option>
                    </select>
                    <p className="mt-1 text-label-sm text-on-surface-variant">
                      We currently deliver only within India — international delivery isn&apos;t available yet.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-label-sm font-medium text-on-surface">Address Label</span>
                    <div className="flex items-center gap-2" role="radiogroup" aria-label="Address label">
                      {["Home", "Work", "Other"].map((l) => (
                        <button
                          key={l}
                          type="button"
                          role="radio"
                          aria-checked={form.label === l}
                          onClick={() => setForm({ ...form, label: l })}
                          className={`flex-1 rounded-lg px-3 py-2 text-center text-label-sm transition-colors ${
                            form.label === l
                              ? "border border-primary bg-surface-container font-bold text-primary"
                              : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start justify-between gap-3 pt-2 sm:flex-row sm:items-center">
                  {auth.customer ? (
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={form.saveToProfile}
                        onChange={(e) => setForm({ ...form, saveToProfile: e.target.checked })}
                      />
                      <span className="text-body-sm text-on-surface">Save this address to my profile</span>
                    </label>
                  ) : (
                    <p className="text-body-sm text-on-surface-variant">
                      Your saved address book is unavailable right now — you can still check out with the address you
                      enter here.
                    </p>
                  )}
                  {auth.customer && (
                    <button
                      type="button"
                      onClick={() => void handleSaveAddressOnly()}
                      disabled={savingAddress}
                      className="rounded-lg bg-primary px-5 py-2 text-label-md text-on-primary shadow transition-colors hover:bg-primary-container disabled:opacity-55"
                    >
                      {savingAddress ? "Saving…" : "Save Address"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Real shipping facts from store settings — no invented dispatch promises.
              Rendered only when the API actually reports a flat-rate policy. */}
            {shipping?.mode === "flat_rate" ? (
              <div className="mt-space-md flex items-start gap-3 rounded-xl bg-surface-container p-3">
                <IconTruck size={20} className="mt-0.5 shrink-0 text-secondary" />
                <p className="text-body-sm text-on-surface">
                  <span className="font-semibold text-primary">Pan-India shipping:</span> flat{" "}
                  {formatINR(shipping.flatRatePaise, false)} per order
                  {shipping.freeAbovePaise && shipping.freeAbovePaise > 0
                    ? `, complimentary above ${formatINR(shipping.freeAbovePaise, false)}`
                    : ""}
                  . Serviceability for specific pincodes is confirmed at checkout.
                </p>
              </div>
            ) : null}
          </div>

          {/* ---- Gift delivery — optional "Deliver to someone else" ---- */}
          <div id="gift-delivery-card" className="rounded-2xl bg-surface-container-lowest p-space-md shadow-sm sm:p-space-lg">
            <div className="mb-space-md flex flex-wrap items-start justify-between gap-space-sm border-b border-surface-container-low pb-space-md">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant">
                  <IconGift size={17} />
                </span>
                <div>
                  <h2 className="font-display text-headline-sm text-on-surface">Deliver to someone else?</h2>
                  <p className="text-body-sm text-on-surface-variant">
                    Sending something special? Enter the recipient&apos;s details and we&apos;ll deliver the order to them.
                  </p>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={giftMode}
                  onChange={(e) => {
                    setGiftMode(e.target.checked);
                    setGiftErrors({});
                  }}
                />
                <span className="text-label-md font-semibold text-primary">{giftMode ? "Gift mode is on" : "Turn on gift mode"}</span>
              </label>
            </div>

            {!giftMode ? (
              <p className="text-body-sm text-on-surface-variant">
                Tick gift mode to ship this order straight to someone special — they&apos;ll never need an account
                and there&apos;s no OTP or sign-in for them. You still pay from your own account as usual.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Recipient identity */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="gift-fullname" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Recipient&apos;s Full Name *
                    </label>
                    <input
                      id="gift-fullname"
                      className="input-base"
                      placeholder="e.g. Meera Singh"
                      value={gift.fullName}
                      onChange={(e) => setGift({ ...gift, fullName: e.target.value })}
                      aria-invalid={Boolean(giftErrors.fullName)}
                      aria-describedby={giftErrors.fullName ? "gift-fullname-err" : undefined}
                    />
                    {giftErrors.fullName && (
                      <p id="gift-fullname-err" className="mt-1 text-label-sm text-error">{giftErrors.fullName}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="gift-phone" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Recipient&apos;s Mobile Number *
                    </label>
                    <div className="relative flex">
                      <span className="inline-flex items-center rounded-l-lg border border-r-0 border-outline-variant bg-surface-container-high px-3 text-label-md text-on-surface">
                        +91
                      </span>
                      <input
                        id="gift-phone"
                        className="input-base rounded-l-none"
                        type="tel"
                        inputMode="numeric"
                        placeholder="10-digit mobile number"
                        value={gift.phone}
                        onChange={(e) => setGift({ ...gift, phone: e.target.value.replace(/[^\d+\s-]/g, "").trimStart() })}
                        aria-invalid={Boolean(giftErrors.phone)}
                        aria-describedby={giftErrors.phone ? "gift-phone-err" : undefined}
                      />
                    </div>
                    {giftErrors.phone && (
                      <p id="gift-phone-err" className="mt-1 text-label-sm text-error">{giftErrors.phone}</p>
                    )}
                  </div>
                </div>
                <p className="-mt-1 text-body-sm text-on-surface-variant">
                  The recipient doesn&apos;t need an Annaadhya account — we only share these details with the
                  courier delivering the parcel.
                </p>

                {/* Recipient address */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="gift-pincode" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Recipient&apos;s PIN Code (6 digits) *
                    </label>
                    <input
                      id="gift-pincode"
                      className="input-base text-tabular"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="250002"
                      value={gift.pincode}
                      onChange={(e) => setGift({ ...gift, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                      aria-invalid={Boolean(giftErrors.pincode)}
                      aria-describedby={giftErrors.pincode ? "gift-pincode-err" : undefined}
                    />
                    {giftErrors.pincode && (
                      <p id="gift-pincode-err" className="mt-1 text-label-sm text-error">{giftErrors.pincode}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="gift-locality" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Locality / Sector / Area
                    </label>
                    <input
                      id="gift-locality"
                      className="input-base"
                      placeholder="e.g. Shastri Nagar"
                      value={gift.line2}
                      onChange={(e) => setGift({ ...gift, line2: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="gift-street" className="mb-1 block text-label-sm font-medium text-on-surface">
                    Flat, House No., Building, Apartment *
                  </label>
                  <input
                    id="gift-street"
                    className="input-base"
                    placeholder="e.g. House 22, Holi Adda Road"
                    value={gift.line1}
                    onChange={(e) => setGift({ ...gift, line1: e.target.value })}
                    aria-invalid={Boolean(giftErrors.line1)}
                    aria-describedby={giftErrors.line1 ? "gift-street-err" : undefined}
                  />
                  {giftErrors.line1 && (
                    <p id="gift-street-err" className="mt-1 text-label-sm text-error">{giftErrors.line1}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="gift-landmark" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Landmark (Optional)
                    </label>
                    <input
                      id="gift-landmark"
                      className="input-base"
                      placeholder="e.g. Near Ghanta Ghar"
                      value={gift.landmark}
                      onChange={(e) => setGift({ ...gift, landmark: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="gift-city" className="mb-1 block text-label-sm font-medium text-on-surface">
                        City *
                      </label>
                      <input
                        id="gift-city"
                        className="input-base"
                        placeholder="e.g. Meerut"
                        value={gift.city}
                        onChange={(e) => setGift({ ...gift, city: e.target.value })}
                        aria-invalid={Boolean(giftErrors.city)}
                        aria-describedby={giftErrors.city ? "gift-city-err" : undefined}
                      />
                      {giftErrors.city && (
                        <p id="gift-city-err" className="mt-1 text-label-sm text-error">{giftErrors.city}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="gift-state" className="mb-1 block text-label-sm font-medium text-on-surface">
                        State *
                      </label>
                      <select
                        id="gift-state"
                        className="input-base"
                        value={gift.state}
                        onChange={(e) => setGift({ ...gift, state: e.target.value })}
                      >
                        {STATES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* India-only delivery — gift destinations follow the same rule as the
                    purchaser's own address; the API re-validates the snapshot too. */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="gift-country" className="mb-1 block text-label-sm font-medium text-on-surface">
                      Country *
                    </label>
                    <select
                      id="gift-country"
                      className="input-base"
                      autoComplete="country-name"
                      value={gift.country}
                      onChange={(e) => setGift({ ...gift, country: e.target.value })}
                    >
                      <option value={DELIVERY_COUNTRY}>India</option>
                    </select>
                  </div>
                  <p className="self-end pb-2 text-body-sm text-on-surface-variant">
                    Gift delivery is available only within India right now.
                  </p>
                </div>

                {/* Gift message */}
                <div>
                  <label htmlFor="gift-message" className="mb-1 block text-label-sm font-medium text-on-surface">
                    Add a gift message (optional)
                  </label>
                  <textarea
                    id="gift-message"
                    className="input-base min-h-20"
                    rows={3}
                    maxLength={GIFT_MESSAGE_MAX}
                    placeholder="Write a short message for the recipient…"
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value.slice(0, GIFT_MESSAGE_MAX))}
                  />
                  <p className="mt-1 text-right text-label-sm text-on-surface-variant">
                    {giftMessage.length}/{GIFT_MESSAGE_MAX}
                  </p>
                </div>

                {/* Purchaser contact — order/payment updates go to the buyer, never the recipient */}
                <div className="rounded-xl bg-surface-container p-4">
                  <label htmlFor="gift-purchaser-phone" className="mb-1 block text-label-sm font-semibold text-on-surface">
                    Your mobile number (for order &amp; payment updates) *
                  </label>
                  <p className="mb-2.5 text-body-sm text-on-surface-variant">
                    Confirmation, payment receipts and tracking go to you — the recipient only meets the courier.
                  </p>
                  <div className="relative flex max-w-xs">
                    <span className="inline-flex items-center rounded-l-lg border border-r-0 border-outline-variant bg-surface-container-high px-3 text-label-md text-on-surface">
                      +91
                    </span>
                    <input
                      id="gift-purchaser-phone"
                      className="input-base rounded-l-none"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="10-digit mobile number"
                      value={purchaserPhone}
                      onChange={(e) => setPurchaserPhone(e.target.value.replace(/[^\d+\s-]/g, "").trimStart())}
                      aria-invalid={!purchaserPhoneOk && purchaserPhone.trim().length > 0}
                    />
                  </div>
                  {!purchaserPhoneOk && purchaserPhone.trim().length > 0 && (
                    <p className="mt-1 text-label-sm text-error">Enter a valid 10-digit Indian mobile number</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ---- Payment method ---- */}
          <div className="rounded-2xl bg-surface-container-lowest p-space-md shadow-sm sm:p-space-lg">
            <div className="mb-space-md flex items-center justify-between gap-space-sm border-b border-surface-container-low pb-space-md">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed">
                  <IconShieldCheck size={17} />
                </span>
                <div>
                  <h2 className="font-display text-headline-sm text-on-surface">Payment Method</h2>
                  <p className="text-body-sm text-on-surface-variant">
                    {paymentsMode === "razorpay" ? "Encrypted & powered by Razorpay" : "Demo mode — simulated gateway"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded bg-surface-container px-2.5 py-1 text-label-sm text-on-surface-variant">
                <IconBadgeCheck size={14} className="text-secondary" />
                <span>256-bit SSL</span>
              </div>
            </div>

            <div className="space-y-3.5" role="radiogroup" aria-label="Payment method">
              <div
                role="radio"
                aria-checked={payMethod === "gateway"}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPayMethod("gateway");
                  }
                }}
                onClick={() => setPayMethod("gateway")}
                className={`cursor-pointer rounded-xl transition-all ${
                  payMethod === "gateway"
                    ? "bg-surface-container-lowest shadow-[0_0_0_1.5px_#702C35,0_6px_16px_-2px_rgba(112,44,53,0.08)]"
                    : "bg-surface-container-lowest shadow-sm hover:shadow"
                }`}
              >
                <div className="flex items-start gap-4 p-4 sm:p-5">
                  <span
                    aria-hidden
                    className={`mt-1 h-4 w-4 rounded-full ${
                      payMethod === "gateway" ? "border-[5px] border-primary" : "border-2 border-outline"
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-label-lg font-bold text-on-surface">
                        {paymentsMode === "razorpay" ? "Pay Online (Recommended)" : "Demo Checkout"}
                      </span>
                      {paymentsMode === "razorpay" && (
                        <PaymentLogos className="max-w-full" />
                      )}
                    </div>
                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      {paymentsMode === "razorpay"
                        ? "UPI, cards, net banking and wallets — method selection happens on Razorpay's encrypted page after you continue."
                        : "This store runs on a simulated payment gateway right now — the order completes end-to-end but no real money moves. Razorpay activates automatically once API keys are configured."}
                    </p>
                  </div>
                </div>
              </div>

              {codEnabled && (
                <div
                  role="radio"
                  aria-checked={payMethod === "cod"}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPayMethod("cod");
                    }
                  }}
                  onClick={() => setPayMethod("cod")}
                  className={`cursor-pointer rounded-xl transition-all ${
                    payMethod === "cod"
                      ? "bg-surface-container-lowest shadow-[0_0_0_1.5px_#702C35,0_6px_16px_-2px_rgba(112,44,53,0.08)]"
                      : "bg-surface-container-lowest shadow-sm hover:shadow"
                  }`}
                >
                  <div className="flex items-start gap-4 p-4 sm:p-5">
                    <span
                      aria-hidden
                      className={`mt-1 h-4 w-4 rounded-full ${
                        payMethod === "cod" ? "border-[5px] border-primary" : "border-2 border-outline"
                      }`}
                    />
                    <div className="flex-1">
                      <span className="text-label-lg font-semibold text-on-surface">Cash on Delivery</span>
                      <p className="mt-0.5 text-body-sm text-on-surface-variant">
                        Pay when your pantry box arrives at your doorstep.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-space-md flex items-center gap-3 border-t border-surface-container pt-4 text-on-surface-variant">
              <IconShieldCheck size={19} className="shrink-0 text-primary" />
              <p className="text-body-sm">
                <strong className="text-on-surface">Guaranteed safe:</strong>{" "}
                {paymentsMode === "razorpay"
                  ? "Annaadhya never sees or stores card numbers, CVV or bank credentials — payment details are entered only on Razorpay's encrypted page, and every payment is verified on our servers before an order is confirmed."
                  : "No payment credentials are collected in demo mode, and order confirmation always happens through server-side verification."}
              </p>
            </div>
          </div>

          {/* ---- Primary action ---- */}
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-body-sm text-on-surface-variant">
              <input
                type="checkbox"
                required
                className="mt-1 h-4 w-4 accent-primary"
                checked={form.acceptTerms ?? false}
                onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
              />
              <span>
                I agree to the{" "}
                <Link href="/policies/terms" className="underline hover:text-primary">
                  Terms
                </Link>
                ,{" "}
                <Link href="/policies/returns" className="underline hover:text-primary">
                  returns &amp; refunds
                </Link>{" "}
                and{" "}
                <Link href="/policies/privacy" className="underline hover:text-primary">
                  privacy policy
                </Link>
                .
              </span>
            </label>
            <button
              type="submit"
              disabled={paying || !quote || quote.unavailable.length > 0}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-6 py-4 text-label-lg font-bold text-on-primary shadow-lg transition-all hover:bg-primary-container hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {paying ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary/40 border-t-on-primary"
                    aria-hidden
                  />
                  <span>{payLabel}</span>
                </>
              ) : (
                <>
                  <IconShieldCheck size={19} />
                  <span>
                    {payMethod === "cod"
                      ? "Place Order"
                      : paymentsMode === "razorpay"
                        ? "Proceed to Secure Payment"
                        : "Proceed to Place Order"}
                    {quote ? ` • ${formatINR(quote.totalPaise, false)}` : ""}
                  </span>
                  <IconArrowRight size={17} />
                </>
              )}
            </button>
            <p className="text-center text-body-sm text-on-surface-variant">
              Totals are calculated on our servers in integer paise — the browser never sets the price.
            </p>
          </div>
        </section>

        {/* ================= RIGHT: order summary ================= */}
        <aside className="w-full lg:sticky lg:top-24 lg:col-span-5">
          <div className="rounded-2xl bg-surface-container-lowest p-space-md shadow-[0_4px_20px_-2px_rgba(39,24,16,0.08)] sm:p-space-lg">
            <div className="mb-space-md flex items-center justify-between border-b border-surface-container-low pb-4">
              <div>
                <span className="block text-label-sm font-semibold uppercase tracking-widest text-secondary">
                  Artisanal Reserve
                </span>
                <h2 className="font-display text-headline-sm text-primary">Your Order ({itemCount} {itemCount === 1 ? "Item" : "Items"})</h2>
              </div>
              <Link
                href="/cart"
                className="flex items-center gap-1 text-label-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
              >
                Edit Basket
                <IconArrowRight size={14} />
              </Link>
            </div>

            <div className="mb-space-md space-y-4">
              {cart.items.map((i) => (
                <div key={i.variantId} className="flex items-center gap-4 border-b border-surface-container-low/60 pb-4 last:border-b-0 last:pb-0">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-container shadow-sm">
                    <img
                      src={i.image ?? "/demo-images/placeholder.svg"}
                      alt={i.name}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
                      {i.qty}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-label-lg text-on-surface">{i.name}</h3>
                    <p className="text-body-sm text-on-surface-variant">{i.packLabel}</p>
                    <p className="mt-0.5 text-xs text-secondary">
                      {formatINR(i.unitPricePaise, false)} × {i.qty}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-label-lg font-semibold text-on-surface text-tabular">
                      {formatINR(i.unitPricePaise * i.qty, false)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {giftMode && gift.fullName.trim() ? (
              <div className="mb-space-md rounded-xl bg-tertiary-fixed/40 p-4">
                <p className="text-label-sm font-bold uppercase tracking-widest text-on-tertiary-fixed-variant">
                  Gift delivery
                </p>
                <p className="mt-0.5 text-body-sm text-on-surface">
                  Shipping to <strong>{gift.fullName.trim()}</strong>
                  {gift.city.trim() ? ` — ${gift.city.trim()}` : ""}
                </p>
                {giftMessage.trim() ? (
                  <p className="mt-1 text-body-sm italic text-on-surface-variant">
                    &ldquo;{giftMessage.trim()}&rdquo;
                  </p>
                ) : null}
              </div>
            ) : null}

            {quote ? (
              <div className="mb-space-md space-y-2.5 rounded-xl bg-surface-container-low p-4">
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-on-surface-variant">Pantry Subtotal</span>
                  <span className="font-medium text-on-surface text-tabular">{formatINR(quote.subtotalPaise)}</span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-on-surface-variant">Shipping</span>
                  {quote.shippingPaise === 0 ? (
                    <span className="text-label-sm font-semibold uppercase text-secondary">FREE</span>
                  ) : (
                    <span className="font-medium text-on-surface text-tabular">{formatINR(quote.shippingPaise)}</span>
                  )}
                </div>
                <div className="flex items-baseline justify-between border-t border-outline-variant/60 pt-3">
                  <div>
                    <span className="block text-label-lg font-bold text-on-surface">Total Amount</span>
                    <span className="text-xs text-on-surface-variant">Payable now — taxes at checkout as applicable</span>
                  </div>
                  <span className="font-display text-[32px] font-bold leading-tight text-primary text-tabular">
                    {formatINR(quote.totalPaise, false)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mb-space-md animate-pulse space-y-2.5 rounded-xl bg-surface-container-low p-4" aria-label="Loading totals">
                <div className="h-4 w-3/4 rounded bg-surface-container-high" />
                <div className="h-4 w-1/2 rounded bg-surface-container-high" />
                <div className="h-8 w-1/3 rounded bg-surface-container-high" />
              </div>
            )}

            {/* Honest trust trio — same three real practices as the product page */}
            <div className="grid grid-cols-3 gap-2 border-t border-surface-container-low pt-2 text-center">
              <div className="flex flex-col items-center rounded-lg bg-surface-container-low p-2">
                <IconBadgeCheck size={19} className="mb-1 text-secondary" />
                <span className="text-[10px] font-bold uppercase leading-tight text-on-surface">Verified Listings</span>
              </div>
              <div className="flex flex-col items-center rounded-lg bg-surface-container-low p-2">
                <IconShieldCheck size={19} className="mb-1 text-primary" />
                <span className="text-[10px] font-bold uppercase leading-tight text-on-surface">Price Re-validated</span>
              </div>
              <div className="flex flex-col items-center rounded-lg bg-surface-container-low p-2">
                <IconTruck size={19} className="mb-1 text-secondary" />
                <span className="text-[10px] font-bold uppercase leading-tight text-on-surface">Pan-India Delivery</span>
              </div>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}

/* ------------------ sign-in gate — no guest purchase ----------------------- */
/**
 * Shown instead of the checkout form when no account session exists. Browsing stays
 * open to everyone; only the paying step requires an account (Google or email).
 * A successful Google sign-in right here swaps the gate for the checkout form —
 * the basket never left. Email users round-trip through /account/login?next=/checkout.
 */

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

function CheckoutSignInGate() {
  const auth = useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  function continueWithGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError(null);
    auth
      .signInGoogle()
      .catch((err: { code?: string; message?: string }) => {
        const code = err?.code ?? "";
        setGoogleError(
          code.includes("popup-closed")
            ? "The Google window closed before sign-in finished. Give it another go whenever you're ready."
            : code.includes("popup-blocked")
              ? "Your browser blocked the Google sign-in window. Allow popups for this site, or continue with email below."
              : code.includes("operation-not-allowed")
                ? "Google sign-in isn't enabled for this site yet — continue with email below."
                : code.includes("unauthorized-domain")
                  ? "This domain isn't authorised for Google sign-in in the Firebase console yet — continue with email below."
                  : err?.message || "Google sign-in failed just now. You can continue with email in the meantime.",
        );
      })
      .finally(() => setGoogleBusy(false));
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-margin-mobile py-space-lg lg:px-margin lg:py-space-xl" aria-live="polite">
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl bg-surface-container-lowest p-space-lg text-center shadow-sm sm:p-space-xl">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed text-primary">
          <IconShieldCheck size={28} />
        </span>
        <span className="text-label-sm font-bold uppercase tracking-widest text-secondary">Members-only checkout</span>
        <h1 className="mt-2 font-display text-headline-md tracking-tight text-primary">Sign in to place your order</h1>
        <p className="mt-3 max-w-md text-body-md text-on-surface-variant">
          Browsing the pantry is open to everyone — placing an order needs an Annaadhya account. Your basket is
          saved and will be waiting right here when you return.
        </p>

        {auth.mode === "firebase" ? (
          <>
            <button
              type="button"
              onClick={continueWithGoogle}
              disabled={googleBusy}
              className="mt-space-lg flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-surface-container-lowest text-[14px] font-semibold tracking-[0.04em] text-on-surface shadow-sm ring-1 ring-outline-variant transition hover:bg-surface-container-low active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <IconGoogle />
              {googleBusy ? "Authenticating with Google…" : "Continue with Google"}
            </button>
            {googleError && (
              <p className="mt-3 w-full rounded-lg bg-error-container px-4 py-2.5 text-body-sm text-on-error-container" role="alert">
                {googleError}
              </p>
            )}
            <div className="relative mt-space-lg flex w-full items-center justify-center" aria-hidden="true">
              <div className="h-px w-full bg-surface-container-highest" />
              <span className="absolute bg-surface-container-lowest px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                or
              </span>
            </div>
            <Link
              href="/account/login?next=/checkout"
              className="btn-primary mt-space-lg flex h-12 w-full items-center justify-center gap-2 rounded-lg px-space-lg text-label-lg shadow-md"
            >
              Continue with email
              <IconArrowRight size={17} />
            </Link>
          </>
        ) : (
          <>
            <p className="mt-space-lg w-full rounded-lg bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
              Demo build: Firebase isn&apos;t configured yet, so sign-in runs through the honest dev sign-in on the
              account page. Your basket stays saved either way.
            </p>
            <Link
              href="/account/login?next=/checkout"
              className="btn-primary mt-space-md flex h-12 w-full items-center justify-center gap-2 rounded-lg px-space-lg text-label-lg shadow-md"
            >
              Go to sign-in
              <IconArrowRight size={17} />
            </Link>
          </>
        )}

        <Link href="/cart" className="mt-space-lg text-label-md font-semibold text-primary underline underline-offset-2">
          Back to basket
        </Link>
      </div>
    </div>
  );
}
