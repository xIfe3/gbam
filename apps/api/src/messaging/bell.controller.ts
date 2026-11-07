import { NOTIFICATION_TYPES } from "@gbam/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { SellerNotificationsService } from "./seller-notifications.service.js";

const pageQuerySchema = z.object({
  tab: z.enum(["all", "unread", "trash"]).default("all"),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const bulkSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  action: z.enum(["read", "unread", "trash", "restore"]),
});

/**
 * The bell in the seller dashboard, and the notifications page behind it.
 * (Not /notifications: that name is the WhatsApp queue's.)
 */
@Controller("bell")
@UseGuards(SessionGuard)
export class BellController {
  constructor(private readonly notifications: SellerNotificationsService) {}

  @Get()
  list(@CurrentSellerId() sellerId: string) {
    return this.notifications.listFor(sellerId);
  }

  // The fixed paths below are declared before the ":id" ones, so "all", "bulk" and
  // "read-all" are never read as an id.

  /** The notifications page: All, Unread or Trash, by type and words. */
  @Get("all")
  page(
    @CurrentSellerId() sellerId: string,
    @Query(new ZodPipe(pageQuerySchema)) query: z.output<typeof pageQuerySchema>,
  ) {
    return this.notifications.page(sellerId, query);
  }

  /** The banners and modals the dashboard shows right now. */
  @Get("notices")
  notices(@CurrentSellerId() sellerId: string) {
    return this.notifications.noticesFor(sellerId);
  }

  @Post("read-all")
  @HttpCode(200)
  readAll(@CurrentSellerId() sellerId: string) {
    return this.notifications.markAllRead(sellerId);
  }

  @Post("bulk")
  @HttpCode(200)
  bulk(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(bulkSchema)) body: z.output<typeof bulkSchema>,
  ) {
    return this.notifications.bulk(sellerId, body.ids, body.action);
  }

  @Post("trash/empty")
  @HttpCode(200)
  emptyTrash(@CurrentSellerId() sellerId: string) {
    return this.notifications.emptyTrash(sellerId);
  }

  @Get(":id")
  one(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.one(sellerId, id);
  }

  @Post(":id/read")
  @HttpCode(200)
  read(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.markRead(sellerId, id);
  }

  /** "Got it" on a banner, "I understand" on a modal: it never shows again. */
  @Post(":id/acknowledge")
  @HttpCode(200)
  acknowledge(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.acknowledge(sellerId, id);
  }

  /** "Hide" on a banner: back the next day. */
  @Post(":id/hide")
  @HttpCode(200)
  hide(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.hideBanner(sellerId, id);
  }

  @Post(":id/unread")
  @HttpCode(200)
  unread(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.markUnread(sellerId, id);
  }

  @Post(":id/trash")
  @HttpCode(200)
  trash(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.trash(sellerId, id);
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.restore(sellerId, id);
  }

  /** For good: only from the trash. */
  @Delete(":id")
  @HttpCode(200)
  remove(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.deleteForever(sellerId, id);
  }
}
