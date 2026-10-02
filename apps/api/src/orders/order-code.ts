import { randomInt } from "node:crypto";

// No 0/O/1/I/L so codes survive being read out over a WhatsApp voice note.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** e.g. "GB-7K3Q". Unique per seller (enforced by orders_seller_code_uq). */
export function generateOrderCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `GB-${code}`;
}
