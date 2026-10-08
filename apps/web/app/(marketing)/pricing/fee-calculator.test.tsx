import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeeCalculator } from "./fee-calculator";

function enter(amount: string) {
  render(<FeeCalculator />);
  fireEvent.change(screen.getByLabelText(/order amount/i), { target: { value: amount } });
}

describe("FeeCalculator", () => {
  it("shows the fees and what the seller receives for ₦10,000", () => {
    enter("10000");
    expect(screen.getByTestId("gbam-fee")).toHaveTextContent("₦150");
    expect(screen.getByTestId("paystack-fee")).toHaveTextContent("₦250");
    expect(screen.getByText("You receive ₦9,600")).toBeInTheDocument();
  });

  it("caps the gbam fee at ₦1,000 for ₦200,000", () => {
    enter("200000");
    expect(screen.getByTestId("gbam-fee")).toHaveTextContent("₦1,000");
  });

  it("uses the live rates when given", () => {
    render(<FeeCalculator rates={{ percentBasisPoints: 200, capKobo: 500_000 }} />);
    fireEvent.change(screen.getByLabelText(/order amount/i), { target: { value: "10000" } });
    expect(screen.getByTestId("gbam-fee")).toHaveTextContent("₦200");
  });
});
