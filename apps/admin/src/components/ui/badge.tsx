import type { ReactNode } from "react";
import { humanize } from "@/lib/format";

type Tone = "neutral" | "green" | "amber" | "red" | "honey";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  green: "bg-secondary-container text-on-secondary-container",
  amber: "bg-tertiary-fixed text-on-tertiary-fixed",
  red: "bg-error-container text-on-error-container",
  honey: "bg-tertiary-container text-on-tertiary-container",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

/** Consistent status colouring across orders / payments / products / accounts. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Tone = (() => {
    switch (status) {
      case "published":
      case "delivered":
      case "succeeded":
      case "active":
      case "received":
      case "completed":
        return "green";
      case "confirmed":
      case "processing":
      case "shipped":
      case "partially_received":
      case "ordered":
      case "initiated":
      case "pending":
        return "amber";
      case "cancelled":
      case "refunded":
      case "failed":
      case "suspended":
      case "archived":
        return "neutral";
      case "draft":
      case "created":
      case "pending_payment":
        return "neutral";
      default:
        return "honey";
    }
  })();
  return <Badge tone={tone}>{humanize(status)}</Badge>;
}
