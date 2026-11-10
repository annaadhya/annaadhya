import AppShell from "@/components/app-shell";

/**
 * Guarded console shell — every page below requires a staff session (client-side guard,
 * re-verified server-side by the API on every request). Page titles are set per-page via
 * the usePageTitle() hook because the pages themselves are client components.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
