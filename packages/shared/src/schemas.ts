import { z } from "zod";
import { normalizeNigerianPhone } from "./format";
import { ORDER_STATUSES } from "./order-state";

/** Money is always integer kobo (₦1 = 100 kobo). Never floats. */
export const koboSchema = z.number().int().nonnegative();

/** Accepts "0803…", "+234 803…" etc. and outputs "234803…". Nigeria-only for now. */
export const nigerianPhoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizeNigerianPhone(value);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: "Enter a valid Nigerian phone number" });
    return z.NEVER;
  }
  return phone;
});

/** E.164 without the plus, as WhatsApp Cloud API sends it, e.g. "2348012345678". */
export const whatsappPhoneSchema = z.string().regex(/^\d{10,15}$/, "Invalid phone number");

/**
 * Storefronts live at gbam.app/{slug}, so a slug must never shadow an app route.
 * Add any new top-level route in apps/web/app here too.
 */
export const RESERVED_SLUGS = new Set([
  "about",
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "blog",
  "dashboard",
  "docs",
  "gbam",
  "help",
  "login",
  "logout",
  "orders",
  "pricing",
  "privacy",
  "register",
  "settings",
  "signin",
  "signup",
  "static",
  "status",
  "storefront",
  "support",
  "terms",
  "www",
]);

/** Lowercase URL-safe handle for the tenant storefront, e.g. gbam.app/{slug}. */
export const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens")
  .refine((slug) => !RESERVED_SLUGS.has(slug), "That name is reserved");

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
    phone: nigerianPhoneSchema,
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
