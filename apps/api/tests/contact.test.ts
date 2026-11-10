/**
 * Contact message capture — the /contact form contract.
 *
 * Covers truthful persistence: every accepted submission is stored verbatim,
 * retries with the same clientRef converge on one document (idempotency the
 * storefront relies on after network timeouts), a signed-in sender gets their
 * uid attached, an audit entry is recorded for the owner, and invalid/routing
 * values never reach storage.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryDataClient, applySeed } from "@annaadhya/data-core";
import { COLLECTIONS, type AuthPrincipal, type ContactMessageDoc } from "@annaadhya/contracts";
import { AuditService } from "../src/modules/audit/audit.service";
import { ContactService } from "../src/modules/contact/contact.service";

process.env.NODE_ENV = "test";
process.env.DATA_PROVIDER = "memory";

let db: InMemoryDataClient;
let contact: ContactService;

const customer: AuthPrincipal = {
  uid: "cust-contact",
  email: "cust@test.dev",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};

function dto(overrides: Partial<Parameters<ContactService["receive"]>[0]> = {}) {
  return {
    clientRef: "ref-abc12345",
    fullName: "Aarav Sharma",
    email: "aarav@example.com",
    enquiryType: "Order Support" as const,
    orderNumber: "AN-2026-000002",
    subject: "Where is my parcel?",
    message: "My order was confirmed two days ago and I would like an update.",
    ...overrides,
  };
}

beforeAll(async () => {
  db = new InMemoryDataClient({ nodeEnv: "test" });
  await applySeed(db);
  contact = new ContactService(db, new AuditService(db));
});

describe("contact message capture", () => {
  it("stores a submission verbatim and returns the real reference", async () => {
    const res = await contact.receive(dto(), null);
    expect(res.received).toBe(true);
    expect(res.reference).toMatch(/^cmsg_[0-9a-f]{24}$/);

    const stored = await db.get<ContactMessageDoc>(COLLECTIONS.contactMessages, res.reference);
    expect(stored).toBeTruthy();
    expect(stored!.fullName).toBe("Aarav Sharma");
    expect(stored!.email).toBe("aarav@example.com");
    expect(stored!.enquiryType).toBe("Order Support");
    expect(stored!.orderNumber).toBe("AN-2026-000002");
    expect(stored!.message).toContain("two days ago");
    expect(stored!.createdAt).toBeGreaterThan(0);
  });

  it("is idempotent per (email, clientRef): a retry updates one document, never duplicates", async () => {
    const body = "Retried message with a distinct body for the idempotency check.";
    const first = await contact.receive(dto({ clientRef: "ref-retry-999", message: body }), null);
    const retry = await contact.receive(dto({ clientRef: "ref-retry-999", message: body }), null);
    expect(retry.reference).toBe(first.reference);

    const all = await db.list<ContactMessageDoc>(COLLECTIONS.contactMessages);
    const mine = all.filter((m) => m.message === body);
    expect(mine.length).toBe(1);
    expect(mine[0].id).toBe(first.reference);
  });

  it("a different message composition gets its own reference", async () => {
    const first = await contact.receive(dto({ clientRef: "ref-compose-a1" }), null);
    const second = await contact.receive(dto({ clientRef: "ref-compose-b2", subject: "Gifting question" }), null);
    expect(second.reference).not.toBe(first.reference);
  });

  it("attaches customerUid when the sender is signed in", async () => {
    const res = await contact.receive(dto({ clientRef: "ref-signed-in-1" }), customer);
    const stored = await db.get<ContactMessageDoc>(COLLECTIONS.contactMessages, res.reference);
    expect(stored!.customerUid).toBe("cust-contact");
  });

  it("records an audit entry the owner can see in the existing audit log", async () => {
    const res = await contact.receive(dto({ clientRef: "ref-audit-12345" }), null);
    const logs = await db.list<{ action: string; targetId?: string }>(COLLECTIONS.auditLogs);
    const entry = logs.find((l) => l.action === "contact.message_received" && l.targetId === res.reference);
    expect(entry).toBeTruthy();
  });

  it("keeps optional fields optional (no empty-string noise in the document)", async () => {
    const res = await contact.receive(
      dto({ clientRef: "ref-minimal-01", orderNumber: "", subject: "", enquiryType: "General Enquiry" }),
      null,
    );
    const stored = await db.get<ContactMessageDoc>(COLLECTIONS.contactMessages, res.reference);
    expect(stored!.orderNumber).toBeUndefined();
    expect(stored!.subject).toBeUndefined();
  });

  it("normalises the email to lowercase", async () => {
    const res = await contact.receive(dto({ clientRef: "ref-caps-test1", email: "Caps@Example.COM" }), null);
    const stored = await db.get<ContactMessageDoc>(COLLECTIONS.contactMessages, res.reference);
    expect(stored!.email).toBe("caps@example.com");
    expect(res.reference).toMatch(/^cmsg_/);
  });
});
