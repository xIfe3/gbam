import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { adminApiMock, FakeApiError, setAdminCookie } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    adminApiMock: { viewInvite: vi.fn(), acceptInvite: vi.fn() },
    FakeApiError,
    setAdminCookie: vi.fn(async () => {}),
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  unstable_rethrow: () => undefined,
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("@/lib/api", () => ({ ApiError: FakeApiError }));
vi.mock("@/lib/admin-session", () => ({ setAdminCookie }));

import { acceptInviteAction, finishSetupAction } from "./actions";
import { BackupCodes } from "./backup-codes";
import InvitePage from "./page";

const props = (token: string) => ({ params: Promise.resolve({ token }) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin invite", () => {
  it("invite page shows a QR code and the secret", async () => {
    adminApiMock.viewInvite.mockResolvedValue({
      email: "chika@example.com",
      name: "Chika",
      secret: "JBSWY3DPEHPK3PXP",
      otpauthUrl: "otpauth://totp/Gbam%20Admin:chika%40example.com?secret=JBSWY3DPEHPK3PXP",
    });
    const { container } = render(await InvitePage(props("t1")));
    expect(screen.getByText("chika@example.com")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
  });

  it("an expired invite says so", async () => {
    adminApiMock.viewInvite.mockRejectedValue(new FakeApiError(404, { message: "expired" }));
    render(await InvitePage(props("t1")));
    expect(screen.getByRole("heading", { name: "This invite has expired" })).toBeInTheDocument();
  });

  it("accepting returns the backup codes without signing in yet", async () => {
    adminApiMock.acceptInvite.mockResolvedValue({ sessionToken: "s1", backupCodes: ["a1b2-c3d4"] });
    const data = new FormData();
    data.set("password", "a long admin password");
    data.set("code", "123456");
    const state = await acceptInviteAction("t1", {}, data);
    // Setting the cookie here would re-render the page, find the invite used, and replace the
    // backup codes with "This invite has expired" before they could be saved.
    expect(setAdminCookie).not.toHaveBeenCalled();
    expect(state.backupCodes).toEqual(["a1b2-c3d4"]);
    expect(state.sessionToken).toBe("s1");
  });

  it("continue after saving the codes signs in and opens the admin", async () => {
    await expect(finishSetupAction("s1")).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(setAdminCookie).toHaveBeenCalledWith("s1");
  });

  it("a short password is refused before calling the API", async () => {
    const data = new FormData();
    data.set("password", "short");
    data.set("code", "123456");
    const state = await acceptInviteAction("t1", {}, data);
    expect(adminApiMock.acceptInvite).not.toHaveBeenCalled();
    expect(state.fieldErrors?.password).toBe("Use at least 12 characters");
  });

  it("backup codes shown once after accepting, with a way on", () => {
    render(<BackupCodes codes={["a1b2-c3d4", "e5f6-a7b8"]} sessionToken="s1" />);
    expect(screen.getByText("a1b2-c3d4")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: "I've saved them, continue" });
    fireEvent.click(next);
  });
});
