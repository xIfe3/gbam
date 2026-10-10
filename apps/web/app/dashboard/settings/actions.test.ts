import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { apiMock, FakeApiError, refresh, redirect, clearSessionCookie } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    apiMock: {
      uploadShopImage: vi.fn(),
      removeShopImage: vi.fn(),
      changeSlug: vi.fn(),
      updateShopSettings: vi.fn(),
      updateEmailSettings: vi.fn(),
      saveDeliverySettings: vi.fn(),
      changePassword: vi.fn(),
      closeAccount: vi.fn(),
    },
    FakeApiError,
    refresh: vi.fn(),
    // Like Next's redirect: it stops the action by throwing.
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    clearSessionCookie: vi.fn(async () => {}),
  };
});
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  },
}));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));
vi.mock("@/lib/session", () => ({ clearSessionCookie }));

import {
  changeSlugAction,
  removeShopImageAction,
  uploadShopImageAction,
  changePasswordAction,
  closeAccountAction,
  saveDeliveryAction,
  updateEmailsAction,
  updateShopAction,
} from "./actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveDeliveryAction", () => {
  it("converts naira and saves", async () => {
    apiMock.saveDeliverySettings.mockResolvedValue({});
    const zones = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Lekki / VI",
        fee: "₦2,500",
        isPickup: false,
      },
      { name: "Pickup from shop", fee: "0", isPickup: true },
    ];
    const state = await saveDeliveryAction(
      {},
      form({ zones: JSON.stringify(zones), pickupNote: "Shop 12" }),
    );
    expect(apiMock.saveDeliverySettings).toHaveBeenCalledWith({
      zones: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Lekki / VI",
          feeKobo: 250_000,
          isPickup: false,
        },
        { name: "Pickup from shop", feeKobo: 0, isPickup: true },
      ],
      pickupNote: "Shop 12",
    });
    expect(state.notice).toBe("Delivery zones saved.");
  });

  it("shows a bad fee on the zones field", async () => {
    const zones = [{ name: "Lekki", fee: "abc", isPickup: false }];
    const state = await saveDeliveryAction(
      {},
      form({ zones: JSON.stringify(zones), pickupNote: "" }),
    );
    expect(apiMock.saveDeliverySettings).not.toHaveBeenCalled();
    expect(state.fieldErrors?.zones).toBe("Enter the fee for Lekki in whole naira, like 2500");
  });

  it("shows duplicate names on the zones field", async () => {
    const zones = [
      { name: "Lekki", fee: "2500", isPickup: false },
      { name: "lekki", fee: "3000", isPickup: false },
    ];
    const state = await saveDeliveryAction(
      {},
      form({ zones: JSON.stringify(zones), pickupNote: "" }),
    );
    expect(state.fieldErrors?.zones).toBe("Each zone needs a different name");
  });
});

describe("updateEmailsAction", () => {
  it("a ticked box turns new-order emails on", async () => {
    apiMock.updateEmailSettings.mockResolvedValue({});
    const state = await updateEmailsAction({}, form({ newOrderEmails: "on", newsEmails: "on" }));
    expect(apiMock.updateEmailSettings).toHaveBeenCalledWith({
      newOrderEmails: true,
      newsEmails: true,
    });
    expect(state.notice).toContain("We'll email you");
  });

  it("an unticked box (missing from the form) turns them off", async () => {
    apiMock.updateEmailSettings.mockResolvedValue({});
    const state = await updateEmailsAction({}, form({}));
    expect(apiMock.updateEmailSettings).toHaveBeenCalledWith({
      newOrderEmails: false,
      newsEmails: false,
    });
    expect(state.notice).toContain("won't email you");
  });
});

describe("updateShopAction", () => {
  it("saves and says so", async () => {
    apiMock.updateShopSettings.mockResolvedValue({});
    const state = await updateShopAction(
      {},
      form({ businessName: "Ada Bakes", phone: "08031234567" }),
    );
    expect(apiMock.updateShopSettings).toHaveBeenCalledWith({
      businessName: "Ada Bakes",
      phone: "2348031234567",
    });
    expect(state.notice).toBe("Saved.");
    expect(refresh).toHaveBeenCalled();
  });

  it("puts the API's 'number already used' message on the phone field", async () => {
    apiMock.updateShopSettings.mockRejectedValue(
      new FakeApiError(409, { field: "phone", message: "That phone number is already used" }),
    );
    const state = await updateShopAction(
      {},
      form({ businessName: "Ada Bakes", phone: "08031234567" }),
    );
    expect(state.fieldErrors).toEqual({ phone: "That phone number is already used" });
  });
});

describe("changePasswordAction", () => {
  it("shows a wrong current password on its field and never sends passwords back", async () => {
    apiMock.changePassword.mockRejectedValue(
      new FakeApiError(400, { field: "currentPassword", message: "That password isn't right" }),
    );
    const state = await changePasswordAction(
      {},
      form({ currentPassword: "wrong", newPassword: "a new password" }),
    );
    expect(state.fieldErrors).toEqual({ currentPassword: "That password isn't right" });
    expect(state.values).toBeUndefined();
  });
});

describe("closeAccountAction", () => {
  it("signs this browser out and goes to the login page with a note", async () => {
    apiMock.closeAccount.mockResolvedValue({ ok: true });
    await expect(
      closeAccountAction({}, form({ businessName: "Ada Bakes", password: "secret pass" })),
    ).rejects.toThrow("NEXT_REDIRECT:/login?closed=1");
    expect(clearSessionCookie).toHaveBeenCalled();
  });

  it("keeps the session when the API refuses (wrong name)", async () => {
    apiMock.closeAccount.mockRejectedValue(
      new FakeApiError(400, { field: "businessName", message: "Type your shop name exactly" }),
    );
    const state = await closeAccountAction(
      {},
      form({ businessName: "Wrong", password: "secret pass" }),
    );
    expect(state.fieldErrors).toEqual({ businessName: "Type your shop name exactly" });
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });
});

describe("changeSlugAction", () => {
  it("saves the new link and says the old one still works", async () => {
    apiMock.changeSlug.mockResolvedValue({ slug: "ada-cakes", nextSlugChangeAt: null });
    const state = await changeSlugAction({}, form({ slug: " Ada-Cakes " }));
    expect(apiMock.changeSlug).toHaveBeenCalledWith("ada-cakes");
    expect(state.notice).toContain("ada-cakes");
    expect(state.notice).toContain("old link");
  });

  it("the API's reason is shown on the field", async () => {
    apiMock.changeSlug.mockRejectedValue(
      new FakeApiError(409, { field: "slug", message: "That link is taken" }),
    );
    const state = await changeSlugAction({}, form({ slug: "taken-one" }));
    expect(state.fieldErrors?.slug).toBe("That link is taken");
  });
});

describe("shop images", () => {
  it("uploads a logo and returns its address", async () => {
    apiMock.uploadShopImage.mockResolvedValue({ url: "https://photos.test/logo.webp" });
    const data = new FormData();
    data.set("image", new File([new Uint8Array([1])], "logo.png", { type: "image/png" }));
    const result = await uploadShopImageAction("logo", data);
    expect(apiMock.uploadShopImage).toHaveBeenCalledWith("logo", expect.any(File));
    expect(result).toEqual({ url: "https://photos.test/logo.webp" });
    expect(await uploadShopImageAction("logo", new FormData())).toEqual({
      error: "Choose a photo",
    });
  });

  it("the API's reason is shown, and removing works", async () => {
    apiMock.uploadShopImage.mockRejectedValue(
      new FakeApiError(400, { message: "We can't read this photo. Try a JPEG or PNG." }),
    );
    const data = new FormData();
    data.set("image", new File([new Uint8Array([1])], "x.png", { type: "image/png" }));
    expect((await uploadShopImageAction("banner", data)).error).toBe(
      "We can't read this photo. Try a JPEG or PNG.",
    );
    apiMock.removeShopImage.mockResolvedValue({ ok: true });
    expect(await removeShopImageAction("banner")).toEqual({});
    expect(apiMock.removeShopImage).toHaveBeenCalledWith("banner");
  });
});
