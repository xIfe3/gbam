import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PayoutBanner } from "./payout-banner";

describe("PayoutBanner", () => {
  it("asks for a bank account and links to the get-paid step", () => {
    render(<PayoutBanner />);
    expect(
      screen.getByText("Add your bank account to start receiving payments"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /add bank account/i });
    expect(link).toHaveAttribute("href", "/signup/get-paid");
  });
});
