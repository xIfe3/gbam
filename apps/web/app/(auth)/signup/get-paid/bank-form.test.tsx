import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The real actions need the server; the form only needs something to point at.
vi.mock("./actions", () => ({
  resolveAccountAction: vi.fn(),
  createPayoutAccountAction: vi.fn(),
}));

import { BankForm } from "./bank-form";

const BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Goodnews Microfinance Bank", code: "50739" },
  // Paystack lists a few codes under two names; both must be choosable.
  { name: "Prospa Capital Microfinance Bank", code: "50739" },
];

describe("BankForm", () => {
  it("lists every bank, takes a 10-digit number, and offers Skip for now", () => {
    render(<BankForm banks={BANKS} />);

    const select = screen.getByRole("combobox", { name: "Bank" });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Access Bank" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Prospa Capital Microfinance Bank" }),
    ).toBeInTheDocument();

    const number = screen.getByRole("textbox", { name: "Account number" });
    expect(number).toHaveAttribute("inputmode", "numeric");
    expect(number).toHaveAttribute("maxlength", "10");

    expect(screen.getByRole("button", { name: "Check account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip for now" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
