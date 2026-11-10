import type { Metadata } from "next";
import Link from "next/link";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import { AuthProvider } from "@/lib/auth";
import { HoneyBeeCursor } from "@/components/honey-bee-cursor";

// Self-hosted at build time (OFL licensed) — no runtime font CDN requests.
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Annaadhya Products — Honey, Dry Fruits & Kesar",
    template: "%s | Annaadhya Products",
  },
  description:
    "Premium-quality honey, dry fruits and kesar at reasonable prices. Packed for Indian homes with every claim verified before publication.",
  openGraph: {
    type: "website",
    siteName: "Annaadhya Products",
    title: "Annaadhya Products — Honey, Dry Fruits & Kesar",
    description: "Premium-quality honey, dry fruits and kesar at reasonable prices.",
  },
};

/** Root shell only — fonts + providers. Page chrome lives in the route groups:
 *  (shop) renders the full storefront header/footer for browsing surfaces;
 *  (checkout) renders the focused secure-checkout chrome from the approved
 *  Stitch design (logo + return-to-cart + secure pill, minimal footer). */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${jakarta.variable}`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>{children}</WishlistProvider>
          </CartProvider>
        </AuthProvider>
        {/* Global pointer companion — mounts once, renders nothing on touch
            devices or when reduced motion is preferred. */}
        <HoneyBeeCursor />
        <noscript>
          <p className="p-4 text-center text-sm">
            Some features need JavaScript. Browse our <Link href="/shop">catalogue</Link> anytime.
          </p>
        </noscript>
      </body>
    </html>
  );
}
