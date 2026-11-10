/**
 * Newsletter — marketing email capture from the storefront.
 *
 * Idempotent by construction: every address maps to one deterministic document id,
 * so a duplicate subscribe can never create a second row (double-clicks, retries,
 * concurrent tabs all converge on the same document). Resubscribing a previously
 * unsubscribed address reactivates it and rewrites the full document, which also
 * drops any stale `unsubscribedAt` (data-core `set` is a full-document replace).
 */
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  type AuthPrincipal,
  type NewsletterSubscriberDoc,
  type NewsletterSubscribeDto,
} from "@annaadhya/contracts";
import type { DataClient } from "@annaadhya/data-core";
import { DATA_CLIENT } from "../../data/data.module";

@Injectable()
export class NewsletterService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  private idFor(email: string): string {
    return `nls_${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
  }

  async subscribe(
    dto: NewsletterSubscribeDto,
    principal?: AuthPrincipal | null,
  ): Promise<{ subscribed: true; alreadySubscribed: boolean }> {
    const email = dto.email.trim().toLowerCase();
    const id = this.idFor(email);
    const source = dto.source?.trim() || "api";

    const existing = await this.data.get<NewsletterSubscriberDoc>(COLLECTIONS.newsletterSubscribers, id);
    if (existing?.status === "active") {
      return { subscribed: true, alreadySubscribed: true };
    }

    await this.data.set(COLLECTIONS.newsletterSubscribers, id, {
      email,
      status: "active" as const,
      source,
      ...(principal?.uid ? { customerUid: principal.uid } : {}),
    });
    // `existing` present means the address was unsubscribed and is now reactivated.
    return { subscribed: true, alreadySubscribed: false };
  }
}
