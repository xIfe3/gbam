import { describe, expect, it } from "vitest";
import { deliverySettingsSchema, orderDeliverySchema } from "./delivery";

const lekki = { name: "Lekki / VI", feeKobo: 250_000, isPickup: false };

describe("deliverySettingsSchema", () => {
  it("accepts a valid zone list", () => {
    const result = deliverySettingsSchema.safeParse({
      zones: [lekki, { name: "Pickup from shop", feeKobo: 0, isPickup: true }],
      pickupNote: "Shop 12, Balogun Market",
    });
    expect(result.success).toBe(true);
  });

  it("duplicate names refused ignoring case and spaces", () => {
    const result = deliverySettingsSchema.safeParse({
      zones: [{ ...lekki, name: "Lekki" }, { ...lekki, name: " lekki" }],
      pickupNote: null,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["zones"]);
  });

  it("refuses 21 zones", () => {
    const zones = [];
    for (let i = 0; i < 21; i++) {
      zones.push({ ...lekki, name: `Zone ${i}` });
    }
    expect(deliverySettingsSchema.safeParse({ zones, pickupNote: null }).success).toBe(false);
  });

  it("refuses a fee that isn't whole naira", () => {
    const result = deliverySettingsSchema.safeParse({
      zones: [{ ...lekki, feeKobo: 150_050 }],
      pickupNote: null,
    });
    expect(result.success).toBe(false);
  });

  it("blank pickup note becomes null", () => {
    const result = deliverySettingsSchema.parse({ zones: [lekki], pickupNote: "   " });
    expect(result.pickupNote).toBeNull();
  });
});

describe("orderDeliverySchema", () => {
  it("blank address and landmark become null", () => {
    const result = orderDeliverySchema.parse({
      zoneId: null,
      expectedFeeKobo: null,
      address: "  ",
      landmark: "",
    });
    expect(result.address).toBeNull();
    expect(result.landmark).toBeNull();
  });

  it("address longer than 300 refused", () => {
    const result = orderDeliverySchema.safeParse({
      zoneId: null,
      expectedFeeKobo: null,
      address: "x".repeat(301),
      landmark: null,
    });
    expect(result.success).toBe(false);
  });
});
