import { describe, expect, it } from "vitest";
import { directPaySchema, USSD_BANKS, ussdBankName } from "./pay-methods";

describe("directPaySchema", () => {
  it("accepts a transfer, or USSD with a bank we support", () => {
    expect(directPaySchema.parse({ method: "bank_transfer" })).toEqual({ method: "bank_transfer" });
    expect(directPaySchema.parse({ method: "ussd", bank: "737" })).toEqual({
      method: "ussd",
      bank: "737",
    });
  });

  it("refuses USSD without a bank, a bank Paystack doesn't support, and card", () => {
    expect(directPaySchema.safeParse({ method: "ussd" }).success).toBe(false);
    expect(directPaySchema.safeParse({ method: "ussd", bank: "822" }).success).toBe(false);
    expect(directPaySchema.safeParse({ method: "card" }).success).toBe(false);
  });
});

describe("USSD_BANKS", () => {
  it("lists the banks Paystack takes USSD payments from, by name", () => {
    const codes: string[] = [];
    for (const bank of USSD_BANKS) {
      codes.push(bank.code);
    }
    expect(codes).toEqual(["737", "919", "966"]);
    expect(ussdBankName("966")).toBe("Zenith Bank");
  });
});
