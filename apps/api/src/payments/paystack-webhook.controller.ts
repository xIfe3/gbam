import { paystackWebhookSchema, verifyPaystackSignature } from "@gbam/integrations";
import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request } from "express";
import { ENV, paystackWebhookSecret, type Env } from "../env.js";
import { PaymentsQueue } from "./payments.queue.js";

/**
 * Paystack → us. Only verifies and enqueues, so it answers in milliseconds; the worker
 * does the real work. Paystack retries anything that isn't a 200.
 */
@Controller("webhooks/paystack")
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly queue: PaymentsQueue,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-paystack-signature") signature?: string,
  ) {
    // Signature is over the exact raw bytes (main.ts enables rawBody).
    if (
      !req.rawBody ||
      !verifyPaystackSignature(req.rawBody, signature, paystackWebhookSecret(this.env))
    ) {
      throw new UnauthorizedException("Invalid signature");
    }

    const event = paystackWebhookSchema.safeParse(req.body);
    if (!event.success) {
      this.logger.warn("Signed Paystack webhook with unexpected shape; ignoring");
      return { received: true };
    }
    if (event.data.event === "charge.success") {
      await this.queue.confirm(event.data.data.reference);
    }
    // Other events (transfers, refunds…) are acknowledged so Paystack stops retrying.
    return { received: true };
  }
}
