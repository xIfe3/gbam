import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/shops" }));

import { AdminMobileNav } from "./admin-mobile-nav";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/shops", label: "Shops" },
];

describe("AdminMobileNav", () => {
  it("the Menu button slides the menu in from the side", () => {
    render(<AdminMobileNav items={ITEMS} name="Chika" roleName="Support" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const drawer = screen.getByRole("dialog", { name: "Admin menu" });
    const shops = within(drawer).getByRole("link", { name: "Shops" });
    expect(shops).toHaveAttribute("aria-current", "page");
    expect(drawer).toHaveTextContent("Chika");
  });

  it("closes when a page is picked or ✕ is pressed", () => {
    render(<AdminMobileNav items={ITEMS} name="Chika" roleName="Support" />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("link", { name: "Overview" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
