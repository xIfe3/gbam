import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./header";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("Header mobile menu", () => {
  it("toggles aria-expanded from the menu button", () => {
    render(<Header />);
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when a menu link is clicked", () => {
    render(<Header />);
    const button = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(button);
    const mobile = screen.getByRole("navigation", { name: "Mobile" });
    // Stop jsdom trying to navigate; the click still bubbles to the menu.
    mobile.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(mobile.querySelector("a") as HTMLAnchorElement);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Mobile" })).toBeNull();
  });

  it("closes on Escape", () => {
    render(<Header />);
    const button = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
