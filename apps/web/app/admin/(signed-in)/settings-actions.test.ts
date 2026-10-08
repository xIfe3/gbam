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
    adminApiMock: { saveSettings: vi.fn(), setMaintenance: vi.fn() },
    FakeApiError,
    refresh: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("@/lib/api", () => ({ ApiError: FakeApiError }));

import { maintenanceAction, saveSettingsAction } from "./admin-actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const GOOD = {
  feePercent: "2",
  feeCapNaira: "1,500",
  foundingWaiverDays: "90",
  reminderAfterHours: "24",
  cancelAfterHours: "48",
  supportEmail: "support@gbam.app",
  contactEmail: "hello@gbam.app",
  privacyEmail: "privacy@gbam.app",
  whatsappNumber: "",
  signupsOpen: "on",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("settings actions", () => {
  it("settings form saves percent and naira as basis points and kobo", async () => {
    adminApiMock.saveSettings.mockResolvedValue({});
    const state = await saveSettingsAction({}, form(GOOD));
    expect(adminApiMock.saveSettings).toHaveBeenCalledWith({
      feePercentBasisPoints: 200,
      feeCapKobo: 150_000,
      foundingWaiverDays: 90,
      reminderAfterHours: 24,
      cancelAfterHours: 48,
      supportEmail: "support@gbam.app",
      contactEmail: "hello@gbam.app",
      privacyEmail: "privacy@gbam.app",
      whatsappNumber: null,
      signupsOpen: true,
    });
    expect(state.notice).toBe("Settings saved. Everything uses them within 30 seconds.");
  });

  it("bad values show field errors", async () => {
    const state = await saveSettingsAction(
      {},
      form({ ...GOOD, reminderAfterHours: "72", supportEmail: "nope" }),
    );
    expect(adminApiMock.saveSettings).not.toHaveBeenCalled();
    expect(state.fieldErrors?.reminderAfterHours).toBe(
      "The reminder must come before the order is cancelled",
    );
    expect(state.fieldErrors?.supportEmail).toBe("Enter an email address");
  });

  it("an unticked sign-ups box closes sign-ups", async () => {
    adminApiMock.saveSettings.mockResolvedValue({});
    const data = form(GOOD);
    data.delete("signupsOpen");
    await saveSettingsAction({}, data);
    expect(adminApiMock.saveSettings.mock.calls[0]?.[0]).toMatchObject({ signupsOpen: false });
  });

  it("maintenance needs the level and a confirmation", async () => {
    const noTick = await maintenanceAction({}, form({ level: "full", message: "Upgrading" }));
    expect(noTick.fieldErrors?.confirmed).toBeDefined();
    expect(adminApiMock.setMaintenance).not.toHaveBeenCalled();

    adminApiMock.setMaintenance.mockResolvedValue({});
    await maintenanceAction(
      {},
      form({ level: "full", message: "Upgrading", backBy: "2026-10-09T15:00", confirmed: "on" }),
    );
    expect(adminApiMock.setMaintenance).toHaveBeenCalledWith({
      level: "full",
      message: "Upgrading",
      // Typed in Lagos time.
      backBy: "2026-10-09T15:00:00+01:00",
    });
  });

  it("switching maintenance off needs no confirmation", async () => {
    adminApiMock.setMaintenance.mockResolvedValue({});
    const state = await maintenanceAction({}, form({ level: "off" }));
    expect(adminApiMock.setMaintenance).toHaveBeenCalledWith({
      level: "off",
      message: null,
      backBy: null,
    });
    expect(state.notice).toBe("Maintenance is off. The site is open.");
  });
});
