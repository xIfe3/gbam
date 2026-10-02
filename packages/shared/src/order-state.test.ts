import { describe, expect, it } from "vitest";
import {
  ORDER_STATUSES,
  InvalidOrderTransitionError,
  assertTransition,
  canTransition,
  isTerminal,
  nextStatuses,
} from "./order-state";

describe("order state machine", () => {
  it("follows the happy path pending → delivered", () => {
    expect(canTransition("pending", "awaiting_payment", "seller")).toBe(true);
    expect(canTransition("awaiting_payment", "paid", "system")).toBe(true);
    expect(canTransition("paid", "fulfilled", "seller")).toBe(true);
    expect(canTransition("fulfilled", "delivered", "seller")).toBe(true);
  });

  it("only lets the system mark an order paid", () => {
    expect(canTransition("awaiting_payment", "paid", "seller")).toBe(false);
    expect(nextStatuses("awaiting_payment", "seller")).not.toContain("paid");
    expect(nextStatuses("awaiting_payment", "system")).toContain("paid");
  });

  it("cannot skip payment", () => {
    expect(canTransition("pending", "paid", "system")).toBe(false);
    expect(canTransition("awaiting_payment", "fulfilled", "seller")).toBe(false);
  });

  it("can cancel before payment but must refund after", () => {
    expect(canTransition("pending", "cancelled", "seller")).toBe(true);
    expect(canTransition("awaiting_payment", "cancelled", "seller")).toBe(true);
    expect(canTransition("paid", "cancelled", "seller")).toBe(false);
    expect(canTransition("paid", "refunded", "seller")).toBe(true);
    expect(canTransition("delivered", "refunded", "seller")).toBe(true);
  });

  it("treats cancelled and refunded as terminal", () => {
    for (const status of ORDER_STATUSES) {
      const terminal = status === "cancelled" || status === "refunded";
      expect(isTerminal(status)).toBe(terminal);
    }
    expect(nextStatuses("cancelled", "system")).toEqual([]);
    expect(nextStatuses("refunded", "system")).toEqual([]);
  });

  it("rejects transitions to the same status", () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition(status, status, "system")).toBe(false);
    }
  });

  it("assertTransition throws a typed error on an invalid move", () => {
    expect(() => assertTransition("paid", "pending", "seller")).toThrow(
      InvalidOrderTransitionError,
    );
    expect(() => assertTransition("paid", "fulfilled", "seller")).not.toThrow();
  });
});
