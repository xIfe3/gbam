import { z } from "zod";

/** draft → scheduled (optional) → sending → sent. A draft or scheduled one can be cancelled. */
export const ANNOUNCEMENT_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const NOTIFICATION_TYPES = ["info", "warning", "action"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  info: "Info",
  warning: "Warning",
  action: "Action needed",
};

/**
 * Which sellers a message goes to. Every field narrows it; none at all means every seller.
 * Suspended and closed shops are always left out (that's done where it's resolved).
 */
export const audienceSchema = z.object({
  /** Just this one shop. */
  shopId: z.uuid().optional(),
  verified: z.boolean().optional(),
  hasProducts: z.boolean().optional(),
  hasBank: z.boolean().optional(),
  /** No paid order in the last N days (including never). */
  noOrderDays: z.int().min(1).max(365).optional(),
  signedUpFrom: z.iso.date().optional(),
  signedUpTo: z.iso.date().optional(),
});
export type Audience = z.output<typeof audienceSchema>;

const httpsUrl = z.url({ protocol: /^https$/, message: "Use a full https:// link" });

/** An email announcement (sellers only). The body uses simple formatting, see the editor. */
export const announcementSchema = z
  .object({
    subject: z.string().trim().min(3, "Write a subject").max(150),
    body: z.string().trim().min(1, "Write the message").max(10_000),
    buttonLabel: z.string().trim().max(40).optional(),
    buttonUrl: httpsUrl.optional(),
    audience: audienceSchema,
  })
  // A button needs both: what it says and where it goes.
  .refine((value) => Boolean(value.buttonLabel) === Boolean(value.buttonUrl), {
    message: "A button needs both a label and a link",
    path: ["buttonUrl"],
  });
export type AnnouncementInput = z.output<typeof announcementSchema>;

/** "Send" or "Schedule": the admin types how many sellers it goes to, as a check. */
export const sendAnnouncementSchema = z.object({
  confirmCount: z.int().min(0),
  /** Empty = send now. */
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
});
export type SendAnnouncementInput = z.output<typeof sendAnnouncementSchema>;

/** An in-app notification for the bell in the seller dashboard. */
export const notificationSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().trim().min(1, "Write a title").max(80, "Keep the title under 80 characters"),
  body: z.string().trim().min(1, "Write the text").max(300, "Keep it under 300 characters"),
  /** Optional: a dashboard page it opens, like /dashboard/settings. */
  link: z
    .string()
    .trim()
    .regex(
      /^\/dashboard(\/[A-Za-z0-9/_?=&.-]*)?$/,
      "Use a dashboard page, like /dashboard/settings",
    )
    .optional(),
  /** Optional: stop showing it after this time. */
  endsAt: z.iso.datetime({ offset: true }).optional(),
  audience: audienceSchema,
  confirmCount: z.int().min(0),
});
export type NotificationInput = z.output<typeof notificationSchema>;
