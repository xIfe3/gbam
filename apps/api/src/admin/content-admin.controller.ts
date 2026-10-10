import {
  CONTENT_STATUSES,
  contentDraftSchema,
  newContentSchema,
  publishContentSchema,
  type ContentDraft,
  type NewContentInput,
  type PublishContentInput,
} from "@gbam/shared";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { z } from "zod";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AdminGuard, CurrentAdmin, RequirePermission } from "./admin.guard.js";
import { ContentAdminService } from "./content-admin.service.js";

const listQuerySchema = z.object({
  type: z
    .enum(["help_article", "faq", "blog_post", "changelog", "legal", "marketing_page"])
    .optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  category: z.string().max(60).optional(),
  q: z.string().max(200).optional(),
  bin: z.string().optional(),
});

/** The content editor. content.edit for drafts, images and the bin; content.publish to publish. */
@Controller("admin/content")
@UseGuards(AdminGuard)
export class ContentAdminController {
  constructor(
    private readonly content: ContentAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ip(req: Request): string {
    return clientIp(req, this.env.INTERNAL_API_SECRET);
  }

  @Get()
  @RequirePermission("content.edit")
  list(@Query(new ZodPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>) {
    return this.content.list({ ...query, bin: query.bin === "1" });
  }

  @Post()
  @RequirePermission("content.edit")
  create(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(newContentSchema)) body: NewContentInput,
  ) {
    return this.content.create(body, admin, this.ip(req));
  }

  /** Opens (and on first use creates) the entry behind a marketing page. */
  @Post("marketing/:page")
  @HttpCode(200)
  @RequirePermission("content.edit")
  openMarketing(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("page") page: string,
  ) {
    return this.content.openMarketing(page, admin, this.ip(req));
  }

  /** Declared before ":id" routes so "images" isn't read as an id. */
  @Post("images")
  @RequirePermission("content.edit")
  @UseInterceptors(
    FileInterceptor("image", { limits: { fileSize: 10 * 1024 * 1024 + 1, files: 1, parts: 2 } }),
  )
  image(@UploadedFile() file: { buffer: Buffer; size: number } | undefined) {
    if (!file) {
      throw new BadRequestException("Choose an image to upload");
    }
    return this.content.uploadImage(file);
  }

  @Get(":id")
  @RequirePermission("content.edit")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.content.detail(id);
  }

  @Patch(":id/draft")
  @RequirePermission("content.edit")
  saveDraft(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(contentDraftSchema)) body: ContentDraft,
  ) {
    return this.content.saveDraft(id, body, admin, this.ip(req));
  }

  @Post(":id/publish")
  @HttpCode(200)
  @RequirePermission("content.publish")
  publish(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(publishContentSchema)) body: PublishContentInput,
  ) {
    return this.content.publish(id, body, admin, this.ip(req));
  }

  @Post(":id/unpublish")
  @HttpCode(200)
  @RequirePermission("content.publish")
  unpublish(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.content.unpublish(id, admin, this.ip(req));
  }

  @Get(":id/versions/:versionId")
  @RequirePermission("content.edit")
  version(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ) {
    return this.content.version(id, versionId);
  }

  @Post(":id/versions/:versionId/restore")
  @HttpCode(200)
  @RequirePermission("content.publish")
  restoreVersion(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ) {
    return this.content.restoreVersion(id, versionId, admin, this.ip(req));
  }

  @Post(":id/delete")
  @HttpCode(200)
  @RequirePermission("content.edit")
  remove(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.content.remove(id, admin, this.ip(req));
  }

  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermission("content.edit")
  restore(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.content.restore(id, admin, this.ip(req));
  }
}
