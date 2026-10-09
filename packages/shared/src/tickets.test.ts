import { describe, expect, it } from "vitest";
import {
  newTicketSchema,
  ticketBulkSchema,
  ticketReplySchema,
  ticketUpdateSchema,
} from "./tickets";

const ID = "6f1c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d11";

describe("ticket schemas", () => {
  it("subject too short", () => {
    const result = newTicketSchema.safeParse({ subject: "Hi", message: "My payouts are late" });
    expect(result.success).toBe(false);
  });

  it("a new ticket trims and keeps an optional order code", () => {
    const result = newTicketSchema.parse({
      subject: "  Payout missing  ",
      message: "I was paid but nothing came",
      orderCode: " gb-7k2q ",
    });
    expect(result).toEqual({
      subject: "Payout missing",
      message: "I was paid but nothing came",
      orderCode: "GB-7K2Q",
    });
    const noOrder = newTicketSchema.parse({
      subject: "Payout missing",
      message: "I was paid but nothing came",
      orderCode: "",
    });
    expect(noOrder.orderCode).toBeUndefined();
  });

  it("a reply can't be empty", () => {
    expect(ticketReplySchema.safeParse({ message: "   " }).success).toBe(false);
    expect(ticketReplySchema.parse({ message: " Thanks! " }).message).toBe("Thanks!");
  });

  it("an update changes at least one thing", () => {
    expect(ticketUpdateSchema.safeParse({}).success).toBe(false);
    expect(ticketUpdateSchema.parse({ assigneeId: null })).toEqual({ assigneeId: null });
    expect(ticketUpdateSchema.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("bulk needs a note", () => {
    const result = ticketBulkSchema.safeParse({ ids: [ID], note: "ok", action: "close" });
    expect(result.success).toBe(false);
  });

  it("bulk at most 100", () => {
    const ids: string[] = [];
    for (let i = 0; i < 101; i++) {
      ids.push(`6f1c1f0e-2b7a-4d61-9a5e-${String(i).padStart(12, "0")}`);
    }
    const result = ticketBulkSchema.safeParse({ ids, note: "tidy up", action: "close" });
    expect(result.success).toBe(false);
  });

  it("bulk assign needs who, bulk priority needs which", () => {
    const base = { ids: [ID], note: "sorting the queue" };
    expect(ticketBulkSchema.safeParse({ ...base, action: "assign" }).success).toBe(false);
    expect(
      ticketBulkSchema.safeParse({ ...base, action: "assign", assigneeId: null }).success,
    ).toBe(true);
    expect(ticketBulkSchema.safeParse({ ...base, action: "priority" }).success).toBe(false);
    expect(
      ticketBulkSchema.safeParse({ ...base, action: "priority", priority: "urgent" }).success,
    ).toBe(true);
  });
});
