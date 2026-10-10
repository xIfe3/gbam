import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { adminApiMock, FakeApiError, refresh } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    adminApiMock: {
      previewAnnouncement: vi.fn(),
      createAnnouncement: vi.fn(),
      sendAnnouncement: vi.fn(),
      countNotification: vi.fn(),
      sendNotification: vi.fn(),
    },
    FakeApiError,
    refresh: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: () => undefined,
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("@/lib/api", () => ({ ApiError: FakeApiError }));

import { audienceFromForm } from "@/components/admin/audience-form";
import {
  createAnnouncementAction,
  previewAnnouncementAction,
  sendAnnouncementAction,
  sendNotificationAction,
} from "./messaging-actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const ANNOUNCEMENT = {
  subject: "Delivery zones are here",
  body: "Hello **sellers**",
  buttonLabel: "",
  buttonUrl: "",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("audience from the form", () => {
  it("empty means everyone; any/yes/no and numbers are read", () => {
    expect(audienceFromForm(form({}))).toEqual({});
    expect(
      audienceFromForm(
        form({
          verified: "yes",
          hasBank: "no",
          hasProducts: "",
          noOrderDays: "30",
          signedUpFrom: "2026-10-01",
          shopId: "",
        }),
      ),
    ).toEqual({ verified: true, hasBank: false, noOrderDays: 30, signedUpFrom: "2026-10-01" });
  });
});

describe("announcement actions", () => {
  it("preview shows the email and the count", async () => {
    adminApiMock.previewAnnouncement.mockResolvedValue({
      subject: "Delivery zones are here",
      html: "<p>Hello</p>",
      recipients: 12,
    });
    const state = await previewAnnouncementAction({}, form({ ...ANNOUNCEMENT, verified: "yes" }));
    expect(adminApiMock.previewAnnouncement).toHaveBeenCalledWith({
      subject: "Delivery zones are here",
      body: "Hello **sellers**",
      audience: { verified: true },
    });
    expect(state.preview).toEqual({
      subject: "Delivery zones are here",
      html: "<p>Hello</p>",
      recipients: 12,
    });
  });

  it("a short subject is caught before the API", async () => {
    const state = await createAnnouncementAction({}, form({ ...ANNOUNCEMENT, subject: "Hi" }));
    expect(state.fieldErrors?.subject).toBe("Write a subject");
    expect(adminApiMock.createAnnouncement).not.toHaveBeenCalled();
  });

  it("saving a draft opens it", async () => {
    adminApiMock.createAnnouncement.mockResolvedValue({ id: "a1" });
    await expect(createAnnouncementAction({}, form(ANNOUNCEMENT))).rejects.toThrow(
      "NEXT_REDIRECT:/admin/announcements/a1",
    );
  });

  it("send turns the typed count into a number and the time into Lagos time", async () => {
    adminApiMock.sendAnnouncement.mockResolvedValue({ ok: true, recipients: 12 });
    const state = await sendAnnouncementAction(
      "a1",
      {},
      form({ confirmCount: "12", scheduledAt: "2026-10-12T09:30" }),
    );
    expect(adminApiMock.sendAnnouncement).toHaveBeenCalledWith("a1", {
      confirmCount: 12,
      scheduledAt: "2026-10-12T09:30:00+01:00",
    });
    expect(state.notice).toContain("Scheduled");
  });

  it("send without a count is refused before the API", async () => {
    const state = await sendAnnouncementAction("a1", {}, form({ confirmCount: "" }));
    expect(state.fieldErrors?.confirmCount).toBeDefined();
    expect(adminApiMock.sendAnnouncement).not.toHaveBeenCalled();
  });

  it("the API's count message is shown", async () => {
    adminApiMock.sendAnnouncement.mockRejectedValue(
      new FakeApiError(400, { message: "It goes to 13 sellers now. Type 13 to confirm." }),
    );
    const state = await sendAnnouncementAction("a1", {}, form({ confirmCount: "12" }));
    expect(state.error).toBe("It goes to 13 sellers now. Type 13 to confirm.");
  });
});

describe("a bad audience field", () => {
  it("is reported where the form shows it, in words", async () => {
    const preview = await previewAnnouncementAction({}, form({ ...ANNOUNCEMENT, shopId: "not-an-id" }));
    expect(preview.fieldErrors?.audience).toBe('Check the "Who it goes to" fields');
    expect(adminApiMock.previewAnnouncement).not.toHaveBeenCalled();
    const notification = await sendNotificationAction(
      {},
      form({ type: "info", title: "Hi", body: "Hello", confirmCount: "1", noOrderDays: "0" }),
    );
    expect(notification.fieldErrors?.audience).toBe('Check the "Who it goes to" fields');
  });
});

describe("notification actions", () => {
  it("sends with the typed count", async () => {
    adminApiMock.sendNotification.mockResolvedValue({ id: "c1" });
    const state = await sendNotificationAction(
      {},
      form({
        type: "action",
        title: "Add your bank",
        body: "Customers can't pay you yet.",
        link: "/dashboard/settings",
        endsAt: "",
        confirmCount: "3",
        hasBank: "no",
      }),
    );
    expect(adminApiMock.sendNotification).toHaveBeenCalledWith({
      type: "action",
      title: "Add your bank",
      body: "Customers can't pay you yet.",
      link: "/dashboard/settings",
      audience: { hasBank: false },
      confirmCount: 3,
    });
    expect(state.notice).toContain("3 sellers");
  });
});
