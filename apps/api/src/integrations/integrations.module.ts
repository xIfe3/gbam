/**
 * Decides whether the app talks to the REAL Paystack/WhatsApp or to FAKES that just log.
 *
 * Services ask for PAYSTACK or WHATSAPP and get "something with the PaystackClient /
 * WhatsAppClient methods". They don't know or care which one, so the business logic is
 * identical with or without API keys. (Providers are explained in infra.module.ts.)
 */
import { payments } from "@gbam/db";
import {
  FakeEmailClient,
  FakePaystackClient,
  FakeWhatsAppClient,
  HttpPaystackClient,
  HttpWhatsAppClient,
  LocalPhotoStorage,
  R2PhotoStorage,
  ResendEmailClient,
  type EmailClient,
  type PaystackClient,
  type PhotoStorage,
  type WhatsAppClient,
} from "@gbam/integrations";
import { Global, Inject, Logger, Module } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ENV, type Env } from "../env.js";
import { DB, type Db } from "../infra/infra.module.js";

export const PAYSTACK = Symbol("PAYSTACK");
export const WHATSAPP = Symbol("WHATSAPP");
export const EMAIL = Symbol("EMAIL");
export const PHOTO_STORAGE = Symbol("PHOTO_STORAGE");

/** Use in a constructor: `@InjectPaystack() private readonly paystack: PaystackClient` */
export function InjectPaystack() {
  return Inject(PAYSTACK);
}

/** Use in a constructor: `@InjectWhatsApp() private readonly whatsapp: WhatsAppClient` */
export function InjectWhatsApp() {
  return Inject(WHATSAPP);
}

/** Use in a constructor: `@InjectEmail() private readonly email: EmailClient` */
export function InjectEmail() {
  return Inject(EMAIL);
}

/** Use in a constructor: `@InjectPhotoStorage() private readonly photos: PhotoStorage` */
export function InjectPhotoStorage() {
  return Inject(PHOTO_STORAGE);
}

export type { EmailClient, PaystackClient, PhotoStorage, WhatsAppClient };

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

function createEmailClient(env: Env): EmailClient {
  if (env.RESEND_API_KEY) {
    return new ResendEmailClient(env.RESEND_API_KEY, env.EMAIL_FROM);
  }

  const logger = new Logger("FakeEmail");
  logger.warn("RESEND_API_KEY not set: using fake email");

  function log(message: string) {
    logger.log(message);
  }

  return new FakeEmailClient(log);
}

function createPhotoStorage(env: Env): PhotoStorage {
  // The checks are written out (not stored in a variable) so TypeScript knows each value
  // is a string inside the block.
  if (
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET &&
    env.PHOTOS_PUBLIC_URL
  ) {
    return new R2PhotoStorage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
      publicBaseUrl: env.PHOTOS_PUBLIC_URL,
    });
  }

  const logger = new Logger("LocalPhotoStorage");
  logger.warn("R2 settings not set: saving photos to a local folder");

  let publicBaseUrl = `http://localhost:${env.PORT}/photos`;
  if (env.PHOTOS_PUBLIC_URL) {
    publicBaseUrl = env.PHOTOS_PUBLIC_URL;
  }
  return new LocalPhotoStorage(env.PHOTOS_LOCAL_DIR, publicBaseUrl);
}

@Global()
@Module({
  providers: [
    { provide: PAYSTACK, inject: [ENV, DB], useFactory: createPaystackClient },
    { provide: WHATSAPP, inject: [ENV], useFactory: createWhatsAppClient },
    { provide: EMAIL, inject: [ENV], useFactory: createEmailClient },
    { provide: PHOTO_STORAGE, inject: [ENV], useFactory: createPhotoStorage },
  ],
  exports: [PAYSTACK, WHATSAPP, EMAIL, PHOTO_STORAGE],
})
export class IntegrationsModule {}
