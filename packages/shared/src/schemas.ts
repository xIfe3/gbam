import { z } from "zod";
import { ORDER_STATUSES } from "./order-state";

/** Money is always integer kobo (₦1 = 100 kobo). Never floats. */
export const koboSchema = z.number().int().nonnegative();

/** E.164 without the plus, as WhatsApp Cloud API sends it, e.g. "2348012345678". */
export const whatsappPhoneSchema = z.string().regex(/^\d{10,15}$/, "Invalid phone number");

/** Lowercase URL-safe handle for the tenant storefront, e.g. gbam.app/s/{slug}. */
export const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  priceKobo: koboSchema,
  stock: z.number().int().nonnegative().nullable().default(null),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const createOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: whatsappPhoneSchema,
  }),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  note: z.string().trim().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
