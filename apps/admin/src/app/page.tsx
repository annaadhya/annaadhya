import { redirect } from "next/navigation";

/**
 * The admin root has no landing of its own — send people straight to the overview.
 * The (dashboard) guard takes over from there (client-side) and redirects to /login
 * when there is no staff session.
 */
export default function AdminRootPage() {
  redirect("/dashboard");
}
