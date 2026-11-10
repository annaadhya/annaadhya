"use client";
/**
 * /settings — global store settings. GET/POST /admin/settings (settings:write to save).
 * Money fields are typed in rupees and converted with Math.round(rupees*100) once, at save.
 * The sandboxMode toggle carries an explicit warning — it must stay on until the owner
 * explicitly approves launch.
 */
import { useEffect, useState } from "react";
import { ApiError, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatDateTime, paiseToRupeeInput, rupeesToPaise } from "@/lib/format";
import { useToast } from "@/lib/toast";
import type { PaymentProviderName, SettingsDoc } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";

interface FormState {
  storeName: string;
  legalName: string;
  supportEmail: string;
  supportPhone: string;
  addressLines: string; // one per line, max 5
  gstin: string;
  fssaiLicense: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  announcementEnabled: boolean;
  announcementMessage: string;
  announcementHref: string;

  shippingMode: SettingsDoc["shipping"]["mode"];
  flatRate: string; // rupees
  freeAbove: string; // rupees; "" = null
  estimateMin: string;
  estimateMax: string;
  pincodesNote: string;

  paymentProvider: PaymentProviderName;
  sandboxMode: boolean;
  codEnabled: boolean;
  upiNote: string;

  includeDemo: boolean;

  heroHeadline: string;
  heroHeadlineAccent: string;
  heroSubcopy: string;
  heroImage: string;
  heroCtaHref: string;
  heroCtaLabel: string;
  newsletterEnabled: boolean;
  giftCollectionEnabled: boolean;
}

function docToForm(doc: SettingsDoc): FormState {
  return {
    storeName: doc.store.name ?? "",
    legalName: doc.store.legalName ?? "",
    supportEmail: doc.store.supportEmail ?? "",
    supportPhone: doc.store.supportPhone ?? "",
    addressLines: (doc.store.addressLines ?? []).join("\n"),
    gstin: doc.store.gstin ?? "",
    fssaiLicense: doc.store.fssaiLicense ?? "",
    instagram: doc.store.socialLinks?.instagram ?? "",
    facebook: doc.store.socialLinks?.facebook ?? "",
    whatsapp: doc.store.socialLinks?.whatsapp ?? "",
    announcementEnabled: doc.store.announcement?.enabled ?? false,
    announcementMessage: doc.store.announcement?.message ?? "",
    announcementHref: doc.store.announcement?.href ?? "",

    shippingMode: doc.shipping.mode,
    flatRate: paiseToRupeeInput(doc.shipping.flatRatePaise ?? 0),
    freeAbove: doc.shipping.freeAbovePaise === null || doc.shipping.freeAbovePaise === undefined ? "" : paiseToRupeeInput(doc.shipping.freeAbovePaise),
    estimateMin: doc.shipping.deliveryEstimateDays?.[0]?.toString() ?? "",
    estimateMax: doc.shipping.deliveryEstimateDays?.[1]?.toString() ?? "",
    pincodesNote: doc.shipping.serviceablePincodesNote ?? "",

    paymentProvider: doc.payments.provider,
    sandboxMode: doc.payments.sandboxMode,
    codEnabled: doc.payments.codEnabled,
    upiNote: doc.payments.upiNote ?? "",

    includeDemo: doc.reporting.includeDemoDataByDefault,

    heroHeadline: doc.storefront.heroHeadline ?? "",
    heroHeadlineAccent: doc.storefront.heroHeadlineAccent ?? "",
    heroSubcopy: doc.storefront.heroSubcopy ?? "",
    heroImage: doc.storefront.heroImage ?? "",
    heroCtaHref: doc.storefront.heroCtaHref ?? "",
    heroCtaLabel: doc.storefront.heroCtaLabel ?? "",
    newsletterEnabled: doc.storefront.newsletterEnabled,
    giftCollectionEnabled: doc.storefront.giftCollectionEnabled,
  };
}

export default function SettingsPage() {
  usePageTitle("Settings");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "settings:write");

  const { data, loading, error, reload } = useApiQuery<SettingsDoc>(() => apiGet("/admin/settings"));
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data) {
      setForm(docToForm(data));
      setUpdatedAt(data.updatedAt);
    }
  }, [data]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);

    // Build a patch matching settingsUpdateSchema; only send fields that carry values.
    // The flat rate only CHARGES in flat-rate mode — in free-shipping/disabled mode an
    // empty field normalizes to 0 instead of blocking the save (that was the "switching
    // to Flat rate / Free shipping shows an error" bug: a blank field became NaN → null
    // → a cryptic server-side "Amount must be a number").
    const flatRatePaise = form.shippingMode === "flat_rate" || form.flatRate.trim() !== ""
      ? rupeesToPaise(form.flatRate)
      : 0;
    if (Number.isNaN(flatRatePaise) || flatRatePaise < 0) {
      setFormError("Flat rate is not a valid amount.");
      return;
    }
    let freeAbovePaise: number | null = null;
    if (form.freeAbove.trim() !== "") {
      freeAbovePaise = rupeesToPaise(form.freeAbove);
      if (Number.isNaN(freeAbovePaise) || freeAbovePaise < 0) {
        setFormError("Free-above threshold is not a valid amount.");
        return;
      }
    }
    const addressLines = form.addressLines
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 5);
    const deliveryEstimateDays =
      form.estimateMin.trim() !== "" && form.estimateMax.trim() !== ""
        ? [Number(form.estimateMin), Number(form.estimateMax)]
        : null;

    const patch = {
      store: {
        name: form.storeName.trim(),
        legalName: form.legalName.trim(),
        supportEmail: form.supportEmail.trim(),
        supportPhone: form.supportPhone.trim(),
        addressLines,
        gstin: form.gstin.trim() || undefined,
        fssaiLicense: form.fssaiLicense.trim() || undefined,
        socialLinks: {
          instagram: form.instagram.trim() || undefined,
          facebook: form.facebook.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
        },
        announcement: {
          enabled: form.announcementEnabled,
          message: form.announcementMessage.trim(),
          href: form.announcementHref.trim() || undefined,
        },
      },
      shipping: {
        mode: form.shippingMode,
        flatRatePaise,
        freeAbovePaise,
        deliveryEstimateDays,
        serviceablePincodesNote: form.pincodesNote.trim(),
      },
      payments: {
        provider: form.paymentProvider,
        sandboxMode: form.sandboxMode,
        codEnabled: form.codEnabled,
        upiNote: form.upiNote.trim() || undefined,
      },
      reporting: {
        includeDemoDataByDefault: form.includeDemo,
      },
      storefront: {
        heroHeadline: form.heroHeadline.trim(),
        heroHeadlineAccent: form.heroHeadlineAccent.trim(),
        heroSubcopy: form.heroSubcopy.trim(),
        heroImage: form.heroImage.trim() || undefined,
        heroCtaHref: form.heroCtaHref.trim(),
        heroCtaLabel: form.heroCtaLabel.trim() || undefined,
        newsletterEnabled: form.newsletterEnabled,
        giftCollectionEnabled: form.giftCollectionEnabled,
      },
    };

    setSaving(true);
    try {
      const saved = await apiPost<SettingsDoc>("/admin/settings", patch);
      setForm(docToForm(saved));
      setUpdatedAt(saved.updatedAt);
      toast.success(
        "Settings saved",
        "The storefront now picks these up within seconds (instant revalidation); without revalidation configured it takes up to ~2 minutes.",
      );
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || (data && !form)) {
    return (
      <Card>
        <TableSkeleton rows={8} cols={4} />
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <ErrorState message={error?.message ?? "Settings not available"} status={error?.status} onRetry={reload} />
      </Card>
    );
  }
  if (!form) return null;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Global configuration served to the storefront and the reporting engine."
        actions={
          updatedAt ? <span className="text-xs text-ink/45">Last updated {formatDateTime(updatedAt)}</span> : undefined
        }
      />

      <form onSubmit={save} className="space-y-6" noValidate>
        {formError ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {formError}
          </p>
        ) : null}

        <Card>
          <CardHeader title="Store details" subtitle="Shown in support contexts and legal footers" />
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Store name">
              <Input value={form.storeName} onChange={(e) => update("storeName", e.target.value)} maxLength={80} disabled={!canWrite} />
            </Field>
            <Field label="Legal name">
              <Input value={form.legalName} onChange={(e) => update("legalName", e.target.value)} maxLength={160} disabled={!canWrite} />
            </Field>
            <Field label="Support email">
              <Input type="email" value={form.supportEmail} onChange={(e) => update("supportEmail", e.target.value)} disabled={!canWrite} />
            </Field>
            <Field label="Support phone">
              <Input value={form.supportPhone} onChange={(e) => update("supportPhone", e.target.value)} maxLength={20} disabled={!canWrite} />
            </Field>
            <Field label="Address lines" className="md:col-span-2" hint="One per line, max 5 — shown only where the business chooses">
              <Textarea value={form.addressLines} onChange={(e) => update("addressLines", e.target.value)} rows={3} disabled={!canWrite} />
            </Field>
            <Field label="GSTIN" hint="Intentionally blank until the business supplies it">
              <Input value={form.gstin} onChange={(e) => update("gstin", e.target.value)} maxLength={24} disabled={!canWrite} />
            </Field>
            <Field label="FSSAI license">
              <Input value={form.fssaiLicense} onChange={(e) => update("fssaiLicense", e.target.value)} maxLength={80} disabled={!canWrite} />
            </Field>
            <Field label="Instagram URL">
              <Input value={form.instagram} onChange={(e) => update("instagram", e.target.value)} maxLength={200} disabled={!canWrite} />
            </Field>
            <Field label="Facebook URL">
              <Input value={form.facebook} onChange={(e) => update("facebook", e.target.value)} maxLength={200} disabled={!canWrite} />
            </Field>
            <Field label="WhatsApp URL">
              <Input value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} maxLength={200} disabled={!canWrite} />
            </Field>
            <div className="space-y-2">
              <Checkbox
                label="Announcement bar enabled"
                checked={form.announcementEnabled}
                onChange={(e) => update("announcementEnabled", e.target.checked)}
                disabled={!canWrite}
              />
              <Input
                value={form.announcementMessage}
                onChange={(e) => update("announcementMessage", e.target.value)}
                maxLength={160}
                placeholder="Announcement message"
                disabled={!canWrite || !form.announcementEnabled}
              />
              <Input
                value={form.announcementHref}
                onChange={(e) => update("announcementHref", e.target.value)}
                maxLength={200}
                placeholder="Optional link"
                disabled={!canWrite || !form.announcementEnabled}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Shipping" subtitle="Server-authoritative quote inputs — the browser never sets shipping prices" />
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Mode">
              <Select value={form.shippingMode} onChange={(e) => update("shippingMode", e.target.value as FormState["shippingMode"])} disabled={!canWrite}>
                <option value="flat_rate">Flat rate</option>
                <option value="free_shipping">Free shipping</option>
                <option value="disabled">Disabled</option>
              </Select>
            </Field>
            <Field
              label="Flat rate (₹)"
              hint={
                form.shippingMode === "flat_rate"
                  ? "Applied to every quote"
                  : "Only used in flat-rate mode — switching modes never charges this"
              }
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.flatRate}
                onChange={(e) => update("flatRate", e.target.value)}
                disabled={!canWrite || form.shippingMode !== "flat_rate"}
              />
            </Field>
            <Field
              label="Free above (₹)"
              hint={
                form.shippingMode === "flat_rate"
                  ? "Leave blank for no free-shipping threshold"
                  : "Only used in flat-rate mode"
              }
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.freeAbove}
                onChange={(e) => update("freeAbove", e.target.value)}
                disabled={!canWrite || form.shippingMode !== "flat_rate"}
              />
            </Field>
            <Field label="Delivery estimate (days)" hint="Two numbers, e.g. 3 and 7 — shown only when configured">
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  max="60"
                  value={form.estimateMin}
                  onChange={(e) => update("estimateMin", e.target.value)}
                  placeholder="min"
                  disabled={!canWrite}
                />
                <Input
                  type="number"
                  min="0"
                  max="60"
                  value={form.estimateMax}
                  onChange={(e) => update("estimateMax", e.target.value)}
                  placeholder="max"
                  disabled={!canWrite}
                />
              </div>
            </Field>
            <Field label="Serviceable pincodes note" className="md:col-span-2">
              <Textarea value={form.pincodesNote} onChange={(e) => update("pincodesNote", e.target.value)} rows={2} maxLength={240} disabled={!canWrite} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Payments" subtitle="Provider wiring for checkout" />
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Provider"
              hint="Checkout switches to Razorpay automatically once RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set in the API environment (Vercel). This selector records your preference — without the environment keys online payments stay closed."
            >
              <Select value={form.paymentProvider} onChange={(e) => update("paymentProvider", e.target.value as PaymentProviderName)} disabled={!canWrite}>
                <option value="mock">Demo / simulated (used when keys are absent)</option>
                <option value="razorpay">Razorpay</option>
              </Select>
            </Field>
            <Field label="UPI note">
              <Input value={form.upiNote} onChange={(e) => update("upiNote", e.target.value)} maxLength={160} disabled={!canWrite} />
            </Field>
            <div className="md:col-span-2 space-y-3">
              <div className="rounded-md border border-honey/50 bg-honey/10 p-3">
                <Checkbox
                  label="Sandbox mode"
                  description="⚠ Payments stay in sandbox until the owner explicitly approves launch. Disabling this is a launch decision, not a setting to fiddle with."
                  checked={form.sandboxMode}
                  onChange={(e) => update("sandboxMode", e.target.checked)}
                  disabled={!canWrite}
                />
              </div>
              <Checkbox
                label="Cash on delivery enabled"
                description="COD orders are created without a gateway attempt"
                checked={form.codEnabled}
                onChange={(e) => update("codEnabled", e.target.checked)}
                disabled={!canWrite}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Reporting" subtitle="What the metrics and exports include" />
          <CardBody>
            <Checkbox
              label="Include demo data by default"
              description="Off (recommended): live reporting excludes demo records. On: demo rows flow into dashboards and exports."
              checked={form.includeDemo}
              onChange={(e) => update("includeDemo", e.target.checked)}
              disabled={!canWrite}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Storefront" subtitle="Hero copy and feature flags — leave a hero field blank to keep the approved design default" />
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Hero headline — part 1 (dark)" hint="First line, dark serif. Blank = skipped">
              <Input value={form.heroHeadline} onChange={(e) => update("heroHeadline", e.target.value)} maxLength={120} disabled={!canWrite} />
            </Field>
            <Field
              label="Hero headline — part 2 (wine-red italic)"
              hint="Second line in the accent style. Blank = skipped; both blank = the approved design headline"
            >
              <Input value={form.heroHeadlineAccent} onChange={(e) => update("heroHeadlineAccent", e.target.value)} maxLength={120} disabled={!canWrite} />
            </Field>
            <Field label="Hero CTA link" hint="Blank = /shop">
              <Input value={form.heroCtaHref} onChange={(e) => update("heroCtaHref", e.target.value)} maxLength={200} disabled={!canWrite} />
            </Field>
            <Field label="Hero CTA label" hint="Blank = “Shop All Products”">
              <Input value={form.heroCtaLabel} onChange={(e) => update("heroCtaLabel", e.target.value)} maxLength={40} disabled={!canWrite} />
            </Field>
            <Field label="Hero image URL" hint="Self-hosted path (/images/…) or full URL. Blank = the approved hero photo">
              <Input value={form.heroImage} onChange={(e) => update("heroImage", e.target.value)} maxLength={600} disabled={!canWrite} />
            </Field>
            <Field label="Hero subcopy" className="md:col-span-2" hint="Blank = the approved design subcopy shows">
              <Textarea value={form.heroSubcopy} onChange={(e) => update("heroSubcopy", e.target.value)} rows={2} maxLength={240} disabled={!canWrite} />
            </Field>
            <div className="space-y-3">
              <Checkbox
                label="Newsletter enabled"
                description="Only when a compliant capture workflow exists"
                checked={form.newsletterEnabled}
                onChange={(e) => update("newsletterEnabled", e.target.checked)}
                disabled={!canWrite}
              />
              <Checkbox
                label="Gift collection enabled"
                checked={form.giftCollectionEnabled}
                onChange={(e) => update("giftCollectionEnabled", e.target.checked)}
                disabled={!canWrite}
              />
            </div>
          </CardBody>
        </Card>

        {canWrite ? (
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Save settings
            </Button>
          </div>
        ) : (
          <Card className="p-4 text-sm text-ink/70 sm:p-6">
            You have <strong>settings:read</strong> only — fields are read-only. Ask an owner for <strong>settings:write</strong> to make changes.
          </Card>
        )}
      </form>
    </div>
  );
}
