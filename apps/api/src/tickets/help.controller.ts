import {
  newTicketSchema,
  ticketReplySchema,
  type NewTicketInput,
  type TicketReplyInput,
} from "@gbam/shared";
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { HelpService } from "./help.service.js";

/** The seller dashboard's Help pages: their tickets with Gbam support. */
@Controller()
@UseGuards(SessionGuard)
export class HelpController {
  constructor(private readonly help: HelpService) {}

  @Get("help/tickets")
  list(@CurrentSellerId() sellerId: string) {
    return this.help.listForSeller(sellerId);
  }

  @Post("help/tickets")
  open(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(newTicketSchema)) body: NewTicketInput,
  ) {
    return this.help.openForSeller(sellerId, body);
  }

  @Get("help/tickets/:id")
  view(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.help.viewForSeller(sellerId, id);
  }

  @Post("help/tickets/:id/reply")
  reply(
    @CurrentSellerId() sellerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ticketReplySchema)) body: TicketReplyInput,
  ) {
    return this.help.replyForSeller(sellerId, id, body.message);
  }

  /** "Ask Gbam to help" on a customer's problem report. */
  @Post("orders/:id/issues/:issueId/escalate")
  escalate(
    @CurrentSellerId() sellerId: string,
    @Param("id", ParseUUIDPipe) orderId: string,
    @Param("issueId", ParseUUIDPipe) issueId: string,
    @Body(new ZodPipe(ticketReplySchema)) body: TicketReplyInput,
  ) {
    return this.help.escalate(sellerId, orderId, issueId, body.message);
  }
}
