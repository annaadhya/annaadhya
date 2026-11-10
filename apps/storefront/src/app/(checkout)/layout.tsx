import type { ReactNode } from "react";
import { getPlatformStatus } from "@/lib/api";
import { CheckoutHeader, CheckoutFooter } from "@/components/checkout/chrome";

/** Focused checkout chrome from the approved Stitch design — no shop navigation,
 *  no announcement bar. The payment-assurance pill reflects the real gateway mode. */
export default async function CheckoutLayout({ children }: { children: ReactNode }) {
  const status = await getPlatformStatus();
  const paymentsMode = status?.mode?.payments === "razorpay" ? "razorpay" : status ? "mock" : "unknown";

  return (
    <>
      <CheckoutHeader />
      <main className="flex-1">{children}</main>
      <CheckoutFooter paymentsMode={paymentsMode} />
    </>
  );
}
