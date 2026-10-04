import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real action needs the server; the form only needs something to point at.
vi.mock("../../actions", () => ({ updateOrderStatus: vi.fn() }));

import { StatusActions } from "./status-actions";

const ID = "6cc517db-4de6-4ba4-9e4d-47cbe3a2a8dc";

describe("StatusActions", () => {
  it("disables Request payment, with the reason, until the seller has a payout account", () => {
    render(
      <StatusActions
        orderId={ID}
        allowed={["awaiting_payment", "cancelled"]}
        canRequestPayment={false}
      />,
    );

    const request = screen.getByRole("button", { name: "Request payment" });
    expect(request).toBeDisabled();
    expect(request).toHaveAccessibleDescription(
      "Add your bank account to start receiving payments.",
    );
    expect(screen.getByRole("link", { name: /add bank account/i })).toHaveAttribute(
      "href",
      "/signup/get-paid",
    );
    // Other actions still work.
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeEnabled();
  });

  it("enables Request payment once a payout account exists", () => {
    render(
      <StatusActions
        orderId={ID}
        allowed={["awaiting_payment", "cancelled"]}
        canRequestPayment={true}
      />,
    );
    expect(screen.getByRole("button", { name: "Request payment" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: /add bank account/i })).toBeNull();
  });
});
