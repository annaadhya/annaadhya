import type { Metadata } from "next";

/**
 * Login route layout: document title only.
 *
 * The heritage fonts (Playfair Display / Plus Jakarta Sans) load once in the
 * ROOT layout (src/app/layout.tsx), so /login and the console shell share the
 * same next/font/local instances — no duplicate font initialization here.
 */
export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
