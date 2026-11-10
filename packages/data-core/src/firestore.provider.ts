/**
 * Firestore DataClient — production implementation over the Firebase Admin SDK.
 *
 * Notes:
 *  - Epoch-millis integers are used for timestamps (set by the trusted backend). This keeps
 *    ordering deterministic and testable; the trade-off vs Firestore serverTimestamp() is
 *    documented in docs/firestore-schema.md.
 *  - Where clauses are restricted to the query patterns documented in
 *    docs/firestore-schema.md (composite indexes listed in firestore.indexes.json).
 *  - NO implicit ordering: `orderBy` is applied only when the caller states it. A hidden
 *    default (createdAt desc) used to silently turn every equality query into an
 *    "equality + orderBy" query, which Firestore can refuse without a matching composite
 *    index — a production-500 class of bug (admin order filters, order timeline/notes).
 *    Callers must now make ordering explicit and keep query shapes index-free (equality
 *    only, or orderBy on a filtered field), filtering larger sets in memory.
 *  - firebase-admin is an optional peer dependency: this module is imported lazily so
 *    mock-mode development never requires it.
 */
import type { BaseDoc } from "@annaadhya/contracts";
import { newId } from "@annaadhya/utils";
import type {
  CreateMeta,
  DataClient,
  QueryOptions,
  TransactionClient,
  WhereClause,
} from "./provider";
import { conflict } from "./errors";

type AnyDoc = Record<string, unknown> & BaseDoc;
type FxQuery = import("firebase-admin/firestore").Query;
type FxDocRef = import("firebase-admin/firestore").DocumentReference;
type FxDb = import("firebase-admin/firestore").Firestore;

export interface FirestoreCredentials {
  projectId: string;
  clientEmail: string;
  /** Raw PEM private key (supports literal \n escapes from environment variables). */
  privateKey: string;
  /** Optional named database (Firestore in Native mode supports multiple databases). */
  databaseId?: string;
}

export function parseFirestoreCredentials(env: {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIRESTORE_DATABASE_ID?: string;
}): FirestoreCredentials | null {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) return null;
  return {
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    databaseId: env.FIRESTORE_DATABASE_ID || undefined,
  };
}

let adminPromise: Promise<typeof import("firebase-admin")> | null = null;
let adminAppPromise: Promise<import("firebase-admin/app").App> | null = null;

/** Firestore instances already configured — `settings()` is allowed only once per instance. */
const configuredDbs = new WeakSet<FxDb>();

async function admin(): Promise<typeof import("firebase-admin")> {
  if (!adminPromise) adminPromise = import("firebase-admin");
  return adminPromise;
}

/**
 * Lazily creates (or returns) the shared Firebase Admin app named "annaadhya".
 *
 * data-core owns the app lifecycle so every consumer (the Firestore client below, and
 * Admin Auth verification in the API) resolves the same initialized app regardless of
 * which runs first. This ordering-independence is what cold serverless instances need:
 * the first request on a fresh instance may be an auth check, before any Firestore
 * query has ever run.
 */
export function getFirebaseAdminApp(creds: FirestoreCredentials): Promise<import("firebase-admin/app").App> {
  if (!adminAppPromise) {
    adminAppPromise = (async () => {
      const a = await admin();
      try {
        return a.app("annaadhya");
      } catch {
        try {
          return a.initializeApp(
            {
              credential: a.credential.cert({
                projectId: creds.projectId,
                clientEmail: creds.clientEmail,
                privateKey: creds.privateKey,
              }),
              projectId: creds.projectId,
            },
            "annaadhya",
          );
        } catch {
          // A concurrent caller won the initialization race — reuse its app.
          return a.app("annaadhya");
        }
      }
    })();
    // A failed init (e.g. transient bad input) must not poison the memo forever.
    void adminAppPromise.catch(() => {
      adminAppPromise = null;
    });
  }
  return adminAppPromise;
}

async function getDb(creds: FirestoreCredentials): Promise<FxDb> {
  const fs = await import("firebase-admin/firestore");
  const app = await getFirebaseAdminApp(creds);
  const db = creds.databaseId ? fs.getFirestore(app, creds.databaseId) : fs.getFirestore(app);
  // Firestore rejects documents containing `undefined` by default; our write paths treat
  // undefined as "field absent" (optional ranks, PATCH leave-unchanged). admin's
  // initializeFirestore() only forwards `preferRest`, so the flag must be applied on the
  // instance itself — exactly once, before its first operation.
  if (!configuredDbs.has(db)) {
    db.settings({ ignoreUndefinedProperties: true });
    configuredDbs.add(db);
  }
  return db;
}

export class FirestoreDataClient implements DataClient {
  readonly providerName = "firestore" as const;
  private db: FxDb | null = null;

  constructor(private readonly creds: FirestoreCredentials) {}

  private async col(col: string): Promise<FxQuery> {
    if (!this.db) this.db = await getDb(this.creds);
    return this.db.collection(col);
  }

  /* --------------------------------- reads -------------------------------- */

  async get<T>(col: string, id: string): Promise<T | null> {
    const c = await this.col(col);
    const snap = await (c as unknown as import("firebase-admin/firestore").CollectionReference).doc(id).get();
    return snap.exists ? ({ ...(snap.data() as T) }) : null;
  }

  async getMany<T>(col: string, ids: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    if (ids.length === 0) return out;
    const c = (await this.col(col)) as unknown as import("firebase-admin/firestore").CollectionReference;
    // Firestore `in` supports up to 30 values per query
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const snap = await c.where("__name__", "in", chunk.map((id) => c.doc(id))).get();
      snap.forEach((d) => out.set(d.id, { ...(d.data() as T) }));
    }
    return out;
  }

  async list<T>(col: string, opts: QueryOptions = {}): Promise<T[]> {
    let query = await this.col(col);
    for (const w of opts.where ?? []) {
      query = query.where(w.field, w.op, w.value);
    }
    // Explicit ordering only — see the class Notes. No hidden default: an un-ordered
    // query stays equality-only and is always servable by automatic single-field indexes.
    for (const ob of opts.orderBy ?? []) {
      query = query.orderBy(ob.field, ob.direction ?? "asc");
    }
    if (opts.offset) query = query.offset(opts.offset);
    if (opts.limit) query = query.limit(opts.limit);
    const snap = await query.get();
    const rows: T[] = [];
    snap.forEach((d) => rows.push({ ...(d.data() as T) }));
    return rows;
  }

  async count(col: string, where?: WhereClause[]): Promise<number> {
    let query = await this.col(col);
    for (const w of where ?? []) query = query.where(w.field, w.op, w.value);
    const snap = await query.count().get();
    return snap.data().count;
  }

  /* -------------------------------- writes -------------------------------- */

  async create<T extends object>(
    col: string,
    data: T,
    meta: CreateMeta = {},
  ): Promise<T & BaseDoc> {
    const id = meta.id ?? newId(col.slice(0, 3));
    return this.set(col, id, data, meta);
  }

  async set<T extends object>(
    col: string,
    id: string,
    data: T,
    meta: CreateMeta = {},
  ): Promise<T & BaseDoc> {
    const c = (await this.col(col)) as unknown as import("firebase-admin/firestore").CollectionReference;
    const ref = c.doc(id);
    const existing = await ref.get();
    const now = Date.now();
    const base = existing.exists ? (existing.data() as AnyDoc) : undefined;
    const doc: AnyDoc = {
      ...(data as Record<string, unknown>),
      id,
      createdAt: meta.createdAt ?? base?.createdAt ?? now,
      updatedAt: meta.updatedAt ?? now,
      isDemo: meta.isDemo ?? base?.isDemo ?? false,
    } as AnyDoc;
    if (meta.seedBatch) doc.seedBatch = meta.seedBatch;
    else if (base?.seedBatch) doc.seedBatch = base.seedBatch;
    await ref.set(doc, { merge: false });
    return { ...doc } as unknown as T & BaseDoc;
  }

  async update<T extends object>(col: string, id: string, patch: Partial<T>): Promise<T> {
    const c = (await this.col(col)) as unknown as import("firebase-admin/firestore").CollectionReference;
    const ref = c.doc(id);
    const existing = await ref.get();
    if (!existing.exists) throw conflict(`Document ${col}/${id} does not exist`);
    await ref.set({ ...(patch as Record<string, unknown>), updatedAt: Date.now() }, { merge: true });
    return { ...(existing.data() as T), ...patch } as T;
  }

  async delete(col: string, id: string): Promise<void> {
    const c = (await this.col(col)) as unknown as import("firebase-admin/firestore").CollectionReference;
    await c.doc(id).delete();
  }

  async bulkSet(col: string, docs: ({ id: string } & object)[]): Promise<void> {
    await admin();
    if (!this.db) this.db = await getDb(this.creds);
    const writer = this.db.bulkWriter();
    const now = Date.now();
    for (const d of docs) {
      const rec = d as { id: string } & Record<string, unknown>;
      const payload: AnyDoc = {
        ...rec,
        createdAt: (rec.createdAt as number) ?? now,
        updatedAt: (rec.updatedAt as number) ?? now,
      } as AnyDoc;
      writer.set(this.db.collection(col).doc(d.id), payload, { merge: false });
    }
    await writer.close();
  }

  async bulkDelete(col: string, ids: string[]): Promise<void> {
    await admin();
    if (!this.db) this.db = await getDb(this.creds);
    const writer = this.db.bulkWriter();
    for (const id of ids) writer.delete(this.db.collection(col).doc(id));
    await writer.close();
  }

  /* ------------------------------ transactions ----------------------------- */

  async runTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    await admin();
    if (!this.db) this.db = await getDb(this.creds);
    const db = this.db;
    const createdAt = Date.now();

    return db.runTransaction(async (fTx) => {
      const queued: { op: "set" | "update" | "delete"; ref: FxDocRef; data?: object }[] = [];
      const colRef = (col: string) => db.collection(col);

      const tx: TransactionClient = {
        get: async (col, id) => {
          const snap = await fTx.get(colRef(col).doc(id));
          return snap.exists ? ({ ...(snap.data() as object) } as never) : null;
        },
        update: (col, id, patch) => {
          queued.push({ op: "update", ref: colRef(col).doc(id), data: patch });
        },
        set: (col, id, data) => {
          queued.push({ op: "set", ref: colRef(col).doc(id), data });
        },
        create: (col, data) => {
          const ref = colRef(col).doc();
          queued.push({ op: "set", ref, data: { ...data, createdAt } });
          return ref.id;
        },
        delete: (col, id) => {
          queued.push({ op: "delete", ref: colRef(col).doc(id) });
        },
      };

      const result = await fn(tx);
      const now = Date.now();
      for (const q of queued) {
        if (q.op === "delete") fTx.delete(q.ref);
        else if (q.op === "set") fTx.set(q.ref, { ...(q.data as Record<string, unknown>), updatedAt: now }, { merge: false });
        else fTx.set(q.ref, { ...(q.data as Record<string, unknown>), updatedAt: now }, { merge: true });
      }
      return result;
    });
  }

  async stats(): Promise<{ provider: string; collections: Record<string, number> }> {
    await admin();
    if (!this.db) this.db = await getDb(this.creds);
    const collections: Record<string, number> = {};
    const snap = await this.db.listCollections();
    for (const c of snap) {
      collections[c.id] = await this.count(c.id);
    }
    return { provider: this.providerName, collections };
  }
}

// keep the FxQuery helper referenced for type clarity
export type { FxQuery };
