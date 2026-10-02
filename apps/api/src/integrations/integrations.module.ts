/**
 * Decides whether the app talks to the REAL Paystack/WhatsApp or to FAKES that just log.
 *
 * Services ask for PAYSTACK or WHATSAPP and get "something with the PaystackClient /
 * WhatsAppClient methods". They don't know or care which one, so the business logic is
 * identical with or without API keys. (Providers are explained in infra.module.ts.)
 */
import { payments } from "@gbam/db";
import {
  FakePaystackClient,
  FakeWhatsAppClient,
  HttpPaystackClient,
  HttpWhatsAppClient,
  type PaystackClient,
  type WhatsAppClient,
} from "@gbam/integrations";
import { Global, Inject, Logger, Module } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ENV, type Env } from "../env.js";
import { DB, type Db } from "../infra/infra.module.js";

export const PAYSTACK = Symbol("PAYSTACK");
export const WHATSAPP = Symbol("WHATSAPP");

/** Use in a constructor: `@InjectPaystack() private readonly paystack: PaystackClient` */
export function InjectPaystack() {
  return Inject(PAYSTACK);
}

/** Use in a constructor: `@InjectWhatsApp() private readonly whatsapp: WhatsAppClient` */
export function InjectWhatsApp() {
  return Inject(WHATSAPP);
}

export type { PaystackClient, WhatsAppClient };

function createPaystackClient(env: Env, db: Db): PaystackClient {
  if (env.PAYSTACK_SECRET_KEY) {
    return new HttpPaystackClient(env.PAYSTACK_SECRET_KEY);
  }

  const logger = new Logger("FakePaystack");
  logger.warn("PAYSTACK_SECRET_KEY not set: using fake Paystack");

  // The real Paystack remembers how much each payment was for. The fake can't, so we
  // give it this function to look the amount up in our payments table instead.
  async function lookupAmount(reference: string): Promise<number | undefined> {
    const rows = await db
      .select({ amountKobo: payments.amountKobo })
      .from(payments)
      .where(eq(payments.reference, reference));
    if (rows.length === 0) {
      return undefined;
    }
    return rows[0]?.amountKobo;
  }

  function log(message: string) {
    logger.log(message);
  }

  return new FakePaystackClient(lookupAmount, log);
}

function createWhatsAppClient(env: Env): WhatsAppClient {
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    return new HttpWhatsAppClient({
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      apiVersion: env.WHATSAPP_API_VERSION,
    });
  }

  const logger = new Logger("FakeWhatsApp");
  logger.warn("WhatsApp credentials not set: using fake WhatsApp");

  function log(message: string) {
    logger.log(message);
  }

  return new FakeWhatsAppClient(log);
}

@Global()
@Module({
  providers: [
    { provide: PAYSTACK, inject: [ENV, DB], useFactory: createPaystackClient },
    { provide: WHATSAPP, inject: [ENV], useFactory: createWhatsAppClient },
  ],
  exports: [PAYSTACK, WHATSAPP],
})
export class IntegrationsModule {}
