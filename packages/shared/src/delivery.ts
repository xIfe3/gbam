import { z } from "zod";

export const DELIVERY_LIMITS = {
  maxZones: 20,
  nameMax: 60,
  pickupNoteMax: 300,
  addressMin: 5,
  addressMax: 300,
  landmarkMax: 200,
};

/**
 * Optional text: trims it, and turns "" (an empty box) into null so the database stores
 * "nothing" rather than an empty string.
 */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => {
      if (value === null || value === "") {
        return null;
      }
      return value;
    });
}

/** One delivery zone as the seller saves it. `id` is missing for a zone they just added. */
export const deliveryZoneInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the zone a name").max(DELIVERY_LIMITS.nameMax),
  feeKobo: z
    .number()
    .int()
    .min(0)
    .max(100_000_000, "That fee is too high")
    // Whole naira only, like product prices: 100 kobo = ₦1.
    .refine((kobo) => kobo % 100 === 0, "Use whole naira for the fee"),
  isPickup: z.boolean(),
});
export type DeliveryZoneInput = z.output<typeof deliveryZoneInputSchema>;

/** Settings → Delivery: the whole list of zones (in the order shown) and the pickup note. */
export const deliverySettingsSchema = z.object({
  zones: z
    .array(deliveryZoneInputSchema)
    .max(DELIVERY_LIMITS.maxZones, `At most ${DELIVERY_LIMITS.maxZones} delivery zones`)
    .refine((zones) => {
      // Names must be different, ignoring capitals ("Lekki" and "lekki" clash).
      const seen = new Set<string>();
      for (const zone of zones) {
        const key = zone.name.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
      }
      return true;
    }, "Each zone needs a different name"),
  pickupNote: optionalText(DELIVERY_LIMITS.pickupNoteMax),
});
export type DeliverySettingsInput = z.output<typeof deliverySettingsSchema>;

/**
 * What checkout sends about delivery. Only the zone's id and the fee the customer saw: the
 * real fee is always read from the database.
 */
export const orderDeliverySchema = z.object({
  zoneId: z.uuid().nullable(),
  expectedFeeKobo: z.number().int().min(0).nullable(),
  address: optionalText(DELIVERY_LIMITS.addressMax),
  landmark: optionalText(DELIVERY_LIMITS.landmarkMax),
});
export type OrderDeliveryInput = z.output<typeof orderDeliverySchema>;
