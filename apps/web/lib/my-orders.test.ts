// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readMyOrders, rememberOrder, type MyOrder } from "./my-orders";

function order(code: string, placedAt: string): MyOrder {
  return { code, key: `key-${code}`, shopSlug: "ada", businessName: "Ada Bakes", placedAt };
}

describe("orders remembered on this phone", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("remembers orders newest first, without duplicates", () => {
    rememberOrder(order("GB-AAAA", "2026-10-01T10:00:00Z"));
    rememberOrder(order("GB-BBBB", "2026-10-02T10:00:00Z"));
    rememberOrder(order("GB-AAAA", "2026-10-01T10:00:00Z"));
    expect(readMyOrders().map((o) => o.code)).toEqual(["GB-AAAA", "GB-BBBB"]);
  });

  it("keeps at most 20", () => {
    for (let i = 0; i < 25; i++) {
      rememberOrder(order(`GB-${String(i).padStart(4, "0")}`, "2026-10-01T10:00:00Z"));
    }
    expect(readMyOrders()).toHaveLength(20);
  });

  it("ignores junk and survives blocked storage", () => {
    window.localStorage.setItem("gbam-my-orders", "not json");
    expect(readMyOrders()).toEqual([]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberOrder(order("GB-CCCC", "2026-10-01T10:00:00Z"))).not.toThrow();
    expect(readMyOrders()).toEqual([]);
  });
});
