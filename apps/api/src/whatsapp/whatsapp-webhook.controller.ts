import {
  readWhatsAppWebhook,
  verifyMetaSignature,
  whatsappWebhookSchema,
} from "@gbam/integrations";
import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request } from "express";
import { ENV, type Env } from "../env.js";
import { WhatsAppMessagesService } from "./whatsapp-messages.service.js";

/**
 * Meta → us. Set in the Meta app: Use cases → Connect on WhatsApp → Production setup →
 * Configure Webhooks. Callback URL = https://<public address>/webhooks/whatsapp.
 */
@Controller("webhooks/whatsapp")
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly messages: WhatsAppMessagesService,
  ) {}

  /**
   * Step 1: when you click "Verify and save", Meta calls this ONCE with your verify token
   * and a random "challenge". If the token matches ours, we send the challenge back,
   * which proves to Meta that this URL is really ours.
   */
  @Get()
  @Header("content-type", "text/plain")
  verify(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
  ): string {
    const expectedToken = this.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) {
      throw new ServiceUnavailableException("WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set");
    }
    if (mode !== "subscribe" || token !== expectedToken || !challenge) {
      throw new ForbiddenException("Verify token doesn't match");
    }
    this.logger.log("Meta verified the WhatsApp webhook");
    return challenge;
  }

  /** Step 2: from then on, Meta POSTs events here (status updates, incoming messages). */
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-hub-signature-256") signature?: string,
  ) {
    const appSecret = this.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      throw new ServiceUnavailableException("WHATSAPP_APP_SECRET is not set");
    }
    // Reject anything Meta didn't sign: otherwise anyone could fake "delivered" updates.
    if (!req.rawBody || !verifyMetaSignature(req.rawBody, signature, appSecret)) {
      throw new UnauthorizedException("Invalid signature");
    }

    const parsed = whatsappWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      // Still answer 200: otherwise Meta keeps retrying something we'll never understand.
      this.logger.warn("Signed WhatsApp webhook with unexpected shape; ignoring");
      return { received: true };
    }

    const { statusUpdates, incomingMessages } = readWhatsAppWebhook(parsed.data);

    for (const update of statusUpdates) {
      await this.messages.applyStatusUpdate(update);
    }
    for (const message of incomingMessages) {
      // Customer replies. Not handled yet: logged so you can see them arrive.
      this.logger.log(`Incoming WhatsApp from +${message.from}: ${message.text}`);
    }

    return { received: true };
  }
}
