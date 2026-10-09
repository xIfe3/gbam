import {
  reasonSchema,
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  TICKET_STATUSES,
  ticketBulkSchema,
  ticketReplySchema,
  ticketUpdateSchema,
  type ReasonInput,
  type TicketBulkInput,
  type TicketReplyInput,
  type TicketUpdateInput,
} from "@gbam/shared";
import {
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
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AdminGuard, CurrentAdmin, RequirePermission } from "./admin.guard.js";
import { TicketsAdminService } from "./tickets-admin.service.js";

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  source: z.enum(TICKET_SOURCES).optional(),
  assignee: z.union([z.literal("me"), z.literal("none"), z.uuid()]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  bin: z.string().optional(),
});

@Controller("admin/tickets")
@UseGuards(AdminGuard)
export class TicketsAdminController {
  constructor(
    private readonly tickets: TicketsAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ip(req: Request): string {
    return clientIp(req, this.env.INTERNAL_API_SECRET);
  }

  @Get()
  @RequirePermission("tickets.view")
  list(
    @CurrentAdmin() admin: AdminContext,
    @Query(new ZodPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>,
  ) {
    return this.tickets.list({ ...query, bin: query.bin === "1" }, admin);
  }

  /** Bulk changes from the list. Declared before ":id" routes so "bulk" isn't read as an id. */
  @Post("bulk")
  @HttpCode(200)
  @RequirePermission("tickets.handle")
  bulk(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(ticketBulkSchema)) body: TicketBulkInput,
  ) {
    return this.tickets.bulk(body, admin, this.ip(req));
  }

  @Get(":id")
  @RequirePermission("tickets.view")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.tickets.detail(id);
  }

  @Post(":id/reply")
  @RequirePermission("tickets.handle")
  reply(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ticketReplySchema)) body: TicketReplyInput,
  ) {
    return this.tickets.reply(id, admin, body.message, this.ip(req));
  }

  @Post(":id/notes")
  @RequirePermission("tickets.handle")
  note(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ticketReplySchema)) body: TicketReplyInput,
  ) {
    return this.tickets.note(id, admin, body.message, this.ip(req));
  }

  @Patch(":id")
  @RequirePermission("tickets.handle")
  update(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ticketUpdateSchema)) body: TicketUpdateInput,
  ) {
    return this.tickets.update(id, body, admin, this.ip(req));
  }

  @Post(":id/delete")
  @RequirePermission("tickets.handle")
  remove(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.tickets.remove(id, body.reason, admin, this.ip(req));
  }

  @Post(":id/restore")
  @RequirePermission("tickets.handle")
  restore(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.tickets.restore(id, admin, this.ip(req));
  }
}
