import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  adminCodeSchema,
  bulkActionSchema,
  inviteAdminSchema,
  roleInputSchema,
} from "./admin";

const ROLE_ID = "11111111-1111-4111-8111-111111111111";

describe("admin permissions", () => {
  it("permissions list has the 19 spec names", () => {
    expect([...ADMIN_PERMISSIONS]).toEqual([
      "shops.view",
      "shops.suspend",
      "sellers.help",
      "orders.view",
      "refunds.handle",
      "support.view",
      "support.handle",
      "audit.view",
      "fees.manage",
      "settings.manage",
      "money.view",
      "analytics.view",
      "system.view",
      "system.manage",
      "tickets.view",
      "tickets.handle",
      "messages.send",
      "content.edit",
      "content.publish",
    ]);
    for (const permission of ADMIN_PERMISSIONS) {
      expect(ADMIN_PERMISSION_LABELS[permission].label.length).toBeGreaterThan(0);
    }
  });

  it("role refuses an unknown permission", () => {
    const result = roleInputSchema.safeParse({ name: "Support", permissions: ["shops.delete"] });
    expect(result.success).toBe(false);
  });

  it("role refuses the same permission twice", () => {
    const result = roleInputSchema.safeParse({
      name: "Support",
      permissions: ["shops.view", "shops.view"],
    });
    expect(result.success).toBe(false);
  });
});

describe("inviteAdminSchema", () => {
  it("invite needs a role unless superadmin", () => {
    const base = { name: "Chika", email: "chika@example.com" };
    expect(
      inviteAdminSchema.safeParse({ ...base, roleId: null, isSuperadmin: false }).success,
    ).toBe(false);
    expect(inviteAdminSchema.safeParse({ ...base, roleId: null, isSuperadmin: true }).success).toBe(
      true,
    );
    expect(
      inviteAdminSchema.safeParse({ ...base, roleId: ROLE_ID, isSuperadmin: false }).success,
    ).toBe(true);
  });
});

describe("bulkActionSchema", () => {
  function ids(count: number): string[] {
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      list.push(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    }
    return list;
  }

  it("bulk refuses 101 ids", () => {
    expect(bulkActionSchema.safeParse({ ids: ids(101), note: "Spam shops" }).success).toBe(false);
    expect(bulkActionSchema.safeParse({ ids: ids(100), note: "Spam shops" }).success).toBe(true);
  });

  it("bulk refuses a 4-char note", () => {
    expect(bulkActionSchema.safeParse({ ids: ids(1), note: "spam" }).success).toBe(false);
  });
});

describe("adminCodeSchema", () => {
  it("accepts a 6-digit code or a backup code", () => {
    expect(adminCodeSchema.safeParse("123456").success).toBe(true);
    expect(adminCodeSchema.parse(" A1B2-C3D4 ")).toBe("a1b2-c3d4");
    expect(adminCodeSchema.safeParse("12345").success).toBe(false);
  });
});
