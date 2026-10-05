import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "./hero";

describe("Hero", () => {
  it("has the headline", () => {
    render(<Hero />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Sell on WhatsApp.");
    expect(h1).toHaveTextContent("Gbam.");
  });

  it("links to signup and how-it-works", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: "Start selling free" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.getByRole("link", { name: /See how it works/ })).toHaveAttribute(
      "href",
      "/how-it-works",
    );
  });

  it("shows the payment toast and the trust line", () => {
    render(<Hero />);
    expect(screen.getByText("Payment received")).toBeInTheDocument();
    expect(screen.getByText(/₦6,000/)).toBeInTheDocument();
    expect(
      screen.getByText("Free for founding sellers · No app to install · Payments by Paystack"),
    ).toBeInTheDocument();
  });

  it("shows the example order chat", () => {
    render(<Hero />);
    expect(screen.getByText("GB-7K3Q")).toBeInTheDocument();
    expect(screen.getByText("Pay with Paystack")).toBeInTheDocument();
  });
});
