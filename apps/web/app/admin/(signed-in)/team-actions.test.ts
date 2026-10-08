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
      inviteAdmin: vi.fn(),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      endSellerSession: vi.fn(),
      handleMessage: vi.fn(),
    },
    FakeApiError,
    refresh: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("@/lib/api", () => ({ ApiError: FakeApiError }));

import {
  createRoleAction,
  endSellerSessionAction,
  handleMessageAction,
  inviteAdminAction,
} from "./admin-actions";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        data.append(name, item);
      }
    } else {
      data.set(name, value);
    }
  }
  return data;
}

const ROLE = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("team, roles and sessions actions", () => {
  it("team page invites", async () => {
    adminApiMock.inviteAdmin.mockResolvedValue({ inviteId: "i1" });
    const state = await inviteAdminAction(
      {},
      form({ name: "Chika", email: "Chika@Example.com", roleId: ROLE }),
    );
    expect(adminApiMock.inviteAdmin).toHaveBeenCalledWith({
      name: "Chika",
      email: "chika@example.com",
      roleId: ROLE,
      isSuperadmin: false,
    });
    expect(state.notice).toBe("Invite sent to chika@example.com.");
  });

  it("an invite needs a role unless it's a superadmin", async () => {
    const state = await inviteAdminAction({}, form({ name: "Chika", email: "c@example.com" }));
    expect(state.fieldErrors?.roleId).toBe("Choose a role");
    expect(adminApiMock.inviteAdmin).not.toHaveBeenCalled();
  });

  it("roles page ticks permissions", async () => {
    adminApiMock.createRole.mockResolvedValue({ id: "r1" });
    await createRoleAction(
      {},
      form({ name: "Support", permissions: ["shops.view", "support.view"] }),
    );
    expect(adminApiMock.createRole).toHaveBeenCalledWith({
      name: "Support",
      permissions: ["shops.view", "support.view"],
    });
  });

  it("a role name already taken shows on the name field", async () => {
    adminApiMock.createRole.mockRejectedValue(
      new FakeApiError(409, { field: "name", message: "A role with that name already exists" }),
    );
    const state = await createRoleAction({}, form({ name: "Support" }));
    expect(state.fieldErrors?.name).toBe("A role with that name already exists");
  });

  it("seller sign-out asks for a reason", async () => {
    const state = await endSellerSessionAction("s1", {}, form({ reason: "" }));
    expect(state.fieldErrors?.reason).toBeDefined();
    adminApiMock.endSellerSession.mockResolvedValue({ ok: true });
    const done = await endSellerSessionAction("s1", {}, form({ reason: "Stolen phone reported" }));
    expect(adminApiMock.endSellerSession).toHaveBeenCalledWith("s1", "Stolen phone reported");
    expect(done.notice).toBe("Seller signed out on that device.");
  });

  it("handling a message needs a note", async () => {
    adminApiMock.handleMessage.mockResolvedValue({ ok: true });
    await handleMessageAction("m1", {}, form({ reason: "Replied by email" }));
    expect(adminApiMock.handleMessage).toHaveBeenCalledWith("m1", "Replied by email");
  });
});
