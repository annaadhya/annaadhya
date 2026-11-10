import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/checkout-view";

/** Checkout is a private shopping intent — keep it out of search engines. */
export const metadata: Metadata = {
  title: "Complete Your Order",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
