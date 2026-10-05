import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathState = { current: "/dashboard" };
vi.mock("next/navigation", () => ({ usePathname: () => pathState.current }));

import { DashboardNav } from "./dashboard-nav";

describe("dashboard nav", () => {
  it("marks Orders current on the order list", () => {
    pathState.current = "/dashboard";
    render(<DashboardNav />);
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Products" })).not.toHaveAttribute("aria-current");
  });

  it("marks Products current on a product page", () => {
    pathState.current = "/dashboard/products/abc";
    render(<DashboardNav />);
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Orders" })).not.toHaveAttribute("aria-current");
  });
});
