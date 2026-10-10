import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The link box can also check links for signup; that part isn't used here.
vi.mock("@/app/(auth)/signup/actions", () => ({ checkSlugAction: vi.fn() }));
vi.mock("./actions", () => ({
  changeSlugAction: vi.fn(),
  checkShopSlugAction: vi.fn(async () => ({ status: "available" })),
}));

import { ShopLinkForm } from "./shop-link-form";

describe("ShopLinkForm", () => {
  it("shows the current link and lets the seller change it", () => {
    render(<ShopLinkForm slug="ada-bakes" nextChangeAt={null} />);
    expect(screen.getByRole("textbox", { name: "Your shop link" })).toHaveValue("ada-bakes");
    expect(screen.getByRole("button", { name: "Change link" })).toBeEnabled();
    expect(screen.getByText(/old link keeps working/)).toBeInTheDocument();
  });

  it("within 30 days of a change, says when the next change is possible", () => {
    render(<ShopLinkForm slug="ada-bakes" nextChangeAt="2026-11-09T08:00:00Z" />);
    expect(screen.getByText(/next change is possible from/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change link" })).toBeDisabled();
  });
});
