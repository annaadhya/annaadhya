import type { Metadata } from "next";
import { getPublicSettings } from "@/lib/api";
import { AccountView, type SupportContacts } from "@/components/account/account-view";

export const metadata: Metadata = {
  title: "My Account | Annaadhya Products",
  robots: { index: false, follow: false }, // private surface — keep out of search engines
};

/** Server shell: pulls the store's REAL support contacts (public settings) for the
 *  concierge card, then hands off to the client view for session-scoped data. */
export default async function AccountPage() {
  const settings = await getPublicSettings();
  // A `.example` address is the seeded placeholder — it must never reach the UI as
  // a real contact, otherwise the concierge card renders a mailto link that cannot
  // deliver. Same truth discipline as the contact page.
  const storeEmail = settings?.store.supportEmail?.trim() ?? "";
  const realEmail = storeEmail && !/\.example$/i.test(storeEmail) ? storeEmail : "";
  const support: SupportContacts | null = settings
    ? { email: realEmail, phone: settings.store.supportPhone }
    : null;
  return <AccountView support={support} />;
}
