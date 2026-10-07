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
 * Add any new top-level route in apps/web/app here too (apps/web/app/reserved-slugs.test.ts
 * fails if one is missing).
 */
export const RESERVED_SLUGS = new Set([
  "about",
  "acceptable-use",
  "admin",
  "api",
  "app",
  "apple-icon",
  "auth",
  "billing",
  "blog",
  "changelog",
  "contact",
  "cookies",
  "dashboard",
  "data-deletion",
  "docs",
  "faq",
  "features",
  "forgot-password",
  "gbam",
  "help",
  "how-it-works",
  "icon",
  "legal",
  "login",
  "logout",
  "mission",
  "opengraph-image",
  "orders",
  "pricing",
  "privacy",
  "refunds",
  "register",
  "reset-password",
  "security",
  "seller-agreement",
  "settings",
  "signin",
  "signup",
  "static",
  "status",
  "storefront",
  "support",
  "terms",
  "track",
  "twitter-image",
  "use-cases",
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

/** Trimmed, lowercased, valid email. Lowercasing makes "Ada@X.com" and "ada@x.com" match. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const createOrderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: nigerianPhoneSchema,
    /** Optional: we email a receipt with the order code and tracking link. */
    email: emailSchema.optional(),
  }),
  items: z
    .array(
      z.object({
        variantId: z.uuid(),
        quantity: z.number().int().positive().max(99),
      }),
    )
    .min(1),
  note: z.string().trim().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** "gb-7b2q " → "GB-7B2Q". Order codes use 2–9 and A–Z (no 0/1/O/I, which look alike). */
export const orderCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^GB-[2-9A-Z]{4}$/, "Order codes look like GB-7B2Q");

/** The /track form: the order code plus the last 4 digits of the phone used to order. */
export const trackLookupSchema = z.object({
  code: orderCodeSchema,
  phoneLast4: z.string().trim().regex(/^\d{4}$/, "Enter the last 4 digits of your phone number"),
});
export type TrackLookupInput = z.infer<typeof trackLookupSchema>;

export const ISSUE_REASONS = ["paid_not_marked", "not_received", "wrong_or_damaged", "other"] as const;
export type IssueReason = (typeof ISSUE_REASONS)[number];

/** What each reason says, for the customer's form and the seller's dashboard and email. */
export const ISSUE_REASON_LABEL: Record<IssueReason, string> = {
  paid_not_marked: "Paid but it shows unpaid",
  not_received: "Haven't received my order",
  wrong_or_damaged: "Wrong or damaged item",
  other: "Something else",
};

export const reportIssueSchema = z.object({
  reason: z.enum(ISSUE_REASONS),
  note: z.string().trim().max(500).optional(),
});
export type ReportIssueInput = z.infer<typeof reportIssueSchema>;

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;


/** Max 200 stops someone sending a huge string to make the Argon2 hash do heavy work. */
export const passwordSchema = z.string().min(8).max(200);

/** The 6-digit code we email for verification and password reset. */
export const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

export const signupSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  slug: slugSchema,
  phone: nigerianPhoneSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.output<typeof signupSchema>;

/**
 * Login checks only that a password was typed (and caps its size for the same Argon2
 * reason as above). The signup policy is for new passwords, so it is not applied here.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.output<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.output<typeof forgotPasswordSchema>;

/** The new password must meet the signup policy. */
/**
 * `requestId` is what forgot-password returned to this browser. The reset code only works
 * together with it, so someone who knows just the email can't use or burn the code.
 */
export const resetPasswordSchema = z.object({
  email: emailSchema,
  requestId: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Start the reset again"),
  code: codeSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;

export const contactMessageSchema = z.object({
  // Single line: the name goes into the subject of the email we send ourselves, so a
  // newline could inject extra email headers.
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\r\n]*$/, "Name must be on one line"),
  email: emailSchema,
  phone: nigerianPhoneSchema.optional(),
  message: z.string().trim().min(10).max(3000),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

/**
 * A seller's payout bank account. `bankCode` is Paystack's code from the bank list (letters
 * and digits, e.g. "058" or "MFB50094"). Nigerian account numbers (NUBAN) are 10 digits.
 */
export const payoutAccountSchema = z.object({
  bankCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,20}$/, "Choose your bank from the list"),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Enter your 10-digit account number"),
});
export type PayoutAccountInput = z.output<typeof payoutAccountSchema>;
