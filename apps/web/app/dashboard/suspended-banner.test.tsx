import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SuspendedBanner } from "./suspended-banner";

describe("SuspendedBanner", () => {
  it("seller sees the suspension banner with how to get help", () => {
    render(<SuspendedBanner />);
    const banner = screen.getByRole("complementary", { name: "Shop paused" });
    expect(banner).toHaveTextContent("Your shop is paused");
    expect(screen.getByRole("link", { name: "support@gbam.app" })).toHaveAttribute(
      "href",
      "mailto:support@gbam.app",
    );
  });
});
