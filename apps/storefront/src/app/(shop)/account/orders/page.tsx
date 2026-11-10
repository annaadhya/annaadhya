"use client";
/**
 * /account/orders — full order history (the real "View All Orders" destination).
 * Server-paginated via GET /orders/mine; same honest order cards as /account.
 * A confirmed empty result and a failed request render differently — never a
 * fake "no orders" for an error.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PUBLIC_API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { IconChevronLeft, IconChevronRight, IconRefresh, IconSprout } from "@/components/icons";
import { OrderCard } from "@/components/account/order-card";
import type { OrderRow } from "@/components/account/account-shared";

const PAGE_SIZE = 8;

export default function OrderHistoryPage() {
  const auth = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.principal) router.replace("/account/login?next=/account/orders");
  }, [auth.loading, auth.principal, router]);

  const load = useCallback(
    async (p: number) => {
      if (!auth.token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${PUBLIC_API_URL}/orders/mine?page=${p}&pageSize=${PAGE_SIZE}`, {
          headers: { authorization: `Bearer ${auth.token}` },
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: { items: OrderRow[]; total: number; totalPages: number };
          error?: { message: string };
        };
        if (!body.ok || !body.data) throw new Error(body.error?.message ?? "Could not load your orders");
        setOrders(body.data.items);
        setTotal(body.data.total);
        setTotalPages(Math.max(1, body.data.totalPages));
        setPage(p);
      } catch (e) {
        setOrders(null);
        setError(e instanceof Error ? e.message : "Could not load your orders");
      } finally {
        setLoading(false);
      }
    },
    [auth.token],
  );

  useEffect(() => {
    if (auth.principal && auth.token && orders === null && !loading && !error) void load(1);
  }, [auth.principal, auth.token, orders, loading, error, load]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  if (auth.loading || !auth.principal) {
    return (
      <div className="mx-auto w-full max-w-5xl animate-pulse px-margin-mobile py-space-xl lg:px-margin">
        <div className="h-4 w-40 rounded bg-surface-container-high" />
        <div className="mt-4 h-9 w-56 rounded bg-surface-container-high" />
        <div className="mt-space-lg space-y-space-md">
          <div className="h-36 rounded-xl bg-surface-container-low" />
          <div className="h-36 rounded-xl bg-surface-container-low" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-margin-mobile py-space-lg lg:px-margin lg:py-space-xl">
      <nav aria-label="Breadcrumb" className="mb-space-xs flex items-center gap-space-xs text-label-sm uppercase tracking-widest text-on-surface-variant">
        <Link href="/account" className="transition-colors hover:text-primary">
          My Account
        </Link>
        <span className="text-outline-variant">/</span>
        <span className="font-bold text-primary">Order History</span>
      </nav>
      <h1 className="font-display text-headline-lg font-semibold tracking-tight text-primary">Order History</h1>
      {total > 0 && (
        <p className="mt-space-xs text-body-md text-on-surface-variant">
          {total} order{total > 1 ? "s" : ""} placed with Annaadhya, most recent first.
        </p>
      )}

      <div className="mt-space-xl flex flex-col gap-space-lg">
        {loading ? (
          <div className="flex animate-pulse flex-col gap-space-lg" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-36 rounded-xl bg-surface-container-low" />
            ))}
            <span className="sr-only">Loading orders…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center rounded-xl bg-error-container/40 px-space-lg py-space-xl text-center">
            <div className="mb-space-md flex h-14 w-14 items-center justify-center rounded-full bg-error text-on-error shadow-md">
              <IconRefresh size={26} />
            </div>
            <h2 className="font-display text-headline-sm font-semibold text-on-error-container">Unable to Load Your Orders</h2>
            <p className="mb-space-lg mt-space-xs max-w-md text-body-sm text-on-surface-variant">{error}</p>
            <button type="button" className="btn-primary flex items-center gap-2 rounded-lg px-space-lg py-space-sm text-label-md font-semibold shadow-md" onClick={() => void load(page)}>
              <IconRefresh size={16} />
              Retry
            </button>
          </div>
        ) : orders !== null && orders.length === 0 ? (
          <div className="card-soft flex flex-col items-center justify-center px-space-lg py-16 text-center">
            <div className="mb-space-md flex h-20 w-20 items-center justify-center rounded-full bg-surface-container text-primary">
              <IconSprout size={34} />
            </div>
            <h2 className="font-display text-2xl font-semibold text-primary">No Orders Yet</h2>
            <p className="mb-space-lg mt-space-xs max-w-md text-body-md text-on-surface-variant">
              Your first jar of honey, tin of saffron or festive hamper will appear here once placed.
            </p>
            <Link href="/shop" className="btn-primary rounded-lg px-space-xl py-space-sm text-label-lg font-bold shadow-md">
              Explore Heritage Pantry
            </Link>
          </div>
        ) : (
          orders !== null && (
            <>
              {orders.map((o) => (
                <OrderCard key={o.id} order={o} onNotice={setNotice} />
              ))}
              {totalPages > 1 && (
                <nav aria-label="Order pages" className="mt-space-md flex items-center justify-center gap-space-md">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-sm border border-outline-variant px-space-md py-1.5 text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => void load(page - 1)}
                    disabled={page <= 1 || loading}
                  >
                    <IconChevronLeft size={15} />
                    Previous
                  </button>
                  <span className="text-label-md text-on-surface-variant text-tabular">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-sm border border-outline-variant px-space-md py-1.5 text-label-md text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => void load(page + 1)}
                    disabled={page >= totalPages || loading}
                  >
                    Next
                    <IconChevronRight size={15} />
                  </button>
                </nav>
              )}
            </>
          )
        )}
      </div>

      {notice && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 rounded-xl bg-inverse-surface px-space-lg py-space-md text-body-sm text-inverse-on-surface shadow-2xl">
          {notice}
        </div>
      )}
    </div>
  );
}
