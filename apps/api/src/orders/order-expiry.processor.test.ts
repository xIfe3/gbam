import { describe, expect, it } from "vitest";
import type { PaymentsService } from "../payments/payments.service.js";
import { OrderExpiryProcessor } from "./order-expiry.processor.js";
import type { OrderExpiryService } from "./order-expiry.service.js";

describe("OrderExpiryProcessor", () => {
  it("re-checks payments with Paystack BEFORE cancelling unpaid orders", async () => {
    // Stand-ins that only note when they were called: the order of the steps is what matters.
    const steps: string[] = [];
    const expiry = {
      sendDueReminders: async () => {
        steps.push("remind");
        return [];
      },
      expireOverdue: async () => {
        steps.push("cancel unpaid");
        return [];
      },
      expireUnapproved: async () => {
        steps.push("cancel unapproved");
        return [];
      },
    };
    const payments = {
      recheckPending: async () => {
        steps.push("re-check payments");
        return ["ref-1"];
      },
    };

    const processor = new OrderExpiryProcessor(
      expiry as unknown as OrderExpiryService,
      payments as unknown as PaymentsService,
    );
    const result = await processor.process();

    // A customer whose webhook went missing is found paid before their order could expire.
    expect(steps.indexOf("re-check payments")).toBeLessThan(steps.indexOf("cancel unpaid"));
    expect(result).toMatchObject({ paidOnRecheck: 1 });
  });
});
