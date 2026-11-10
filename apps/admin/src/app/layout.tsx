import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";

/**
 * Root layout for the admin panel. The admin is a client-rendered console:
 * AuthProvider (session restore) + ToastProvider wrap the whole tree, and the
 * (dashboard) route group adds the guarded heritage shell.
 *
 * Heritage fonts (Playfair Display + Plus Jakarta Sans, self-hosted SIL OFL
 * latin variable subsets) load ONCE here so both /login and the authenticated
 * shell inherit them — next/font/local serves them basePath-safely and wires
 * the CSS variables used by .font-heritage-display / .font-heritage-sans in
 * globals.css.
 */
const playfair = localFont({
  src: [
    { path: "../fonts/playfair-display-latin-var.woff2", weight: "400 900", style: "normal" },
    { path: "../fonts/playfair-display-latin-var-italic.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-heritage-display",
  display: "swap",
});

const jakarta = localFont({
  src: "../fonts/plus-jakarta-sans-latin-var.woff2",
  weight: "200 800",
  variable: "--font-heritage-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Annaadhya Admin",
    template: "%s · Annaadhya Admin",
  },
  description: "Administration console for the Annaadhya Products storefront — products, orders, inventory, purchases, expenses, reports and team.",
  // favicon: src/app/icon.png (Next file convention — basePath-prefixed automatically)
};

export const viewport: Viewport = {
  themeColor: "#541620",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${jakarta.variable}`}>
      <body className="min-h-screen bg-surface text-on-surface antialiased">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
