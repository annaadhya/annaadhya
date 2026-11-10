/** Inventory, suppliers, purchases, expenses, dashboard, reports, media, team, settings, audit controllers. */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  ORDER_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  customerListQuerySchema,
  customerNoteUpdateSchema,
  expenseListQuerySchema,
  expenseUpsertSchema,
  inventoryLedgerQuerySchema,
  inventoryThresholdsSchema,
  lowStockQuerySchema,
  mediaRegisterSchema,
  mediaSignatureSchema,
  purchaseCancelSchema,
  purchaseLedgerQuerySchema,
  purchasePaymentSchema,
  purchaseReceiveSchema,
  purchaseUpsertSchema,
  stockAdjustmentSchema,
  stockMovementSchema,
  supplierLedgerQuerySchema,
  supplierStatusSchema,
  supplierUpsertSchema,
  teamInviteSchema,
  teamRoleUpdateSchema,
  teamStatusUpdateSchema,
  settingsUpdateSchema,
  type AuthPrincipal,
  type CategoryUpsertDto,
  type CustomerListQueryDto,
  type CustomerNoteUpdateDto,
  type ExpenseListQueryDto,
  type ExpenseUpsertDto,
  type InventoryLedgerQueryDto,
  type InventoryThresholdsDto,
  type LowStockQueryDto,
  type MediaRegisterDto,
  type MediaSignatureDto,
  type OrderStatus,
  type PaymentProviderName,
  type PaymentStatus,
  type PurchaseCancelDto,
  type PurchaseLedgerQueryDto,
  type PurchasePaymentDto,
  type PurchaseReceiveDto,
  type PurchaseUpsertDto,
  type SettingsUpdateDto,
  type StockAdjustmentDto,
  type StockMovementDto,
  type SupplierLedgerQueryDto,
  type SupplierStatusDto,
  type SupplierUpsertDto,
  type TeamInviteDto,
  type TeamRoleUpdateDto,
  type TeamStatusUpdateDto,
} from "@annaadhya/contracts";
import { CurrentUser, Protected, RequirePermissions } from "../common/auth/guards";
import { ZodValidationPipe } from "../common/validation/zod.pipe";
import { z } from "zod";
import { InventoryService } from "./inventory/inventory.service";
import { PurchasesService, SuppliersService } from "./suppliers/suppliers.service";
import { ExpensesService } from "./expenses/expenses.service";
import { DashboardService } from "./dashboard/dashboard.service";
import { EXPORT_TYPES, ReportsService, type ExportType } from "./reports/reports.service";
import { MediaService } from "./media/media.service";
import { TeamService } from "./team/team.service";
import { SettingsService } from "./settings/settings.service";
import { AuditService } from "./audit/audit.service";
import { CustomersService } from "./customers/customers.service";
import { rawResponse } from "../common/http/envelope";
import type { Response } from "express";
import { Res } from "@nestjs/common";

/* --------------------------------- inventory --------------------------------- */

@ApiTags("inventory")
@Controller("admin/inventory")
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  @Get("balances")
  @Protected("inventory:read")
  @RequirePermissions("inventory:read")
  async balances() {
    return this.inventory.balances();
  }

  /** Inventory console listing: search/filter/sort/pagination + same-scope summary. */
  @Get("ledger")
  @Protected("inventory:read")
  @RequirePermissions("inventory:read")
  async ledger(@Query(new ZodValidationPipe(inventoryLedgerQuerySchema)) q: InventoryLedgerQueryDto) {
    return this.inventory.ledger(q);
  }

  @Get("low-stock")
  @Protected("inventory:read")
  @RequirePermissions("inventory:read")
  async lowStock(@Query(new ZodValidationPipe(lowStockQuerySchema)) q: LowStockQueryDto) {
    return this.inventory.lowStock(q.threshold);
  }

  @Get("movements")
  @Protected("inventory:read")
  @RequirePermissions("inventory:read")
  async movements(@Query("variantId") variantId?: string, @Query("type") type?: string) {
    return this.inventory.movements({
      variantId,
      type: type as never,
    });
  }

  @Post("movements")
  @Protected("inventory:write")
  @RequirePermissions("inventory:write")
  async createMovement(
    @Body(new ZodValidationPipe(stockMovementSchema)) dto: StockMovementDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.inventory.applyMovement(dto, actor);
  }

  /** Guided adjustment from the inventory console drawer (add / remove / set exact). */
  @Post("adjustments")
  @Protected("inventory:write")
  @RequirePermissions("inventory:write")
  async adjust(
    @Body(new ZodValidationPipe(stockAdjustmentSchema)) dto: StockAdjustmentDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const movement = await this.inventory.adjust(dto, actor);
    await this.audit.record({
      actor,
      action: "inventory.adjust",
      targetType: "variant",
      targetId: dto.variantId,
      summary: `${dto.mode} ${dto.qty} on ${movement.variantSku} → ${movement.resultingStockOnHand} on hand (${dto.type})`,
    });
    return movement;
  }

  /** Bulk low-stock-threshold update from the console bulk bar. */
  @Post("thresholds")
  @Protected("inventory:write")
  @RequirePermissions("inventory:write")
  async updateThresholds(
    @Body(new ZodValidationPipe(inventoryThresholdsSchema)) dto: InventoryThresholdsDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const result = await this.inventory.updateThresholds(dto);
    await this.audit.record({
      actor,
      action: "inventory.thresholds",
      targetType: "variant",
      targetId: dto.items.map((i) => i.variantId).join(","),
      summary: `Low-stock threshold updated on ${dto.items.length} variant(s)`,
    });
    return result;
  }
}

/* ------------------------------ suppliers & buys ----------------------------- */

@ApiTags("suppliers")
@Controller("admin/suppliers")
export class SuppliersController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  /** Suppliers console listing (declared before :id so "ledger" is not captured as an id). */
  @Get("ledger")
  @Protected("suppliers:read")
  @RequirePermissions("suppliers:read")
  async ledger(@Query(new ZodValidationPipe(supplierLedgerQuerySchema)) q: SupplierLedgerQueryDto) {
    return this.suppliers.ledger(q);
  }

  @Get()
  @Protected("suppliers:read")
  @RequirePermissions("suppliers:read")
  async list(@Query("search") search?: string) {
    return this.suppliers.list({ search });
  }

  @Get(":id")
  @Protected("suppliers:read")
  @RequirePermissions("suppliers:read")
  async get(@Param("id") id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  @Protected("suppliers:write")
  @RequirePermissions("suppliers:write")
  async create(
    @Body(new ZodValidationPipe(supplierUpsertSchema)) dto: SupplierUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const doc = await this.suppliers.upsert(dto);
    await this.audit.record({
      actor,
      action: "supplier.create",
      targetType: "supplier",
      targetId: doc.id,
      summary: `Supplier ${doc.name} created (${doc.rates?.length ?? 0} rate lines)`,
    });
    return doc;
  }

  @Post(":id")
  @Protected("suppliers:write")
  @RequirePermissions("suppliers:write")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(supplierUpsertSchema)) dto: SupplierUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const doc = await this.suppliers.upsert(dto, id);
    await this.audit.record({
      actor,
      action: "supplier.update",
      targetType: "supplier",
      targetId: doc.id,
      summary: `Supplier ${doc.name} updated (${doc.rates?.length ?? 0} rate lines)`,
    });
    return doc;
  }

  /** Activate / seasonal pause. Server-side status change only — purchase history untouched. */
  @Post(":id/status")
  @Protected("suppliers:write")
  @RequirePermissions("suppliers:write")
  async setStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(supplierStatusSchema)) dto: SupplierStatusDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const doc = await this.suppliers.setStatus(id, dto.status);
    await this.audit.record({
      actor,
      action: "supplier.status_change",
      targetType: "supplier",
      targetId: doc.id,
      summary: `Supplier ${doc.name} marked ${dto.status === "active" ? "active" : "inactive (seasonal pause)"}`,
    });
    return doc;
  }
}

@ApiTags("purchases")
@Controller("admin/purchases")
export class PurchasesController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly audit: AuditService,
  ) {}

  /** Purchases console listing (declared before :id so "ledger" is not captured as an id). */
  @Get("ledger")
  @Protected("purchases:read")
  @RequirePermissions("purchases:read")
  async ledger(@Query(new ZodValidationPipe(purchaseLedgerQuerySchema)) q: PurchaseLedgerQueryDto) {
    return this.purchases.ledger(q);
  }

  /** Legacy flat list (supplier drawer + older clients) — supplierId/status filters. */
  @Get()
  @Protected("purchases:read")
  @RequirePermissions("purchases:read")
  async list(@Query("supplierId") supplierId?: string, @Query("status") status?: string) {
    return this.purchases.list({ supplierId, status: status as never });
  }

  @Get(":id")
  @Protected("purchases:read")
  @RequirePermissions("purchases:read")
  async get(@Param("id") id: string) {
    return this.purchases.get(id);
  }

  @Post()
  @Protected("purchases:write")
  @RequirePermissions("purchases:write")
  async create(
    @Body(new ZodValidationPipe(purchaseUpsertSchema)) dto: PurchaseUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const doc = await this.purchases.upsert(dto, actor);
    await this.audit.record({
      actor,
      action: "purchase.create",
      targetType: "purchase",
      targetId: doc.id,
      summary: `Purchase ${doc.reference} created (${doc.status === "draft" ? "draft" : "ordered"}, ${doc.items.length} lines, ₹${(doc.totalPaise ?? 0) / 100})`,
    });
    return doc;
  }

  /** Draft-only edit (server rejects anything already confirmed). */
  @Post(":id")
  @Protected("purchases:write")
  @RequirePermissions("purchases:write")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(purchaseUpsertSchema)) dto: PurchaseUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const doc = await this.purchases.upsert(dto, actor, id);
    await this.audit.record({
      actor,
      action: "purchase.update",
      targetType: "purchase",
      targetId: doc.id,
      summary: `Draft purchase ${doc.reference} updated (${doc.items.length} lines, ₹${(doc.totalPaise ?? 0) / 100})`,
    });
    return doc;
  }

  /** Draft → Ordered confirmation. Never touches inventory. */
  @Post(":id/confirm")
  @Protected("purchases:write")
  @RequirePermissions("purchases:write")
  async confirm(@Param("id") id: string, @CurrentUser() actor: AuthPrincipal) {
    return this.purchases.confirm(id, actor);
  }

  /** Cancel (history + received stock preserved; outstanding voided). */
  @Post(":id/cancel")
  @Protected("purchases:write")
  @RequirePermissions("purchases:write")
  async cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(purchaseCancelSchema)) dto: PurchaseCancelDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.purchases.cancel(id, dto.reason, actor);
  }

  /**
   * Record goods received. `receiptId` is the client-side idempotency key — replays
   * return the purchase unchanged instead of applying stock twice. Stock, movements,
   * receipt history and status commit in one server-side transaction.
   */
  @Post(":id/receive")
  @Protected("purchases:write")
  @RequirePermissions("purchases:write")
  async receive(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(purchaseReceiveSchema)) dto: PurchaseReceiveDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.purchases.receive(id, dto, actor);
  }

  /** Record a real supplier payment (settlement state stays derived from these records). */
  @Post(":id/payments")
  @Protected("purchases:write")
  @RequirePermissions("purchases:write")
  async recordPayment(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(purchasePaymentSchema)) dto: PurchasePaymentDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.purchases.recordPayment(id, dto, actor);
  }
}

/* ---------------------------------- expenses --------------------------------- */

@ApiTags("expenses")
@Controller("admin/expenses")
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly audit: AuditService,
  ) {}

  /** Paginated ledger + authoritative summary/trend/category aggregates over the
   *  SAME filtered set (the page never computes its own metrics). */
  @Get()
  @Protected("expenses:read")
  @RequirePermissions("expenses:read")
  async list(@Query(new ZodValidationPipe(expenseListQuerySchema)) q: ExpenseListQueryDto) {
    return this.expenses.listPage(q);
  }

  @Get("total")
  @Protected("expenses:read")
  @RequirePermissions("expenses:read")
  async total(@Query("from") from?: string, @Query("to") to?: string) {
    return { totalPaise: await this.expenses.total({ from: from ? Number(from) : undefined, to: to ? Number(to) : undefined }) };
  }

  @Post()
  @Protected("expenses:write")
  @RequirePermissions("expenses:write")
  async create(
    @Body(new ZodValidationPipe(expenseUpsertSchema)) dto: ExpenseUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const doc = await this.expenses.create(dto, actor);
    await this.audit.record({
      actor,
      action: "expense.create",
      targetType: "expense",
      targetId: doc.id,
      summary: `Expense ${doc.category} ₹${(doc.amountPaise / 100).toFixed(2)}: ${doc.description.slice(0, 60)}`,
    });
    return doc;
  }

  @Post(":id")
  @Protected("expenses:write")
  @RequirePermissions("expenses:write")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(expenseUpsertSchema)) dto: ExpenseUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const doc = await this.expenses.update(id, dto, actor);
    await this.audit.record({
      actor,
      action: "expense.update",
      targetType: "expense",
      targetId: id,
      summary: `Expense ${doc.category} ₹${(doc.amountPaise / 100).toFixed(2)} (${doc.status}): ${doc.description.slice(0, 60)}`,
    });
    return doc;
  }

  @Delete(":id")
  @Protected("expenses:write")
  @RequirePermissions("expenses:write")
  async delete(@Param("id") id: string, @CurrentUser() actor: AuthPrincipal) {
    await this.expenses.delete(id);
    await this.audit.record({ actor, action: "expense.delete", targetType: "expense", targetId: id, summary: `Expense ${id} deleted` });
    return { deleted: true };
  }
}

/* ---------------------------------- customers -------------------------------- */

@ApiTags("admin-customers")
@Controller("admin/customers")
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  /**
   * Customer directory — search / activity / status / registration window / sort /
   * pagination + summary cards, all computed server-side from real records.
   * PII minimisation stays server-side: roles without customers:write receive
   * masked email/phone (list rows never carry addresses or note content at all).
   */
  @Get()
  @Protected("customers:read")
  @RequirePermissions("customers:read")
  async list(
    @Query(new ZodValidationPipe(customerListQuerySchema)) q: CustomerListQueryDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const page = await this.customers.directory(q);
    return {
      ...page,
      items: page.items.map((row) => this.customers.maskForRole(row, actor.permissions)),
    };
  }

  /** Paginated real order history for the detail drawer (existing order docs, existing routes). */
  @Get(":id/orders")
  @Protected("customers:read")
  @RequirePermissions("customers:read")
  async orders(
    @Param("id") id: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "10",
  ) {
    return this.customers.customerOrders(id, Number(page) || 1, Math.min(50, Number(pageSize) || 10));
  }

  /** Replace the internal support note — staff-only content, audited, never customer-facing. */
  @Patch(":id/notes")
  @Protected("customers:write")
  @RequirePermissions("customers:write")
  async updateNotes(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(customerNoteUpdateSchema)) dto: CustomerNoteUpdateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.customers.updateNotes(id, dto.note, actor);
  }

  @Get(":id")
  @Protected("customers:read")
  @RequirePermissions("customers:read")
  async get(@Param("id") id: string, @CurrentUser() actor: AuthPrincipal) {
    const doc = await this.customers.getAdmin(id);
    return this.customers.maskForRole(doc, actor.permissions);
  }

  @Post(":id/status")
  @Protected("customers:write")
  @RequirePermissions("customers:write")
  async setStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(z.object({ status: z.enum(["active", "suspended"]) }))) body: { status: "active" | "suspended" },
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.customers.setStatus(id, body.status, actor);
  }
}

/* ---------------------------------- dashboard -------------------------------- */

@ApiTags("dashboard")
@Controller("admin/dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("metrics")
  @Protected("dashboard:read")
  @RequirePermissions("dashboard:read")
  async metrics(
    @Query("days") days?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("includeDemo") includeDemo?: string,
  ) {
    const n = Math.min(365, Math.max(1, Number(days) || 30));
    // Optional explicit window (epoch millis) — the Orders console passes its table's
    // date scope so the summary cards and the table never disagree. Invalid values
    // fall back to the `days` window rather than erroring.
    const fromMillis = from !== undefined && from !== "" ? Number(from) : NaN;
    const toMillis = to !== undefined && to !== "" ? Number(to) : NaN;
    const range =
      Number.isFinite(fromMillis) &&
      Number.isFinite(toMillis) &&
      fromMillis > 0 &&
      toMillis > fromMillis
        ? { from: fromMillis, to: toMillis }
        : undefined;
    // Optional demo inclusion — the Orders console passes true because its table shows
    // demo rows (DEMO chips); cards must count the same rows the table lists.
    const includeDemoOverride = includeDemo === "true" ? true : includeDemo === "false" ? false : undefined;
    return this.dashboard.metrics(n, range, includeDemoOverride);
  }
}

/* ----------------------------------- reports --------------------------------- */

@ApiTags("reports")
@Controller("admin/reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  @Get("types")
  @Protected("reports:read")
  @RequirePermissions("reports:read")
  async types() {
    return EXPORT_TYPES;
  }

  @Get("exports/:type")
  @Protected("reports:export")
  @RequirePermissions("reports:export")
  async exportXlsx(
    @Param("type") type: string,
    @Query("includeDemo") includeDemo?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("status") status?: string,
    @Query("paymentStatus") paymentStatus?: string,
    @Query("paymentProvider") paymentProvider?: string,
    @Query("search") search?: string,
    @Query("activity") activity?: string,
    @Query("custStatus") custStatus?: string,
    @Query("registeredFrom") registeredFrom?: string,
    @Query("registeredTo") registeredTo?: string,
    @Query("sort") sort?: string,
    @Res() res?: Response,
    @CurrentUser() actor?: AuthPrincipal,
  ) {
    if (!EXPORT_TYPES.includes(type as ExportType)) {
      return void res?.status(404).json({ ok: false, error: { code: "not_found", message: `Unknown export type ${type}` } });
    }
    // Order-list filters (Orders console "Export Orders"): only valid enum members are
    // forwarded; anything else is ignored rather than silently narrowing the export.
    const orderFilters =
      type === "orders"
        ? {
            status: (ORDER_STATUSES as readonly string[]).includes(status ?? "") ? (status as OrderStatus) : undefined,
            paymentStatus: (PAYMENT_STATUSES as readonly string[]).includes(paymentStatus ?? "")
              ? (paymentStatus as PaymentStatus)
              : undefined,
            paymentProvider: (PAYMENT_PROVIDERS as readonly string[]).includes(paymentProvider ?? "")
              ? (paymentProvider as PaymentProviderName)
              : undefined,
            search: search?.trim() ? search.trim().slice(0, 120) : undefined,
          }
        : undefined;
    // Customer-directory filters (Customers console "Export Directory") — same rule:
    // invalid enum values are ignored instead of narrowing the export silently.
    const customerFilters =
      type === "customers"
        ? {
            search: search?.trim() ? search.trim().slice(0, 120) : undefined,
            activity: (["all", "with_orders", "no_orders", "repeat"] as const).includes(activity as never)
              ? (activity as "all" | "with_orders" | "no_orders" | "repeat")
              : undefined,
            status: (["all", "active", "suspended"] as const).includes(custStatus as never)
              ? (custStatus as "all" | "active" | "suspended")
              : undefined,
            registeredFrom: registeredFrom ? Number(registeredFrom) : undefined,
            registeredTo: registeredTo ? Number(registeredTo) : undefined,
            sort: (["spend_desc", "orders_desc", "recent_order", "recent_registered", "name_asc"] as const).includes(
              sort as never,
            )
              ? (sort as "spend_desc" | "orders_desc" | "recent_order" | "recent_registered" | "name_asc")
              : undefined,
          }
        : undefined;
    const buffer = await this.reports.generate(type as ExportType, {
      includeDemo: includeDemo === "true",
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      orderFilters,
      customerFilters,
    });
    if (actor) {
      await this.audit.record({
        actor,
        action: "report.export",
        targetType: "report",
        targetId: type,
        summary: `Exported ${type} (includeDemo=${includeDemo === "true"})`,
      });
    }
    const stamp = new Date().toISOString().slice(0, 10);
    rawResponse(res!, `annaadhya-${type}-${stamp}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer);
  }
}

/* ------------------------------------ media ---------------------------------- */

@ApiTags("media")
@Controller("admin/media")
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  @Post("upload-signature")
  @Protected("media:write")
  @RequirePermissions("media:write")
  async uploadSignature(
    @Body(new ZodValidationPipe(mediaSignatureSchema)) dto: MediaSignatureDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const sig = this.media.uploadSignature(dto.folder);
    await this.audit.record({
      actor,
      action: "media.signature_issued",
      targetType: "media",
      targetId: dto.folder,
      summary: `Issued Cloudinary upload signature for ${dto.folder}`,
    });
    return sig;
  }

  @Post("register")
  @Protected("media:write")
  @RequirePermissions("media:write")
  async register(@Body(new ZodValidationPipe(mediaRegisterSchema)) dto: MediaRegisterDto) {
    return this.media.validateUploadedAsset({ publicId: dto.publicId, url: dto.url, folder: "annaadhya" });
  }
}

/* ------------------------------------- team ---------------------------------- */

@ApiTags("team")
@Controller("admin/team")
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Protected("team:read")
  @RequirePermissions("team:read")
  async list() {
    return this.team.list();
  }

  @Post()
  @Protected("team:write")
  @RequirePermissions("team:write")
  async invite(@Body(new ZodValidationPipe(teamInviteSchema)) dto: TeamInviteDto, @CurrentUser() actor: AuthPrincipal) {
    return this.team.invite(dto, actor);
  }

  @Post(":id/role")
  @Protected("team:write")
  @RequirePermissions("team:write")
  async updateRole(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(teamRoleUpdateSchema)) dto: TeamRoleUpdateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.team.updateRole(id, dto.role, actor);
  }

  @Post(":id/status")
  @Protected("team:write")
  @RequirePermissions("team:write")
  async updateStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(teamStatusUpdateSchema)) dto: TeamStatusUpdateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.team.updateStatus(id, dto.status, actor);
  }
}

/* ----------------------------------- settings -------------------------------- */

@ApiTags("settings")
@Controller("admin/settings")
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Protected("settings:read")
  @RequirePermissions("settings:read")
  async get() {
    return this.settings.get();
  }

  @Post()
  @Protected("settings:write")
  @RequirePermissions("settings:write")
  async update(
    @Body(new ZodValidationPipe(settingsUpdateSchema)) dto: SettingsUpdateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const result = await this.settings.update(dto as never);
    await this.audit.record({
      actor,
      action: "settings.update",
      targetType: "settings",
      targetId: "global",
      summary: "Global settings updated",
      metadata: { sections: Object.keys(dto) },
    });
    return result;
  }
}

/* ------------------------------------- audit --------------------------------- */

@ApiTags("audit")
@Controller("admin/audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Protected("audit:read")
  @RequirePermissions("audit:read")
  async list(@Query("action") action?: string, @Query("actorUid") actorUid?: string, @Query("limit") limit?: string) {
    return this.audit.list({ action, actorUid, limit: Math.min(500, Number(limit) || 100) });
  }
}

// Re-export DTO type for module wiring convenience
export type { CategoryUpsertDto };
