/**
 * Dev tool: pretend the customer paid. Sends a correctly signed `charge.success`
 * webhook for the order's payment link to the running API, exactly as Paystack would.
 *
 *   pnpm simulate:payment GB-7K3Q
 *
 * Works with the fake Paystack (no keys). With a real sk_test key, prefer paying on the
 * actual Paystack test checkout page so the transaction really exists there.
 */
import { createDb, orders, payments } from "@gbam/db";
import { signPaystackPayload } from "@gbam/integrations";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { loadEnv, paystackWebhookSecret } from "../env.js";

const code = process.argv[2]?.toUpperCase();
if (!code) {
  console.error("Usage: pnpm simulate:payment <order code, e.g. GB-7K3Q>");
  process.exit(1);
}

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Refusing to simulate payments in production");

const { db, close } = createDb(env.DATABASE_URL, { max: 1 });
try {
  const [payment] = await db
    .select({ reference: payments.reference, amountKobo: payments.amountKobo })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(orders.code, code), isNotNull(payments.authorizationUrl)))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  if (!payment) {
    console.error(`No payment link for ${code}. Tap "Request payment" on the order first.`);
    process.exitCode = 1;
  } else {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: payment.reference, amount: payment.amountKobo, currency: "NGN" },
    });
    const res = await fetch(`http://localhost:${env.PORT}/webhooks/paystack`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paystack-signature": signPaystackPayload(body, paystackWebhookSecret(env)),
      },
      body,
    });
    console.log(`Webhook for ${payment.reference} → ${res.status} ${await res.text()}`);
    console.log("The worker will now verify it and mark the order paid.");
  }
} finally {
  await close();
}
