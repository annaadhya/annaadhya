import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { dataProviders, API_ENV, DATA_CLIENT } from "./data/data.module";
import { AuthGuard, PermissionsGuard, RateLimitGuard } from "./common/auth/guards";
import { EnvelopeInterceptor } from "./common/http/envelope";
import { AllExceptionsFilter } from "./common/http/exceptions.filter";
import { CHECKOUT_SWEEPER } from "./app.tokens";
import type { Provider } from "@nestjs/common";
import type { ApiEnv } from "./config/env";
import type { DataClient } from "@annaadhya/data-core";
import type { PaymentProvider } from "./modules/payments/provider.interface";

import { AuditService } from "./modules/audit/audit.service";
import { SettingsService } from "./modules/settings/settings.service";
import { CatalogueService } from "./modules/catalogue/catalogue.service";
import { PagesService } from "./modules/content/pages.service";
import { NavigationService } from "./modules/content/navigation.service";
import { HomepageService } from "./modules/content/homepage.service";
import { AdminContentController, PublicContentController } from "./modules/content/content.controllers";
import { CheckoutService } from "./modules/checkout/checkout.service";
import { MockPaymentProvider } from "./modules/payments/mock.provider";
import { RazorpayProvider } from "./modules/payments/razorpay.provider";
import { OrdersService } from "./modules/orders/orders.service";
import { InventoryService } from "./modules/inventory/inventory.service";
import { PurchasesService, SuppliersService } from "./modules/suppliers/suppliers.service";
import { ExpensesService } from "./modules/expenses/expenses.service";
import { CustomersService } from "./modules/customers/customers.service";
import { DashboardService } from "./modules/dashboard/dashboard.service";
import { ReportsService } from "./modules/reports/reports.service";
import { MediaService } from "./modules/media/media.service";
import { TeamService } from "./modules/team/team.service";
import { NewsletterService } from "./modules/newsletter/newsletter.service";
import { ContactService } from "./modules/contact/contact.service";
import { PublicSettingsController } from "./modules/settings/public-settings.controller";

import { AuthController } from "./modules/auth/auth.controller";
import { CustomersController } from "./modules/customers/customers.controller";
import { AdminCatalogueController, CatalogueController } from "./modules/catalogue/catalogue.controller";
import { CheckoutController } from "./modules/checkout/checkout.controller";
import { AdminOrdersController, OrdersController } from "./modules/orders/orders.controller";
import {
  AdminCustomersController,
  AuditController,
  DashboardController,
  ExpensesController,
  InventoryController,
  MediaController,
  PurchasesController,
  ReportsController,
  SettingsController,
  SuppliersController,
  TeamController,
} from "./modules/admin.controllers";
import { NewsletterController } from "./modules/newsletter/newsletter.controller";
import { ContactController } from "./modules/contact/contact.controller";
import { HealthController } from "./modules/health/health.controller";

export const PAYMENT_PROVIDERS = "PAYMENT_PROVIDERS";

const paymentProviderFactories: Provider[] = [
  MockPaymentProvider,
  RazorpayProvider,
  {
    provide: PAYMENT_PROVIDERS,
    useFactory: (mock: MockPaymentProvider, rzp: RazorpayProvider, env: ApiEnv): PaymentProvider[] => {
      const list: PaymentProvider[] = [mock];
      // Razorpay is only registered when its credentials exist; otherwise checkout falls back
      // to the mock adapter with a clear mode descriptor — never a silent fake success.
      if (env.razorpayConfigured) list.push(rzp);
      return list;
    },
    inject: [MockPaymentProvider, RazorpayProvider, API_ENV],
  },
];

@Module({
  controllers: [
    AuthController,
    CustomersController,
    CatalogueController,
    AdminCatalogueController,
    CheckoutController,
    OrdersController,
    AdminOrdersController,
    InventoryController,
    SuppliersController,
    PurchasesController,
    ExpensesController,
    AdminCustomersController,
    DashboardController,
    ReportsController,
    MediaController,
    TeamController,
    SettingsController,
    PublicSettingsController,
    PublicContentController,
    AdminContentController,
    AuditController,
    HealthController,
    NewsletterController,
    ContactController,
  ],
  providers: [
    ...dataProviders,
    ...paymentProviderFactories,
    AuditService,
    SettingsService,
    CatalogueService,
    PagesService,
    NavigationService,
    HomepageService,
    {
      provide: CheckoutService,
      useFactory: (data: DataClient, settings: SettingsService, audit: AuditService, env: ApiEnv, providers: PaymentProvider[]) =>
        new CheckoutService(data, settings, audit, env, providers),
      inject: [DATA_CLIENT, SettingsService, AuditService, API_ENV, PAYMENT_PROVIDERS],
    },
    {
      provide: OrdersService,
      useFactory: (data: DataClient, audit: AuditService, providers: PaymentProvider[]) =>
        new OrdersService(data, audit, providers),
      inject: [DATA_CLIENT, AuditService, PAYMENT_PROVIDERS],
    },
    InventoryService,
    SuppliersService,
    PurchasesService,
    ExpensesService,
    CustomersService,
    DashboardService,
    ReportsService,
    MediaService,
    TeamService,
    NewsletterService,
    ContactService,
    // Global guard/interceptor/filter singletons (wired below via useExisting)
    RateLimitGuard,
    AuthGuard,
    PermissionsGuard,
    EnvelopeInterceptor,
    AllExceptionsFilter,
    {
      provide: CHECKOUT_SWEEPER,
      useExisting: CheckoutService,
    },
    { provide: APP_GUARD, useExisting: RateLimitGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useExisting: EnvelopeInterceptor },
    { provide: APP_FILTER, useExisting: AllExceptionsFilter },
  ],
  exports: [DATA_CLIENT, SettingsService, CheckoutService],
})
export class AppModule {}

// Guard/interceptor/filter singletons (registered globally via useExisting)
export const GLOBAL_GUARD_PROVIDERS: Provider[] = [
  RateLimitGuard,
  AuthGuard,
  PermissionsGuard,
  EnvelopeInterceptor,
  AllExceptionsFilter,
];
