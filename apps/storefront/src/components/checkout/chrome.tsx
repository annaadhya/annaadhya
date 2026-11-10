/** Focused checkout chrome from the approved Stitch design: a calm single-purpose
 *  header (logo, return to cart, secure pill) and a minimal footer. No shop
 *  navigation — checkout keeps the customer on task. Server components. */
import Link from "next/link";
import { Logo } from "../logo";
import { IconArrowRight, IconShieldCheck, IconUser } from "../icons";
import { PaymentLogos } from "../payment-logos";

export function CheckoutHeader() {
  return (
    <header className="sticky top-0 z-40 w-full bg-surface/90 shadow-[0_1px_8px_rgba(39,24,16,0.06)] backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-margin-mobile lg:px-margin">
        <div className="flex items-center gap-space-md">
          <Logo />
          <Link
            href="/cart"
            className="hidden items-center gap-1.5 rounded-sm px-2 py-1.5 text-label-md text-on-surface-variant transition-colors hover:text-primary sm:flex"
          >
            <IconArrowRight size={15} className="rotate-180" />
            Return to Cart
          </Link>
        </div>

        <div className="flex items-center gap-space-md">
          <div className="hidden items-center gap-2 rounded-full bg-surface-container-high px-3 py-1.5 md:flex">
            <IconShieldCheck size={17} className="text-secondary" />
            <span className="text-label-sm uppercase tracking-wide text-on-surface-variant">
              Encrypted &amp; Secure Checkout
            </span>
          </div>
          <Link
            href="/account"
            aria-label="Your account"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity hover:opacity-90"
          >
            <IconUser size={16} />
          </Link>
        </div>
      </div>
      {/* Mobile return-to-cart row — the header link hides below sm */}
      <div className="border-t border-outline-variant/40 px-margin-mobile py-2 sm:hidden">
        <Link href="/cart" className="flex items-center gap-1.5 text-label-md text-on-surface-variant">
          <IconArrowRight size={14} className="rotate-180" />
          Return to Cart
        </Link>
      </div>
    </header>
  );
}

/** Minimal checkout footer. The payment-assurance pill only lists methods when the
 *  Razorpay gateway is actually the configured provider — never in mock mode. */
export function CheckoutFooter({ paymentsMode }: { paymentsMode: "razorpay" | "mock" | "unknown" }) {
  return (
    <footer className="w-full bg-surface-container-low py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-margin-mobile md:flex-row lg:px-margin">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <p className="text-body-sm text-on-surface-variant">© {new Date().getFullYear()} Annaadhya Products. All rights reserved.</p>
          <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6" aria-label="Policies">
            <Link href="/policies/privacy" className="text-label-sm text-on-surface-variant transition-colors hover:text-on-surface">
              Privacy Policy
            </Link>
            <Link href="/policies/terms" className="text-label-sm text-on-surface-variant transition-colors hover:text-on-surface">
              Terms of Service
            </Link>
            <Link href="/policies/shipping" className="text-label-sm text-on-surface-variant transition-colors hover:text-on-surface">
              Shipping &amp; Returns Policy
            </Link>
          </nav>
        </div>
        {paymentsMode === "razorpay" && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 rounded-full bg-surface-container px-3 py-1.5">
            <span className="flex items-center gap-1.5 whitespace-nowrap text-label-sm text-on-surface-variant">
              <IconShieldCheck size={15} className="text-secondary" />
              Payments secured by Razorpay
            </span>
            <PaymentLogos />
          </div>
        )}
      </div>
    </footer>
  );
}
