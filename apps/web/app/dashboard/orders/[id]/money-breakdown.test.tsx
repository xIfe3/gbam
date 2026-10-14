import { PAYOUT_TIMING } from "@gbam/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoneyBreakdown } from "./money-breakdown";

function payment(status: "success" | "pending") {
  return {
    id: "p1",
    status,
    amountKobo: 900_000,
    platformFeeKobo: 13_500,
    paystackFeeKobo: null,
    reference: "ref",
    createdAt: "2026-10-14T08:00:00Z",
  };
}

describe("MoneyBreakdown", () => {
  it("on a paid order, says when the money reaches the seller's bank", () => {
    render(<MoneyBreakdown payments={[payment("success")] as never} />);
    expect(screen.getByText(PAYOUT_TIMING)).toBeInTheDocument();
  });

  it("before payment, doesn't promise a payout yet", () => {
    render(<MoneyBreakdown payments={[payment("pending")] as never} />);
    expect(screen.queryByText(PAYOUT_TIMING)).toBeNull();
  });
});
