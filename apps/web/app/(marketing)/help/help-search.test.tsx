import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpSearch } from "./help-search";

const ARTICLES = [
  {
    slug: "request-payment",
    title: "Request payment",
    summary: "Send a Paystack link.",
    category: "Orders",
  },
  {
    slug: "create-shop",
    title: "Create your shop",
    summary: "Sign up and add products.",
    category: "Getting started",
  },
  {
    slug: "payouts",
    title: "Get your payout",
    summary: "How your money reaches your bank.",
    category: "Orders",
  },
];

describe("HelpSearch", () => {
  it("shows every article grouped by category when the query is empty", () => {
    render(<HelpSearch articles={ARTICLES} />);
    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Getting started" })).toBeInTheDocument();
    expect(screen.getByText("Request payment")).toBeInTheDocument();
    expect(screen.getByText("Create your shop")).toBeInTheDocument();
    expect(screen.getByText("Get your payout")).toBeInTheDocument();
  });

  it("filters by title or summary, case-insensitively", () => {
    render(<HelpSearch articles={ARTICLES} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "PAY" } });
    expect(screen.getByText("Request payment")).toBeInTheDocument();
    expect(screen.getByText("Get your payout")).toBeInTheDocument();
    expect(screen.queryByText("Create your shop")).not.toBeInTheDocument();
  });

  it("shows a message when nothing matches", () => {
    render(<HelpSearch articles={ARTICLES} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "xyz" } });
    expect(
      screen.getByText('No articles match "xyz". Try "payment" or contact support@gbam.app.'),
    ).toBeInTheDocument();
  });
});
