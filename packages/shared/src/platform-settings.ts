import { z } from "zod";
import { PLATFORM_FEE } from "./fees";

/**
 * Values the admin area can change without a deploy (Admin → Settings). Stored in the
 * platform_settings table; until someone saves, these defaults apply.
 */
export const platformSettingsSchema = z
  .object({
    /** Gbam's cut in basis points: 150 = 1.5%. At most 5%. */
    feePercentBasisPoints: z.number().int().min(0).max(500, "At most 5%"),
    /** The most Gbam takes from one order, in kobo. */
    feeCapKobo: z.number().int().min(0).max(1_000_000, "At most ₦10,000"),
    /** Pre-fills the admin's fee-waiver date: today + this many days. */
    foundingWaiverDays: z.number().int().min(1).max(730),
    /** Unpaid orders: one WhatsApp reminder after this many hours... */
    reminderAfterHours: z.number().int().min(1).max(168),
    /** ...and cancelled after this many. */
    cancelAfterHours: z.number().int().min(2).max(336),
    supportEmail: z.email("Enter an email address"),
    contactEmail: z.email("Enter an email address"),
    privacyEmail: z.email("Enter an email address"),
    /** Gbam's WhatsApp number for the contact page, digits only. Empty hides the link. */
    whatsappNumber: z
      .string()
      .trim()
      .nullable()
      .transform((value) => {
        if (value === null || value === "") {
          return null;
        }
        return value;
      })
      .pipe(
        z
          .string()
          .regex(/^\d{10,15}$/, "Digits only, like 2348012345678")
          .nullable(),
      ),
    /** Off = the sign-up page says sign-ups are paused. */
    signupsOpen: z.boolean(),
  })
  .refine((settings) => settings.reminderAfterHours < settings.cancelAfterHours, {
    message: "The reminder must come before the order is cancelled",
    path: ["reminderAfterHours"],
  });
export type PlatformSettings = z.output<typeof platformSettingsSchema>;

/** Today's values, used until an admin saves different ones. */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  feePercentBasisPoints: PLATFORM_FEE.percentBasisPoints,
  feeCapKobo: PLATFORM_FEE.capKobo,
  foundingWaiverDays: 90,
  reminderAfterHours: 24,
  cancelAfterHours: 48,
  supportEmail: "support@gbam.app",
  contactEmail: "hello@gbam.app",
  privacyEmail: "privacy@gbam.app",
  whatsappNumber: null,
  signupsOpen: true,
};

/**
 * Maintenance mode (superadmin only):
 * - "full": the whole site shows the maintenance page (the admin area still works).
 * - "pause": shops stay visible, but no new orders, payments or seller sign-ins.
 * Payment webhooks and background jobs keep running either way.
 */
export const maintenanceSchema = z.object({
  level: z.enum(["off", "full", "pause"]),
  message: z.string().trim().max(300).nullable(),
  /** When we expect to be back, shown on the maintenance page. */
  backBy: z.iso.datetime({ offset: true }).nullable(),
});
export type Maintenance = z.output<typeof maintenanceSchema>;

export const MAINTENANCE_OFF: Maintenance = { level: "off", message: null, backBy: null };

/** What anyone may know (GET /platform/public): used by the website on every page. */
export type PublicPlatformInfo = {
  whatsappNumber: string | null;
  signupsOpen: boolean;
  feePercentBasisPoints: number;
  feeCapKobo: number;
  maintenance: Maintenance;
};
