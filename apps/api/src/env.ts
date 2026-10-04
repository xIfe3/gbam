import { z } from "zod";

/**
 * An optional setting. A line like `PAYSTACK_SECRET_KEY=` (empty) in .env gives us "",
 * which we turn into undefined so it counts as "not set".
 */
const optional = z
  .string()
  .optional()
  .transform((value) => {
    if (value === "") {
      return undefined;
    }
    return value;
  });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    /** Public URL of apps/web; Paystack sends customers back here after paying. */
    WEB_URL: z.url().default("http://localhost:3000"),

    // Integrations. Unset in dev → fakes that log instead of calling Paystack/Meta.
    PAYSTACK_SECRET_KEY: optional,
    WHATSAPP_ACCESS_TOKEN: optional,
    WHATSAPP_PHONE_NUMBER_ID: optional,
    /** Meta app → App settings → Basic → App secret. Used to check webhook signatures. */
    WHATSAPP_APP_SECRET: optional,
    /** Any random string you choose; paste the same value into Meta's webhook form. */
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: optional,
    WHATSAPP_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default("v25.0"),
    /** Resend API key (resend.com). Unset in dev → emails are logged, not sent. */
    RESEND_API_KEY: optional,
    /** The default is fine once gbam.app is verified in Resend. */
    EMAIL_FROM: z.string().min(1).default("Gbam <no-reply@gbam.app>"),
    /**
     * Shared secret between apps/web and the API (long random string, same value in both).
     * Only requests carrying it may tell us the visitor's IP via x-client-ip; see
     * common/client-ip.ts. Unset in dev → x-client-ip is ignored.
     */
    INTERNAL_API_SECRET: optional,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    // Production must never silently run on fakes.
    for (const key of [
      "PAYSTACK_SECRET_KEY",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      "RESEND_API_KEY",
      "INTERNAL_API_SECRET",
    ] as const) {
      if (!env[key])
        ctx.addIssue({ code: "custom", path: [key], message: "Required in production" });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parsed once at boot. Fails fast with every missing/invalid var listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * Secret used to sign/verify Paystack webhooks. Paystack signs with your secret key;
 * in keyless dev, `pnpm simulate:payment` signs with this fixed stand-in instead.
 */
export function paystackWebhookSecret(env: Env): string {
  return env.PAYSTACK_SECRET_KEY ?? "dev-fake-paystack-secret";
}

export const ENV = Symbol("ENV");
