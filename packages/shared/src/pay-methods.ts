import { z } from "zod";

/**
 * The banks whose USSD codes Paystack takes payments from. Checked against Paystack's test
 * mode in October 2026 (Sterling, Fidelity and others were refused). Add a bank only after
 * Paystack accepts it.
 */
export const USSD_BANKS = [
  { code: "737", name: "GTBank" },
  { code: "919", name: "UBA" },
  { code: "966", name: "Zenith Bank" },
] as const;

export type UssdBankCode = (typeof USSD_BANKS)[number]["code"];

const USSD_BANK_CODES = ["737", "919", "966"] as const satisfies readonly UssdBankCode[];

export function ussdBankName(code: UssdBankCode): string {
  for (const bank of USSD_BANKS) {
    if (bank.code === code) {
      return bank.name;
    }
  }
  return code;
}

/**
 * How the customer wants to pay on our own screen. Card isn't here: cards always go
 * through Paystack's pop-up, so card numbers never pass through gbam.
 * (A Zod "discriminated union": `method` decides which other fields must be there.)
 */
export const directPaySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("bank_transfer") }),
  z.object({ method: z.literal("ussd"), bank: z.enum(USSD_BANK_CODES) }),
]);

export type DirectPayChoice = z.infer<typeof directPaySchema>;
