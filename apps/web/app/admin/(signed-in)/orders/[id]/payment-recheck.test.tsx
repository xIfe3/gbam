import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../admin-actions", () => ({ recheckPaymentAction: vi.fn() }));

import { PaymentRecheck } from "./payment-recheck";

describe("PaymentRecheck", () => {
  it("offers the re-check when a payment is still unconfirmed", () => {
    render(<PaymentRecheck orderId="o1" payments={[{ status: "pending" }]} />);
    expect(screen.getByRole("button", { name: "Re-check with Paystack" })).toBeInTheDocument();
  });

  it("shows nothing when every payment is already settled one way or another", () => {
    const { container } = render(
      <PaymentRecheck orderId="o1" payments={[{ status: "success" }, { status: "failed" }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
