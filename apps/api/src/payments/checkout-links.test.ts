import { describe, expect, it } from "vitest";
import { accessCodeFrom, payPageUrl } from "./checkout-links.js";

describe("accessCodeFrom", () => {
  it("takes the access code from a Paystack checkout link", () => {
    expect(accessCodeFrom("https://checkout.paystack.com/0peioxfhpn")).toBe("0peioxfhpn");
  });

  it("gives null for links that aren't Paystack checkout pages", () => {
    expect(accessCodeFrom("https://pay.test/gbam_GB-1234_ab")).toBeNull();
    expect(accessCodeFrom("https://checkout.paystack.com/")).toBeNull();
    expect(accessCodeFrom("https://checkout.paystack.com/a/b")).toBeNull();
    expect(accessCodeFrom("not a url")).toBeNull();
  });
});

describe("payPageUrl", () => {
  it("links to our own review-and-pay page with the order's private key", () => {
    expect(payPageUrl("https://gbam.zephra.dev", "GB-7K3Q", "abc_123")).toBe(
      "https://gbam.zephra.dev/pay/GB-7K3Q?k=abc_123",
    );
  });
});
