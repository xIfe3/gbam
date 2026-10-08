import {
  bulkActionSchema,
  reasonSchema,
  type BulkActionInput,
  type ReasonInput,
} from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AdminGuard, CurrentAdmin, RequirePermission } from "./admin.guard.js";
import { AuditService } from "./audit.service.js";
import { SupportAdminService } from "./support-admin.service.js";

const messagesQuery = z.object({
  status: z.enum(["new", "handled"]).default("new"),
  q: z.string().max(200).optional(),
});
const issuesQuery = z.object({ status: z.enum(["open", "resolved"]).default("open") });
const auditQuery = z.object({
  adminId: z.uuid().optional(),
  action: z.string().max(100).optional(),
  targetType: z.string().max(50).optional(),
  targetId: z.string().max(100).optional(),
  batchId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

@Controller("admin")
@UseGuards(AdminGuard)
export class SupportAdminController {
  constructor(
    private readonly support: SupportAdminService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ip(req: Request): string {
    return clientIp(req, this.env.INTERNAL_API_SECRET);
  }

  @Get("support/messages")
  @RequirePermission("support.view")
  messages(@Query(new ZodPipe(messagesQuery)) query: z.output<typeof messagesQuery>) {
    return this.support.messages(query.status, query.q);
  }

  @Get("support/issues")
  @RequirePermission("support.view")
  issues(@Query(new ZodPipe(issuesQuery)) query: z.output<typeof issuesQuery>) {
    return this.support.issues(query.status);
  }

  @Post("support/messages/bulk/handle")
  @HttpCode(200)
  @RequirePermission("support.handle")
  bulkHandle(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(bulkActionSchema)) body: BulkActionInput,
  ) {
    return this.support.bulkHandleMessages(body.ids, body.note, admin, this.ip(req));
  }

  @Post("support/messages/:id/handle")
  @HttpCode(200)
  @RequirePermission("support.handle")
  handle(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.support.handleMessage(id, body.reason, admin, this.ip(req));
  }

  @Post("support/issues/:id/resolve")
  @HttpCode(200)
  @RequirePermission("support.handle")
  resolveIssue(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.support.resolveIssue(id, body.reason, admin, this.ip(req));
  }

  /** Read only, on purpose: there are no routes that change or delete audit entries. */
  @Get("audit")
  @RequirePermission("audit.view")
  auditLog(@Query(new ZodPipe(auditQuery)) query: z.output<typeof auditQuery>) {
    let from: Date | undefined = undefined;
    if (query.from) {
      from = new Date(`${query.from}T00:00:00.000Z`);
    }
    let to: Date | undefined = undefined;
    if (query.to) {
      to = new Date(`${query.to}T23:59:59.999Z`);
    }
    return this.audit.list({ ...query, from, to });
  }
}
