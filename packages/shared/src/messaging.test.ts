import { describe, expect, it } from "vitest";
import {
  announcementSchema,
  audienceSchema,
  notificationSchema,
  sendAnnouncementSchema,
} from "./messaging";
import { emailSettingsSchema } from "./schemas";

describe("messaging schemas", () => {
  it("an empty audience means everyone", () => {
    expect(audienceSchema.parse({})).toEqual({});
    expect(audienceSchema.safeParse({ noOrderDays: 0 }).success).toBe(false);
    expect(audienceSchema.safeParse({ shopId: "not-an-id" }).success).toBe(false);
  });

  it("an announcement's button needs both a label and an https link", () => {
    const base = { subject: "New: delivery zones", body: "Hello sellers", audience: {} };
    expect(announcementSchema.safeParse(base).success).toBe(true);
    expect(announcementSchema.safeParse({ ...base, buttonLabel: "Open" }).success).toBe(false);
    expect(
      announcementSchema.safeParse({ ...base, buttonLabel: "Open", buttonUrl: "http://x.com" })
        .success,
    ).toBe(false);
    expect(
      announcementSchema.safeParse({
        ...base,
        buttonLabel: "Open",
        buttonUrl: "https://gbam.app/dashboard",
      }).success,
    ).toBe(true);
  });

  it("sending needs the typed count", () => {
    expect(sendAnnouncementSchema.safeParse({}).success).toBe(false);
    expect(sendAnnouncementSchema.parse({ confirmCount: 12 })).toEqual({ confirmCount: 12 });
    expect(
      sendAnnouncementSchema.safeParse({ confirmCount: 12, scheduledAt: "2026-10-10T09:00:00Z" })
        .success,
    ).toBe(true);
  });

  it("a notification link stays inside the dashboard", () => {
    const base = {
      type: "info",
      title: "Payouts are faster",
      body: "From today payouts arrive the next working day.",
      audience: {},
      confirmCount: 3,
    };
    expect(notificationSchema.safeParse(base).success).toBe(true);
    expect(notificationSchema.safeParse({ ...base, link: "/dashboard/settings" }).success).toBe(
      true,
    );
    expect(notificationSchema.safeParse({ ...base, link: "https://evil.example" }).success).toBe(
      false,
    );
    expect(notificationSchema.safeParse({ ...base, title: "x".repeat(81) }).success).toBe(false);
  });

  it("email settings: news and tips is optional (older pages don't send it)", () => {
    expect(emailSettingsSchema.parse({ newOrderEmails: true })).toEqual({ newOrderEmails: true });
    expect(emailSettingsSchema.parse({ newOrderEmails: true, newsEmails: false })).toEqual({
      newOrderEmails: true,
      newsEmails: false,
    });
  });
});
