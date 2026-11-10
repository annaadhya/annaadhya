/** Orders — customer endpoints + admin management with enforced transitions and refunds. */
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  orderListQuerySchema,
  orderNoteCreateSchema,
  orderRefundSchema,
  orderStatusUpdateSchema,
  orderTrackingUpdateSchema,
  type AuthPrincipal,
  type OrderListQueryDto,
  type OrderNoteCreateDto,
  type OrderRefundDto,
  type OrderStatusUpdateDto,
  type OrderTrackingUpdateDto,
} from "@annaadhya/contracts";
import { CurrentUser, Protected, RequirePermissions } from "../../common/auth/guards";
import { ZodValidationPipe } from "../../common/validation/zod.pipe";
import { OrdersService } from "./orders.service";
import { CheckoutService } from "../checkout/checkout.service";

@ApiTags("orders")
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("mine")
  async mine(
    @CurrentUser() principal: AuthPrincipal,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "10",
  ) {
    return this.orders.listForCustomer(principal.uid, Number(page) || 1, Math.min(50, Number(pageSize) || 10));
  }

  @Get("mine/:id")
  async mineOne(@Param("id") id: string, @CurrentUser() principal: AuthPrincipal) {
    return this.orders.getForCustomer(id, principal.uid);
  }
}

@ApiTags("admin-orders")
@Controller("admin/orders")
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly checkout: CheckoutService,
  ) {}

  @Get()
  @Protected("orders:read")
  @RequirePermissions("orders:read")
  async list(@Query(new ZodValidationPipe(orderListQuerySchema)) q: OrderListQueryDto) {
    // page/pageSize have zod defaults; the ?? keeps the service contract
    // satisfied even under non-strict type-checking.
    return this.orders.listAdmin({ ...q, page: q.page ?? 1, pageSize: q.pageSize ?? 20 });
  }

  @Get("state-machine")
  @Protected("orders:read")
  @RequirePermissions("orders:read")
  async stateMachine() {
    const { ORDER_TRANSITIONS } = await import("@annaadhya/contracts");
    return ORDER_TRANSITIONS;
  }

  @Get(":id")
  @Protected("orders:read")
  @RequirePermissions("orders:read")
  async getOne(@Param("id") id: string) {
    return this.orders.getAdmin(id);
  }

  /** Chronological audit events recorded against this order (real events only). */
  @Get(":id/timeline")
  @Protected("orders:read")
  @RequirePermissions("orders:read")
  async timeline(@Param("id") id: string) {
    return this.orders.listTimeline(id);
  }

  /** Internal staff notes — admin-only by construction (customer endpoints never join them). */
  @Get(":id/notes")
  @Protected("orders:read")
  @RequirePermissions("orders:read")
  async notes(@Param("id") id: string) {
    return this.orders.listNotes(id);
  }

  @Post(":id/notes")
  @Protected("orders:write")
  @RequirePermissions("orders:write")
  async addNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(orderNoteCreateSchema)) dto: OrderNoteCreateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.orders.addNote(id, dto, actor);
  }

  /** Provider payment attempts for this order (provider order/payment ids, statuses). */
  @Get(":id/payments")
  @Protected("orders:read")
  @RequirePermissions("orders:read")
  async payments(@Param("id") id: string) {
    return this.orders.listPaymentAttempts(id);
  }

  @Post(":id/status")
  @Protected("orders:write")
  @RequirePermissions("orders:write")
  async updateStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(orderStatusUpdateSchema)) dto: OrderStatusUpdateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.orders.updateStatus(id, dto, actor);
  }

  /** Correct shipment tracking on a shipped/delivered order (typo'd AWB, rebooked courier). */
  @Patch(":id/tracking")
  @Protected("orders:write")
  @RequirePermissions("orders:write")
  async updateTracking(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(orderTrackingUpdateSchema)) dto: OrderTrackingUpdateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.orders.updateTracking(id, dto, actor);
  }

  @Post(":id/refund")
  @Protected("orders:refund")
  @RequirePermissions("orders:refund")
  async refund(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(orderRefundSchema)) dto: OrderRefundDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    return this.orders.refund(id, dto, actor);
  }

  /** Maintenance: release expired stock reservations (also runs on a schedule). */
  @Post("reservations/release-expired")
  @Protected("orders:write")
  @RequirePermissions("orders:write")
  async releaseExpired() {
    return this.checkout.releaseExpiredReservations();
  }
}
