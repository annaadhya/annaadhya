/**
 * In-memory DataClient — explicit mock mode for development and automated tests.
 *
 * NOT FOR PRODUCTION: `assertNotProduction()` hard-fails if constructed in production.
 * Implements the same semantics as the Firestore provider (including queued writes inside
 * transactions) so tests exercise the same code paths the production provider uses.
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
import { conflict, internal } from "./errors";

type AnyDoc = Record<string, unknown> & BaseDoc;

export class InMemoryDataClient implements DataClient {
  readonly providerName = "memory" as const;
  private store = new Map<string, Map<string, AnyDoc>>();
  private nextTxId = 1;

  constructor(private readonly env: { nodeEnv?: string } = {}) {
    if ((env.nodeEnv ?? process.env.NODE_ENV) === "production") {
      throw new Error(
        "InMemoryDataClient is mock mode and is never allowed in production. Configure Firebase credentials.",
      );
    }
  }

  /* ------------------------------- reads ------------------------------- */

  async get<T>(col: string, id: string): Promise<T | null> {
    const doc = this.col(col).get(id);
    return doc ? ({ ...doc } as T) : null;
  }

  async getMany<T>(col: string, ids: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    const c = this.col(col);
    for (const id of ids) {
      const doc = c.get(id);
      if (doc) out.set(id, { ...doc } as T);
    }
    return out;
  }

  async list<T>(col: string, opts: QueryOptions = {}): Promise<T[]> {
    let rows = [...this.col(col).values()];
    if (opts.where?.length) rows = rows.filter((r) => opts.where!.every((w) => matches(r, w)));
    // Parity with the Firestore provider: NO implicit ordering. When the caller omits
    // `orderBy`, insertion order is preserved (a stable no-op sort) — ordering must be
    // an explicit decision at every call site.
    const orderBy = opts.orderBy ?? [];
    if (orderBy.length > 0) {
      rows.sort((a, b) => {
        for (const ob of orderBy) {
          const dir = ob.direction === "asc" ? 1 : -1;
          const av = a[ob.field];
          const bv = b[ob.field];
          if (av === bv) continue;
          if (av === undefined || av === null) return 1; // nulls last regardless of direction
          if (bv === undefined || bv === null) return -1;
          const cmp =
            typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av).localeCompare(String(bv));
          return cmp * dir;
        }
        return 0;
      });
    }
    const offset = opts.offset ?? 0;
    const end = opts.limit !== undefined ? offset + opts.limit : undefined;
    return rows.slice(offset, end).map((r) => ({ ...r })) as T[];
  }

  async count(col: string, where?: WhereClause[]): Promise<number> {
    let rows = [...this.col(col).values()];
    if (where?.length) rows = rows.filter((r) => where.every((w) => matches(r, w)));
    return rows.length;
  }

  /* ------------------------------- writes ------------------------------ */

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
    const now = Date.now();
    const existing = this.col(col).get(id);
    const doc: AnyDoc = {
      ...(data as Record<string, unknown>),
      id,
      createdAt: meta.createdAt ?? existing?.createdAt ?? now,
      updatedAt: meta.updatedAt ?? now,
      isDemo: meta.isDemo ?? existing?.isDemo ?? false,
    } as AnyDoc;
    if (meta.seedBatch) doc.seedBatch = meta.seedBatch;
    else if (existing?.seedBatch) doc.seedBatch = existing.seedBatch;
    this.col(col).set(id, doc);
    return { ...doc } as unknown as T & BaseDoc;
  }

  async update<T extends object>(col: string, id: string, patch: Partial<T>): Promise<T> {
    const c = this.col(col);
    const existing = c.get(id);
    if (!existing) throw conflict(`Document ${col}/${id} does not exist`);
    const doc: AnyDoc = { ...existing, ...(patch as Record<string, unknown>), id, updatedAt: Date.now() };
    c.set(id, doc);
    return { ...doc } as unknown as T;
  }

  async delete(col: string, id: string): Promise<void> {
    this.col(col).delete(id);
  }

  async bulkSet(col: string, docs: ({ id: string } & object)[]): Promise<void> {
    const c = this.col(col);
    const now = Date.now();
    for (const d of docs) {
      const rec = d as { id: string } & Record<string, unknown>;
      const existing = c.get(d.id);
      c.set(d.id, {
        ...rec,
        createdAt: (rec.createdAt as number) ?? existing?.createdAt ?? now,
        updatedAt: (rec.updatedAt as number) ?? existing?.updatedAt ?? now,
      } as AnyDoc);
    }
  }

  async bulkDelete(col: string, ids: string[]): Promise<void> {
    const c = this.col(col);
    for (const id of ids) c.delete(id);
  }

  /* ----------------------------- transactions --------------------------- */

  async runTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    // Sequential execution + queued writes = read-your-writes, applied atomically at commit.
    const queued: { op: "set" | "update" | "delete"; col: string; id: string; data?: object }[] = [];
    const createdIds = new Map<string, string>();

    const tx: TransactionClient = {
      get: async (col, id) => {
        const pending = [...queued].reverse().find((q) => q.col === col && q.id === id);
        if (pending?.op === "delete") return null;
        if (pending?.op === "set") return { ...(pending.data as Record<string, unknown>), id } as never;
        const current = this.col(col).get(id);
        if (!current) return null;
        if (pending?.op === "update") return { ...current, ...(pending.data as Record<string, unknown>) } as never;
        return { ...current } as never;
      },
      update: (col, id, patch) => {
        queued.push({ op: "update", col, id, data: patch });
      },
      set: (col, id, data) => {
        queued.push({ op: "set", col, id, data });
      },
      create: (col, data) => {
        const id = newId(col.slice(0, 3));
        createdIds.set(`${col}/${id}`, id);
        queued.push({ op: "set", col, id, data: { ...data, createdAt: Date.now() } });
        return id;
      },
      delete: (col, id) => {
        queued.push({ op: "delete", col, id });
      },
    };

    const result = await fn(tx); // errors propagate — no writes applied on throw

    const now = Date.now();
    for (const q of queued) {
      const c = this.col(q.col);
      if (q.op === "delete") {
        c.delete(q.id);
      } else if (q.op === "set") {
        const existing = c.get(q.id);
        c.set(q.id, {
          ...(q.data as Record<string, unknown> | undefined),
          id: q.id,
          createdAt: existing?.createdAt ?? ((q.data as Record<string, unknown> | undefined)?.createdAt as number | undefined) ?? now,
          updatedAt: now,
        } as AnyDoc);
      } else if (q.op === "update") {
        const existing = c.get(q.id);
        if (!existing) throw internal(`Transaction update target missing: ${q.col}/${q.id}`);
        c.set(q.id, { ...existing, ...q.data, updatedAt: now });
      }
    }
    return result;
  }

  async stats(): Promise<{ provider: string; collections: Record<string, number> }> {
    const collections: Record<string, number> = {};
    for (const [name, c] of this.store) collections[name] = c.size;
    return { provider: this.providerName, collections };
  }

  /** Test helper: reset all data. */
  clear(): void {
    this.store.clear();
  }

  private col(col: string): Map<string, AnyDoc> {
    let c = this.store.get(col);
    if (!c) {
      c = new Map();
      this.store.set(col, c);
    }
    return c;
  }
}

function matches(doc: AnyDoc, w: WhereClause): boolean {
  const v = doc[w.field];
  switch (w.op) {
    case "==":
      return Array.isArray(w.value) ? (v as unknown[] | undefined) === w.value : v === w.value;
    case "in":
      return Array.isArray(w.value) && w.value.some((x) => deepEq(v, x));
    case "<":
      return compare(v, w.value) < 0;
    case "<=":
      return compare(v, w.value) <= 0;
    case ">":
      return compare(v, w.value) > 0;
    case ">=":
      return compare(v, w.value) >= 0;
    default:
      return false;
  }
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function deepEq(a: unknown, b: unknown): boolean {
  return a === b || (typeof a === "string" && typeof b === "string" && a === b);
}
