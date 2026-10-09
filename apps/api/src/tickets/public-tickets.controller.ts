import { ticketReplySchema, type TicketReplyInput } from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import { HelpService } from "./help.service.js";

/**
 * The private ticket link emailed to contact-form senders (/help/tickets/:id?k=…). No account:
 * the long random key in the link is what proves it's theirs.
 */
@Controller("tickets")
export class PublicTicketsController {
  constructor(
    private readonly help: HelpService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(":id")
  view(@Param("id", ParseUUIDPipe) id: string, @Query("k") key: string | undefined) {
    return this.help.viewPublic(id, key);
  }

  @Post(":id/reply")
  reply(
    @Req() req: Request,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("k") key: string | undefined,
    @Body(new ZodPipe(ticketReplySchema)) body: TicketReplyInput,
  ) {
    const ip = clientIp(req, this.env.INTERNAL_API_SECRET);
    return this.help.replyPublic(ip, id, key, body.message);
  }
}
