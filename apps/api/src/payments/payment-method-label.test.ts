import { describe, expect, it } from "vitest";
import { paymentMethodLabel } from "./payment-method-label.js";

describe("paymentMethodLabel", () => {
  it("our own pay screens say what they were", () => {
    expect(paymentMethodLabel("bank_transfer", null)).toBe("Bank transfer");
    expect(paymentMethodLabel("ussd", null)).toBe("USSD");
  });

  it("Paystack's pop-up: the channel Paystack reported", () => {
    expect(
      paymentMethodLabel("checkout", { channel: "card", authorization: { last4: "4081" } }),
    ).toBe("Card");
    expect(paymentMethodLabel("checkout", { channel: "bank_transfer" })).toBe("Bank transfer");
    expect(paymentMethodLabel("checkout", { channel: "ussd" })).toBe("USSD");
    expect(paymentMethodLabel("checkout", { channel: "bank" })).toBe("Bank account");
  });

  it("can't tell: no label rather than a guess", () => {
    expect(paymentMethodLabel("checkout", null)).toBeNull();
    expect(paymentMethodLabel("checkout", { channel: 42 })).toBeNull();
    expect(paymentMethodLabel("checkout", { channel: "something_new" })).toBeNull();
    expect(paymentMethodLabel("checkout", "not an object")).toBeNull();
  });
});
