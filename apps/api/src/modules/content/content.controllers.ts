/** CMS controllers — admin management + public read surface for storefront
 *  content (pages, navigation, homepage). Admin routes are permission-checked
 *  (`content:read` / `content:write`) and audited; public routes expose only
 *  published content through whitelisted projections. */
import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  homepageUpdateSchema,
  navigationItemUpsertSchema,
  pageStatusUpdateSchema,
  pageUpsertSchema,
  type AuthPrincipal,
  type HomepageUpdateDto,
  type NavigationItemUpsertDto,
  type PageStatusUpdateDto,
  type PageUpsertDto,
} from "@annaadhya/contracts";
import { CurrentUser, Protected, Public, RequirePermissions } from "../../common/auth/guards";
import { ZodValidationPipe } from "../../common/validation/zod.pipe";
import { AuditService } from "../audit/audit.service";
import { PagesService } from "./pages.service";
import { NavigationService } from "./navigation.service";
import { HomepageService } from "./homepage.service";
import { storefrontUrlForPage } from "./content-urls";

@ApiTags("content")
@Controller()
export class PublicContentController {
  constructor(
    private readonly pages: PagesService,
    private readonly navigationSvc: NavigationService,
    private readonly homepageSvc: HomepageService,
  ) {}

  /** Published pages (for sitemaps, nav pickers, footer discovery). */
  @Public()
  @Get("pages")
  async publishedPages() {
    return this.pages.listPublic();
  }

  @Public()
  @Get("pages/:slug")
  async publishedPage(@Param("slug") slug: string) {
    return this.pages.getPublicBySlug(slug);
  }

  /** Resolved navigation: enabled items only, validated hrefs. */
  @Public()
  @Get("navigation")
  async navigation() {
    return this.navigationSvc.listPublic();
  }

  /** Saved-item counts per location (any enabled state). Public — no hidden
   *  content leaks, just whether the Navigation manager has been configured
   *  for each surface, so the storefront can honour "all items hidden". */
  @Public()
  @Get("navigation/configured")
  async navigationConfigured() {
    return this.navigationSvc.configStatus();
  }

  /** Homepage section configuration (never includes hero copy — that is settings). */
  @Public()
  @Get("homepage")
  async homepage() {
    return this.homepageSvc.get();
  }
}

@ApiTags("admin-content")
@Controller("admin/content")
export class AdminContentController {
  constructor(
    private readonly pages: PagesService,
    private readonly navigationSvc: NavigationService,
    private readonly homepageSvc: HomepageService,
    private readonly audit: AuditService,
  ) {}

  /* --------------------------------- pages -------------------------------- */

  @Get("pages")
  @Protected("content:read")
  @RequirePermissions("content:read")
  async listPages() {
    return this.pages.list();
  }

  @Post("pages")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async createPage(
    @Body(new ZodValidationPipe(pageUpsertSchema)) dto: PageUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const result = await this.pages.create(dto, actor);
    await this.audit.record({
      actor,
      action: "page.create",
      targetType: "page",
      targetId: result.id,
      summary: `Created page "${result.title}" (${storefrontUrlForPage(result)})`,
      metadata: { status: result.status, pageType: result.pageType },
    });
    return result;
  }

  @Post("pages/:id")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async updatePage(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(pageUpsertSchema)) dto: PageUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const result = await this.pages.update(id, dto, actor);
    await this.audit.record({
      actor,
      action: "page.update",
      targetType: "page",
      targetId: id,
      summary: `Updated page "${result.title}" (${storefrontUrlForPage(result)})`,
      metadata: { status: result.status },
    });
    return result;
  }

  @Post("pages/:id/status")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async setPageStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(pageStatusUpdateSchema)) dto: PageStatusUpdateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const result = await this.pages.setStatus(id, dto.status, actor);
    await this.audit.record({
      actor,
      action: `page.${dto.status === "published" ? "publish" : dto.status === "draft" ? "unpublish" : "archive"}`,
      targetType: "page",
      targetId: id,
      summary: `Page "${result.title}" is now ${dto.status}`,
    });
    return result;
  }

  @Post("pages/:id/restore-default")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async restorePageDefault(@Param("id") id: string, @CurrentUser() actor: AuthPrincipal) {
    const result = await this.pages.restoreDefault(id, actor);
    await this.audit.record({
      actor,
      action: "page.restore_default",
      targetType: "page",
      targetId: id,
      summary: `Restored shipped default content for "${result.title}"`,
    });
    return result;
  }

  @Delete("pages/:id")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async deletePage(@Param("id") id: string, @CurrentUser() actor: AuthPrincipal) {
    const existing = await this.pages.getById(id);
    await this.pages.remove(id);
    await this.audit.record({
      actor,
      action: "page.delete",
      targetType: "page",
      targetId: id,
      summary: `Deleted page "${existing.title}" (${storefrontUrlForPage(existing)})`,
    });
    return { deleted: true };
  }

  /* ------------------------------- navigation ------------------------------ */

  @Get("navigation")
  @Protected("content:read")
  @RequirePermissions("content:read")
  async listNavigation() {
    return this.navigationSvc.list();
  }

  @Post("navigation")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async createNavigationItem(
    @Body(new ZodValidationPipe(navigationItemUpsertSchema)) dto: NavigationItemUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const result = await this.navigationSvc.create(dto);
    await this.audit.record({
      actor,
      action: "navigation.create",
      targetType: "navigation",
      targetId: result.id,
      summary: `Added ${result.location} link "${result.label}"`,
    });
    return result;
  }

  @Post("navigation/:id")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async updateNavigationItem(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(navigationItemUpsertSchema)) dto: NavigationItemUpsertDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const result = await this.navigationSvc.update(id, dto);
    await this.audit.record({
      actor,
      action: "navigation.update",
      targetType: "navigation",
      targetId: id,
      summary: `Updated ${result.location} link "${result.label}"`,
    });
    return result;
  }

  @Delete("navigation/:id")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async deleteNavigationItem(@Param("id") id: string, @CurrentUser() actor: AuthPrincipal) {
    await this.navigationSvc.remove(id);
    await this.audit.record({
      actor,
      action: "navigation.delete",
      targetType: "navigation",
      targetId: id,
      summary: "Removed a navigation link",
    });
    return { deleted: true };
  }

  /* -------------------------------- homepage ------------------------------- */

  @Get("homepage")
  @Protected("content:read")
  @RequirePermissions("content:read")
  async getHomepage() {
    return this.homepageSvc.get();
  }

  @Post("homepage")
  @Protected("content:write")
  @RequirePermissions("content:write")
  async updateHomepage(
    @Body(new ZodValidationPipe(homepageUpdateSchema)) dto: HomepageUpdateDto,
    @CurrentUser() actor: AuthPrincipal,
  ) {
    const result = await this.homepageSvc.update(dto);
    await this.audit.record({
      actor,
      action: "homepage.update",
      targetType: "homepage",
      targetId: "global",
      summary: "Updated homepage sections",
      metadata: { sections: Object.keys(dto) },
    });
    return result;
  }
}
