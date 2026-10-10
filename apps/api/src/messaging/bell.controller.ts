import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { SellerNotificationsService } from "./seller-notifications.service.js";

/** The bell in the seller dashboard. (Not /notifications: that name is the WhatsApp queue's.) */
@Controller("bell")
@UseGuards(SessionGuard)
export class BellController {
  constructor(private readonly notifications: SellerNotificationsService) {}

  @Get()
  list(@CurrentSellerId() sellerId: string) {
    return this.notifications.listFor(sellerId);
  }

  /** Declared before ":id" so "read-all" isn't read as an id. */
  @Post("read-all")
  @HttpCode(200)
  readAll(@CurrentSellerId() sellerId: string) {
    return this.notifications.markAllRead(sellerId);
  }

  @Post(":id/read")
  @HttpCode(200)
  read(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.markRead(sellerId, id);
  }
}
