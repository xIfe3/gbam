import type { Maintenance } from "@gbam/shared";
import { ServiceUnavailableException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { PlatformSettingsService } from "../infra/platform-settings.service.js";
import { MaintenanceGuard, maintenanceBlocks } from "./maintenance.guard.js";

const NO_SELLER = false;
const SELLER = true;

describe("maintenanceBlocks", () => {
  it("off lets everything through", () => {
    expect(maintenanceBlocks("off", "POST", "/storefront/ada/orders", NO_SELLER)).toBe(false);
    expect(maintenanceBlocks("off", "GET", "/orders", SELLER)).toBe(false);
  });

  it("full blocks the storefront", () => {
    expect(maintenanceBlocks("full", "GET", "/storefront/ada", NO_SELLER)).toBe(true);
    expect(maintenanceBlocks("full", "POST", "/contact", NO_SELLER)).toBe(true);
  });

  it("webhooks pass in full maintenance", () => {
    expect(maintenanceBlocks("full", "POST", "/webhooks/paystack", NO_SELLER)).toBe(false);
    expect(maintenanceBlocks("full", "POST", "/webhooks/whatsapp", NO_SELLER)).toBe(false);
    expect(maintenanceBlocks("full", "GET", "/health", NO_SELLER)).toBe(false);
  });

  it("admin routes pass", () => {
    expect(maintenanceBlocks("full", "GET", "/admin/shops", NO_SELLER)).toBe(false);
    expect(maintenanceBlocks("full", "PUT", "/admin/maintenance", NO_SELLER)).toBe(false);
    expect(maintenanceBlocks("full", "GET", "/platform/public", NO_SELLER)).toBe(false);
  });

  it("pause blocks placing an order but not viewing the shop", () => {
    expect(maintenanceBlocks("pause", "POST", "/storefront/ada/orders", NO_SELLER)).toBe(true);
    expect(maintenanceBlocks("pause", "POST", "/track/GB-7K2Q/pay", NO_SELLER)).toBe(true);
    expect(maintenanceBlocks("pause", "GET", "/storefront/ada", NO_SELLER)).toBe(false);
    expect(maintenanceBlocks("pause", "GET", "/track/GB-7K2Q", NO_SELLER)).toBe(false);
  });

  it("pause blocks seller sign-in and dashboard calls", () => {
    expect(maintenanceBlocks("pause", "POST", "/auth/login", NO_SELLER)).toBe(true);
    expect(maintenanceBlocks("pause", "POST", "/auth/signup", NO_SELLER)).toBe(true);
    expect(maintenanceBlocks("pause", "GET", "/orders", SELLER)).toBe(true);
    // The query string doesn't change the decision.
    expect(maintenanceBlocks("full", "GET", "/admin/shops?q=ada", NO_SELLER)).toBe(false);
  });
});

describe("MaintenanceGuard", () => {
  function contextFor(method: string, url: string, authorization?: string): ExecutionContext {
    const request = { method, url, headers: { authorization } };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function guardWith(maintenance: Maintenance) {
    const platform = { maintenance: async () => maintenance } as unknown as PlatformSettingsService;
    return new MaintenanceGuard(platform);
  }

  it("answers 503 with the message and back-by time", async () => {
    const guard = guardWith({
      level: "full",
      message: "Upgrading",
      backBy: "2026-10-09T10:00:00Z",
    });
    const error = await guard.canActivate(contextFor("GET", "/storefront/ada")).catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      code: "MAINTENANCE",
      level: "full",
      message: "Upgrading",
      backBy: "2026-10-09T10:00:00Z",
    });
  });

  it("treats a request with a seller's Authorization header as a dashboard call", async () => {
    const guard = guardWith({ level: "pause", message: null, backBy: null });
    await expect(
      guard.canActivate(contextFor("GET", "/settings", "Bearer abc")),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(guard.canActivate(contextFor("GET", "/storefront/ada"))).resolves.toBe(true);
  });
});
