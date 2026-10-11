import type { PaymentMethod } from "@gbam/db";

/** Paystack's channel names (from its verify reply) → words a customer understands. */
const CHANNEL_LABELS: Record<string, string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  ussd: "USSD",
  bank: "Bank account",
  qr: "QR code",
  mobile_money: "Mobile money",
  apple_pay: "Apple Pay",
};

/**
 * How a payment was made, for the customer's "Payment confirmed" email. null when we can't
 * tell (better no line than a wrong one).
 *
 * Our own pay screens know their method. For Paystack's pop-up the customer picked inside
 * Paystack, so we read ONLY `channel` from Paystack's saved reply: the rest of it can hold
 * card details and must never reach an email or a log.
 */
export function paymentMethodLabel(method: PaymentMethod, raw: unknown): string | null {
  if (method === "bank_transfer") {
    return "Bank transfer";
  }
  if (method === "ussd") {
    return "USSD";
  }
  if (typeof raw !== "object" || raw === null || !("channel" in raw)) {
    return null;
  }
  const channel = (raw as { channel: unknown }).channel;
  if (typeof channel !== "string") {
    return null;
  }
  const label = CHANNEL_LABELS[channel];
  if (label === undefined) {
    return null;
  }
  return label;
}
