/**
 * Contact — storefront enquiry capture from the /contact page.
 *
 * Persistence IS the delivery workflow: there is no email provider configured
 * in this project (nothing to send with), so submissions are durably stored in
 * Firestore and surfaced to the owner through the existing admin audit log.
 * A success response therefore means exactly "received and stored" — nothing more.
 *
 * Idempotent by construction (same pattern as the newsletter module): the
 * document id is derived from (email, clientRef), where clientRef is generated
 * once per composed message in the browser. A network-timeout retry re-sends
 * the same clientRef and converges on the same document — a customer can never
 * accidentally file the same enquiry twice, and retries never erase the first
 * receipt.
 */
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  type AuthPrincipal,
  type ContactMessageDoc,
  type ContactMessageDto,
} from "@annaadhya/contracts";
import type { DataClient } from "@annaadhya/data-core";
import { DATA_CLIENT } from "../../data/data.module";
import { AuditService } from "../audit/audit.service";

/** Provider-injected fields the service must not write itself. */
type BaseDocFields = "id" | "createdAt" | "updatedAt" | "isDemo" | "seedBatch";

@Injectable()
export class ContactService {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    private readonly audit: AuditService,
  ) {}

  /** Deterministic id: same (email, clientRef) → same document, retries included. */
  private idFor(email: string, clientRef: string): string {
    return `cmsg_${createHash("sha256").update(`${email}\n${clientRef}`).digest("hex").slice(0, 24)}`;
  }

  async receive(
    dto: ContactMessageDto,
    principal?: AuthPrincipal | null,
  ): Promise<{ received: true; reference: string }> {
    const email = dto.email.trim().toLowerCase();
    const id = this.idFor(email, dto.clientRef);

    const doc: Omit<ContactMessageDoc, BaseDocFields> = {
      fullName: dto.fullName,
      email,
      enquiryType: dto.enquiryType,
      ...(dto.orderNumber ? { orderNumber: dto.orderNumber } : {}),
      ...(dto.subject ? { subject: dto.subject } : {}),
      message: dto.message,
      ...(principal?.uid ? { customerUid: principal.uid } : {}),
    };
    await this.data.set(COLLECTIONS.contactMessages, id, doc);

    // Owner visibility without a new admin surface: one audit entry per enquiry,
    // readable in the existing admin audit log. Only the reference and routing
    // type go into the log — message content and contact details stay in the doc.
    await this.audit.record({
      actor: { uid: principal?.uid ?? "contact-form", role: "system" },
      action: "contact.message_received",
      targetType: "contactMessage",
      targetId: id,
      summary: `Contact enquiry received (${dto.enquiryType}) — reference ${id}`,
      metadata: { reference: id, enquiryType: dto.enquiryType },
    });

    return { received: true, reference: id };
  }
}
