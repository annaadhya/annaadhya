"use client";
/**
 * AccountView — the approved Stitch account-home template wired to the real
 * application: shared AuthProvider session, the customer's actual profile and
 * address book (POST/PATCH/DELETE /customers/me/addresses), real order history
 * (GET /orders/mine) and the shared storefront chrome.
 *
 * Honesty rules encoded here:
 *  - every value renders from real data; nothing is invented (no patron tiers,
 *    no 2FA claims, no fabricated order states, no calligraphy services)
 *  - a "Verified" email badge renders only from the real Firebase
 *    emailVerified flag — mock sessions simply show no badge
 *  - a failed order request is an error with Retry, never a fake empty state
 *  - the concierge card shows the store's real support contacts from public
 *    settings, with an honest fallback when the API is unreachable
 *  - no mobile-number registration / OTP / verification exists anywhere: the
 *    optional contact number is an ordinary profile field, and sign-in is
 *    Google / email-password only
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PUBLIC_API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CustomerDoc } from "@/lib/types";
import {
  IconAlertTriangle,
  IconBadgeCheck,
  IconBriefcase,
  IconCalendar,
  IconCircleCheck,
  IconHouse,
  IconIdCard,
  IconLandmark,
  IconLayoutDashboard,
  IconLock,
  IconLogout,
  IconMail,
  IconPhone,
  IconPinDrop,
  IconPlus,
  IconRefresh,
  IconSprout,
  IconX,
} from "../icons";
import { AddressModal } from "./address-modal";
import { ProfileModal } from "./profile-modal";
import { DeleteAddressDialog } from "./delete-address-dialog";
import { OrderCard } from "./order-card";
import { formatPhoneIN, signInMethodLabel, type OrderRow } from "./account-shared";

export interface SupportContacts {
  email: string;
  phone: string;
}

type CustomerAddressT = CustomerDoc["addresses"][number];

export function AccountView({ support }: { support: SupportContacts | null }) {
  const auth = useAuth();
  const router = useRouter();

  /* ------------------------------- orders data ------------------------------ */
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [ordersTotal, setOrdersTotal] = useState<number | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!auth.token) return;
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const res = await fetch(`${PUBLIC_API_URL}/orders/mine?page=1&pageSize=4`, {
        headers: { authorization: `Bearer ${auth.token}` },
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: OrderRow[]; total: number };
        error?: { message: string };
      };
      if (!body.ok || !body.data) throw new Error(body.error?.message ?? "Could not load your orders");
      setOrders(body.data.items);
      setOrdersTotal(body.data.total);
    } catch (e) {
      setOrders(null);
      setOrdersTotal(null);
      setOrdersError(e instanceof Error ? e.message : "Could not load your orders");
    } finally {
      setOrdersLoading(false);
    }
  }, [auth.token]);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.principal) {
      router.replace("/account/login?next=/account");
      return;
    }
    if (auth.token && orders === null && !ordersLoading && !ordersError) void loadOrders();
  }, [auth.loading, auth.principal, auth.token, orders, ordersLoading, ordersError, loadOrders, router]);

  /* --------------------------------- modals --------------------------------- */
  const [profileOpen, setProfileOpen] = useState(false);
  const [addressModal, setAddressModal] = useState<{ open: boolean; address: CustomerAddressT | null }>({ open: false, address: null });
  const [deleteTarget, setDeleteTarget] = useState<CustomerAddressT | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const customer = auth.customer;
  const addresses = useMemo(() => {
    const list = [...(customer?.addresses ?? [])];
    list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return list;
  }, [customer?.addresses]);
  const showSkeletons = auth.loading || !auth.principal || !customer;
  const firstName = (customer?.displayName ?? auth.principal?.displayName ?? "friend").trim().split(/\s+/)[0];
  const initial = firstName.charAt(0).toUpperCase();
  const memberSince = customer?.createdAt
    ? new Date(customer.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;
  const hasPasswordProvider = (customer?.providers ?? []).includes("password");

  async function setDefaultAddress(a: CustomerAddressT) {
    if (!auth.token) return;
    try {
      const res = await fetch(`${PUBLIC_API_URL}/customers/me/addresses/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ ...a, isDefault: true }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!body.ok) throw new Error(body.error?.message ?? "Could not update the default address");
      await auth.refreshProfile();
      setNotice("Default delivery address updated.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update the default address");
    }
  }

  if (showSkeletons) return <AccountSkeleton />;

  async function removeAddress() {
    if (!deleteTarget || !auth.token) return;
    setDeleting(true);
    try {
      const res = await fetch(`${PUBLIC_API_URL}/customers/me/addresses/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${auth.token}` },
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!body.ok) throw new Error(body.error?.message ?? "Could not remove the address");
      await auth.refreshProfile();
      setNotice("Address removed from your address book.");
      setDeleteTarget(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not remove the address");
    } finally {
      setDeleting(false);
    }
  }
  async function sendPasswordReset() {
    const email = customer?.email ?? auth.principal?.email;
    if (!email) return;
    try {
      await auth.sendPasswordReset(email);
      setNotice(`We've sent a password-reset link to ${email}. It expires shortly — check your inbox.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't send the reset email right now.");
    }
  }

  async function requestDeletion() {
    if (!auth.token) return;
    setDeletionBusy(true);
    try {
      const res = await fetch(`${PUBLIC_API_URL}/auth/me`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${auth.token}` },
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      setNotice(
        body.ok
          ? "Deletion request received. Our team contacts every customer to confirm before anything is removed."
          : body.error?.message ?? "Couldn't record the request right now — please try again.",
      );
      setDeletionOpen(false);
    } catch {
      setNotice("Couldn't record the request right now — please try again.");
    } finally {
      setDeletionBusy(false);
    }
  }

  if (showSkeletons) return <AccountSkeleton />;

  return (
    <div className="mx-auto w-full max-w-7xl px-margin-mobile py-space-lg lg:px-margin lg:py-space-xl">
      <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />

      {/* Breadcrumb + editorial header */}
      <header className="mb-space-xl flex flex-col justify-between gap-space-lg md:flex-row md:items-end">
        <div className="max-w-2xl">
          <nav aria-label="Breadcrumb" className="mb-space-xs flex items-center gap-space-xs text-label-sm uppercase tracking-widest text-on-surface-variant">
            <Link href="/" className="transition-colors hover:text-primary">
              Home
            </Link>
            <span className="text-outline-variant">/</span>
            <span className="font-bold text-primary">My Account</span>
          </nav>
          <h1 className="font-display text-headline-lg font-semibold tracking-tight text-primary">My Account</h1>
          <p className="mt-space-xs text-body-md text-on-surface-variant">
            Your personal details, saved delivery addresses and order history in one serene sanctuary.
          </p>
        </div>
        <div className="flex min-w-[260px] items-center gap-space-md rounded-xl bg-surface-container-low p-space-md shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary shadow-sm">
            <span className="font-display text-headline-sm text-on-primary">{initial}</span>
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center gap-space-xs">
              <span className="text-body-md font-semibold text-primary">Namaste, {firstName}</span>
              {auth.emailVerified === true && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary-container px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-secondary-container">
                  <IconCircleCheck size={11} />
                  Verified
                </span>
              )}
            </div>
            <span className="truncate text-body-sm text-on-surface-variant">{customer?.email ?? auth.principal?.email ?? ""}</span>
            {memberSince && (
              <span className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-tertiary-container">
                <IconCalendar size={11} />
                Member since {memberSince}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-space-xl lg:grid-cols-12">
        {/* ------------------------- left: account nav ------------------------- */}
        <nav aria-label="Account sections" className="flex flex-col gap-space-lg lg:col-span-3">
          <div className="card-soft flex flex-col gap-space-xs p-space-sm">
            <button
              type="button"
              className="flex items-center justify-between rounded-lg bg-surface-container px-space-md py-space-sm text-left font-semibold text-primary shadow-sm"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <span className="flex items-center gap-space-sm">
                <IconLayoutDashboard size={19} />
                Overview
              </span>
              <span aria-hidden className="h-4 w-1.5 rounded-full bg-tertiary-container" />
            </button>
            <button
              type="button"
              className="flex items-center justify-between rounded-lg px-space-md py-space-sm text-left text-on-surface-variant transition-all hover:bg-surface-container-low hover:text-primary"
              onClick={() => setProfileOpen(true)}
            >
              <span className="flex items-center gap-space-sm">
                <IconIdCard size={19} />
                Personal Profile
              </span>
            </button>
            <a
              href="#addresses"
              className="flex items-center justify-between rounded-lg px-space-md py-space-sm text-on-surface-variant transition-all hover:bg-surface-container-low hover:text-primary"
            >
              <span className="flex items-center gap-space-sm">
                <IconPinDrop size={19} />
                Saved Addresses
              </span>
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm text-on-surface">{addresses.length}</span>
            </a>
            <Link
              href="/account/orders"
              className="flex items-center justify-between rounded-lg px-space-md py-space-sm text-on-surface-variant transition-all hover:bg-surface-container-low hover:text-primary"
            >
              <span className="flex items-center gap-space-sm">
                <IconLandmark size={19} />
                Order History
              </span>
              {ordersTotal !== null && (
                <span className="rounded-full bg-secondary-fixed px-2 py-0.5 font-bold text-label-sm text-on-secondary-fixed">{ordersTotal}</span>
              )}
            </Link>
            <div aria-hidden className="h-px w-full bg-outline-variant/30" />
            <button
              type="button"
              className="flex items-center gap-space-sm rounded-lg px-space-md py-space-sm text-left text-error transition-colors hover:bg-error-container/30"
              onClick={() => {
                void auth.signOut().then(() => router.push("/"));
              }}
            >
              <IconLogout size={19} />
              Sign Out
            </button>
          </div>

          {/* Concierge — real support contacts from store settings */}
          <div className="card-soft relative overflow-hidden p-space-lg">
            <div className="relative z-10">
              <div className="mb-space-sm flex h-8 w-8 items-center justify-center rounded-full bg-tertiary-container text-tertiary-fixed">
                <IconPhone size={17} />
              </div>
              <h4 className="font-display text-headline-sm font-semibold text-primary">Private Concierge</h4>
              <p className="mt-space-xs text-body-sm text-on-surface-variant">Need assistance with an order, gifting or delivery?</p>
              <div className="mt-space-md flex flex-col gap-1 text-body-sm">
                {support?.email ? (
                  <a href={`mailto:${support.email}`} className="flex items-center gap-1.5 font-semibold text-primary hover:underline">
                    <IconMail size={15} />
                    {support.email}
                  </a>
                ) : null}
                {support?.phone ? (
                  <a href={`tel:${support.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 font-medium text-on-surface hover:text-primary">
                    <IconPhone size={15} />
                    {support.phone}
                  </a>
                ) : (
                  <Link href="/contact" className="font-semibold text-primary hover:underline">
                    Write to us via the contact page
                  </Link>
                )}
              </div>
            </div>
            <div aria-hidden className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-primary/5" />
          </div>

          {/* Account controls — preserves the existing deletion-request feature */}
          <div className="card-soft p-space-md">
            <h4 className="text-label-md uppercase tracking-wider text-on-surface-variant">Account Controls</h4>
            <button
              type="button"
              className="mt-space-sm text-label-md text-error underline decoration-error/40 underline-offset-2 hover:decoration-error"
              onClick={() => setDeletionOpen(true)}
            >
              Request account deletion
            </button>
            <p className="mt-1 text-[11px] text-on-surface-variant">Completed after a verification step, per our privacy policy.</p>
          </div>
        </nav>

        {/* ------------------------- right: content ---------------------------- */}
        <section className="flex flex-col gap-space-xl lg:col-span-9">
          <div className="grid grid-cols-1 gap-space-lg md:grid-cols-2">
            {/* Personal profile card */}
            <div className="card-soft flex flex-col justify-between p-space-lg">
              <div>
                <div className="mb-space-md flex items-center justify-between rounded-lg bg-surface-container-low/40 p-space-sm">
                  <div className="flex items-center gap-space-xs text-primary">
                    <IconIdCard size={19} />
                    <h2 className="font-display text-headline-sm font-semibold">Personal Profile</h2>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg px-space-md py-1 font-semibold text-tertiary-container transition-colors hover:bg-surface-container"
                    onClick={() => setProfileOpen(true)}
                  >
                    Edit Profile
                  </button>
                </div>
                <dl className="space-y-space-md">
                  <div>
                    <dt className="block text-label-sm uppercase tracking-wider text-on-surface-variant">Full Name</dt>
                    <dd className="text-body-md font-medium text-on-surface">{customer?.displayName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="block text-label-sm uppercase tracking-wider text-on-surface-variant">Email Address</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-space-xs">
                      <span className="text-body-md text-on-surface">{customer?.email ?? auth.principal?.email ?? "—"}</span>
                      {auth.emailVerified === true && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary-container px-2 py-0.5 text-[11px] font-semibold text-on-secondary-container">
                          <IconCircleCheck size={12} />
                          Verified
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="block text-label-sm uppercase tracking-wider text-on-surface-variant">Contact Number</dt>
                    <dd className="text-body-md text-on-surface">{customer?.phone ? formatPhoneIN(customer.phone) : <span className="text-on-surface-variant">—</span>}</dd>
                  </div>
                  <div>
                    <dt className="block text-label-sm uppercase tracking-wider text-on-surface-variant">Sign-in Method</dt>
                    <dd className="text-body-md font-semibold text-primary">{signInMethodLabel(customer?.providers)}</dd>
                  </div>
                </dl>
              </div>
              <div className="mt-space-md flex items-center justify-between border-t border-outline-variant/30 pt-space-md">
                {hasPasswordProvider ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-label-sm text-on-surface-variant transition-colors hover:text-primary"
                    onClick={() => void sendPasswordReset()}
                  >
                    <IconLock size={15} />
                    Manage Password &amp; Security
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-label-sm text-on-surface-variant">
                    <IconLock size={15} />
                    Signed in with Google — password is managed by Google
                  </span>
                )}
              </div>
            </div>

            {/* Saved addresses card */}
            <div id="addresses" className="card-soft flex flex-col justify-between p-space-lg [scroll-margin-top:6rem]">
              <div>
                <div className="mb-space-md flex items-center justify-between rounded-lg bg-surface-container-low/40 p-space-sm">
                  <div className="flex items-center gap-space-xs text-primary">
                    <IconPinDrop size={19} />
                    <h2 className="font-display text-headline-sm font-semibold">Saved Addresses</h2>
                  </div>
                  <button
                    type="button"
                    className="btn-primary flex items-center gap-1 rounded-lg px-space-md py-1 text-label-md font-semibold shadow-sm"
                    onClick={() => setAddressModal({ open: true, address: null })}
                  >
                    <IconPlus size={14} />
                    New Address
                  </button>
                </div>

                {addresses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-space-xl text-center">
                    <div className="mb-space-md flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-tertiary-container">
                      <IconPinDrop size={26} />
                    </div>
                    <h3 className="font-display text-headline-sm font-semibold text-primary">No Saved Addresses Yet</h3>
                    <p className="mb-space-lg mt-space-xs max-w-xs text-body-sm text-on-surface-variant">
                      Add your delivery address for smooth dispatch of every pantry order.
                    </p>
                    <button
                      type="button"
                      className="btn-primary flex items-center gap-2 rounded-lg px-space-lg py-space-sm text-label-md font-semibold shadow-sm"
                      onClick={() => setAddressModal({ open: true, address: null })}
                    >
                      <IconPlus size={16} />
                      Add First Address
                    </button>
                  </div>
                ) : (
                  <div className="space-y-space-md">
                    {addresses.map((a) => (
                      <AddressCard
                        key={a.id}
                        address={a}
                        onEdit={() => setAddressModal({ open: true, address: a })}
                        onDelete={() => setDeleteTarget(a)}
                        onSetDefault={() => void setDefaultAddress(a)}
                      />
                    ))}
                  </div>
                )}
              </div>
              {addresses.length > 0 && (
                <div className="mt-space-sm pt-space-sm text-right">
                  <span className="text-[12px] text-on-surface-variant">
                    {addresses.length} delivery point{addresses.length > 1 ? "s" : ""} linked to your account
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Recent orders */}
          <div id="orders" className="card-soft flex flex-col gap-space-lg p-space-lg [scroll-margin-top:6rem]">
            <div className="flex flex-col justify-between gap-space-sm pb-space-sm sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-2xl font-semibold text-primary">Recent Orders</h2>
                <p className="mt-0.5 text-body-sm text-on-surface-variant">A chronicle of your pantry harvests and private reserves.</p>
              </div>
              {ordersTotal !== null && ordersTotal > 0 && (
                <Link href="/account/orders" className="inline-flex items-center gap-1 font-bold text-label-lg text-primary transition-colors hover:text-primary-container">
                  View All Orders ({ordersTotal})
                  <IconLandmark size={16} />
                </Link>
              )}
            </div>

            {ordersLoading ? (
              <OrderSkeletons />
            ) : ordersError ? (
              <div className="flex flex-col items-center rounded-xl bg-error-container/40 px-space-lg py-space-xl text-center">
                <div className="mb-space-md flex h-14 w-14 items-center justify-center rounded-full bg-error text-on-error shadow-md">
                  <IconRefresh size={26} />
                </div>
                <h3 className="font-display text-headline-sm font-semibold text-on-error-container">Unable to Load Your Orders</h3>
                <p className="mb-space-lg mt-space-xs max-w-md text-body-sm text-on-surface-variant">{ordersError}</p>
                <button type="button" className="btn-primary flex items-center gap-2 rounded-lg px-space-lg py-space-sm text-label-md font-semibold shadow-md" onClick={() => void loadOrders()}>
                  <IconRefresh size={16} />
                  Retry
                </button>
              </div>
            ) : orders !== null && orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-space-md flex h-20 w-20 items-center justify-center rounded-full bg-surface-container text-primary">
                  <IconSprout size={34} />
                </div>
                <h3 className="font-display text-2xl font-semibold text-primary">Your Orders Will Appear Here</h3>
                <p className="mb-space-lg mt-space-xs max-w-md text-body-md text-on-surface-variant">
                  You haven&apos;t begun your artisanal culinary journey yet. Explore our cold-pressed honeys, Kashmiri saffron and sun-dried dry fruits.
                </p>
                <Link href="/shop" className="btn-primary flex items-center gap-2 rounded-lg px-space-xl py-space-sm text-label-lg font-bold shadow-md">
                  Explore Heritage Pantry
                </Link>
              </div>
            ) : (
              orders !== null && (
                <div className="flex flex-col gap-space-lg">
                  {orders.map((o) => (
                    <OrderCard key={o.id} order={o} onNotice={setNotice} />
                  ))}
                </div>
              )
            )}
          </div>
        </section>
      </div>

      {/* Modals */}
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <AddressModal
        open={addressModal.open}
        address={addressModal.address}
        addresses={addresses}
        onClose={() => setAddressModal({ open: false, address: null })}
        onSaved={() => setNotice(addressModal.address === null ? "Address saved to your address book." : "Address updated.")}
      />
      <DeleteAddressDialog
        address={deleteTarget}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void removeAddress()}
      />

      {/* Account deletion request dialog (preserved feature) */}
      {deletionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-gutter-mobile backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deletion-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deletionBusy) setDeletionOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-surface p-space-lg shadow-2xl">
            <div className="flex items-start gap-space-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container">
                <IconAlertTriangle size={20} />
              </div>
              <div>
                <h3 id="deletion-title" className="font-display text-headline-sm font-semibold text-on-surface">
                  Request account deletion?
                </h3>
                <p className="mt-space-xs text-body-sm text-on-surface-variant">
                  We record your request and our team contacts you to confirm before anything is removed. Your order history stays intact until then.
                </p>
              </div>
            </div>
            <div className="mt-space-lg flex justify-end gap-space-sm">
              <button type="button" className="rounded-sm px-space-lg py-2 font-semibold text-on-surface-variant hover:text-primary" onClick={() => setDeletionOpen(false)} disabled={deletionBusy}>
                Cancel
              </button>
              <button type="button" className="rounded-sm bg-error px-space-lg py-2 font-semibold text-on-error transition-opacity hover:opacity-90" onClick={() => void requestDeletion()} disabled={deletionBusy}>
                {deletionBusy ? "Sending…" : "Request Deletion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ address card ------------------------------- */

function AddressCard({
  address: a,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: CustomerAddressT;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const LabelIcon = a.label === "Work" ? IconBriefcase : a.label === "Home" ? IconHouse : IconPinDrop;
  return (
    <div className={`rounded-xl p-space-md ${a.isDefault ? "bg-surface-container-low" : "bg-soft-cream shadow-sm"}`}>
      <div className="mb-space-xs flex items-center justify-between gap-space-sm">
        {a.isDefault ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-secondary">
            <LabelIcon size={12} />
            Default · {a.label}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            <LabelIcon size={12} />
            {a.label}
          </span>
        )}
        <div className="flex items-center gap-space-sm">
          {!a.isDefault && (
            <>
              <button type="button" className="text-[12px] font-semibold text-primary hover:underline" onClick={onSetDefault}>
                Set as Default
              </button>
              <span aria-hidden className="text-outline-variant">
                |
              </span>
            </>
          )}
          <button type="button" className="text-[12px] text-tertiary-container hover:underline" onClick={onEdit}>
            Edit
          </button>
          <span aria-hidden className="text-outline-variant">
            |
          </span>
          <button type="button" className="text-[12px] text-on-surface-variant transition-colors hover:text-error" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      <p className="text-body-sm font-semibold text-primary">
        {a.fullName} <span className="font-normal text-on-surface-variant">· {formatPhoneIN(a.phone)}</span>
      </p>
      <p className="mt-1 text-body-sm leading-relaxed text-on-surface">
        {a.line1}
        {a.line2 ? `, ${a.line2}` : ""}
        {a.landmark ? (
          <>
            <br />
            <span className="text-on-surface-variant">Landmark: {a.landmark}</span>
          </>
        ) : null}
        <br />
        {a.city}, {a.state} — {a.pincode}
      </p>
    </div>
  );
}

/* ------------------------------- notice banner ------------------------------ */

function NoticeBanner({ notice, onDismiss }: { notice: string | null; onDismiss: () => void }) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex w-[min(92vw,32rem)] -translate-x-1/2 items-center justify-between gap-space-md rounded-xl bg-inverse-surface px-space-lg py-space-md text-inverse-on-surface shadow-2xl"
    >
      <span className="flex items-center gap-space-sm text-body-sm">
        <IconBadgeCheck size={18} className="shrink-0 text-secondary-fixed" />
        {notice}
      </span>
      <button type="button" aria-label="Dismiss" className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10" onClick={onDismiss}>
        <IconX size={16} />
      </button>
    </div>
  );
}

/* --------------------------------- skeletons -------------------------------- */

function AccountSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse px-margin-mobile py-space-lg lg:px-margin lg:py-space-xl">
      <div className="mb-space-xl flex flex-col justify-between gap-space-lg md:flex-row md:items-end">
        <div className="max-w-2xl space-y-3">
          <div className="h-3 w-32 rounded bg-surface-container-high" />
          <div className="h-9 w-64 rounded bg-surface-container-high" />
          <div className="h-4 w-96 max-w-full rounded bg-surface-container" />
        </div>
        <div className="flex min-w-[260px] items-center gap-space-md rounded-xl bg-surface-container-low p-space-md">
          <div className="h-12 w-12 rounded-full bg-surface-container-high" />
          <div className="space-y-2">
            <div className="h-4 w-36 rounded bg-surface-container-high" />
            <div className="h-3 w-44 rounded bg-surface-container" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-space-xl lg:grid-cols-12">
        <div className="flex flex-col gap-space-lg lg:col-span-3">
          <div className="card-soft space-y-3 p-space-md">
            <div className="h-8 rounded-lg bg-surface-container" />
            <div className="h-8 rounded-lg bg-surface-container-low" />
            <div className="h-8 rounded-lg bg-surface-container-low" />
            <div className="h-8 rounded-lg bg-surface-container-low" />
          </div>
          <div className="card-soft h-44 p-space-lg" />
        </div>
        <div className="flex flex-col gap-space-xl lg:col-span-9">
          <div className="grid grid-cols-1 gap-space-lg md:grid-cols-2">
            <div className="card-soft space-y-4 p-space-lg">
              <div className="h-6 w-1/3 rounded bg-surface-container-high" />
              <div className="h-3 w-1/4 rounded bg-surface-container" />
              <div className="h-5 w-1/2 rounded bg-surface-container-high" />
              <div className="h-3 w-1/4 rounded bg-surface-container" />
              <div className="h-5 w-2/3 rounded bg-surface-container-high" />
            </div>
            <div className="card-soft space-y-4 p-space-lg">
              <div className="h-6 w-1/3 rounded bg-surface-container-high" />
              <div className="rounded-xl bg-surface-container-low p-space-md">
                <div className="h-4 w-1/4 rounded bg-surface-container-high" />
                <div className="mt-2 h-4 w-3/4 rounded bg-surface-container-high" />
                <div className="mt-2 h-3 w-1/2 rounded bg-surface-container" />
              </div>
              <div className="rounded-xl bg-surface-container-low p-space-md">
                <div className="h-4 w-1/4 rounded bg-surface-container-high" />
                <div className="mt-2 h-4 w-2/3 rounded bg-surface-container-high" />
              </div>
            </div>
          </div>
          <div className="card-soft space-y-6 p-space-lg">
            <div className="flex items-center justify-between">
              <div className="h-7 w-1/4 rounded bg-surface-container-high" />
              <div className="h-4 w-24 rounded bg-surface-container" />
            </div>
            <div className="h-32 rounded-xl bg-surface-container" />
            <div className="h-32 rounded-xl bg-surface-container" />
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderSkeletons() {
  return (
    <div className="flex animate-pulse flex-col gap-space-lg" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl bg-surface-container-low p-space-md">
          <div className="flex justify-between">
            <div className="h-4 w-40 rounded bg-surface-container-high" />
            <div className="h-5 w-28 rounded-full bg-surface-container-high" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-space-md md:grid-cols-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex items-center gap-space-md rounded-lg bg-soft-cream p-space-sm">
                <div className="h-16 w-16 rounded-lg bg-surface-container-high" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 rounded bg-surface-container-high" />
                  <div className="h-3 w-1/2 rounded bg-surface-container" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading orders…</span>
    </div>
  );
}
