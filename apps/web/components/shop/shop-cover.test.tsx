import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShopCover } from "./shop-cover";

describe("ShopCover", () => {
  it("shows the shop's banner and logo", () => {
    render(
      <ShopCover
        businessName="Ada Bakes"
        logoUrl="https://photos.test/shops/a/logo.webp"
        bannerUrl="https://photos.test/shops/a/banner.webp"
      />,
    );
    expect(screen.getByRole("img", { name: "Ada Bakes banner" })).toHaveAttribute(
      "src",
      "https://photos.test/shops/a/banner.webp",
    );
    expect(screen.getByRole("img", { name: "Ada Bakes logo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ada Bakes");
  });

  it("without a banner or photos: a gbam banner that reassures about paying", () => {
    render(<ShopCover businessName="Ada Bakes" logoUrl={null} bannerUrl={null} />);
    expect(screen.queryByRole("img", { name: /banner/ })).toBeNull();
    expect(screen.getByTestId("default-banner")).toHaveTextContent("Order here, pay safely");
    expect(screen.getByTestId("default-banner")).toHaveTextContent("Secured by Paystack");
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("without a banner but with product photos: a strip of the shop's own photos", () => {
    render(
      <ShopCover
        businessName="Ada Bakes"
        logoUrl={null}
        bannerUrl={null}
        photoUrls={[
          "https://photos.test/p1.webp",
          "https://photos.test/p2.webp",
          "https://photos.test/p3.webp",
          "https://photos.test/p4.webp",
        ]}
      />,
    );
    const strip = screen.getByTestId("photo-banner");
    // At most 3, so each photo stays big enough to see on a phone.
    expect(strip.querySelectorAll("img")).toHaveLength(3);
    expect(screen.queryByTestId("default-banner")).toBeNull();
  });

  it("the seller's own banner always wins over product photos", () => {
    render(
      <ShopCover
        businessName="Ada Bakes"
        logoUrl={null}
        bannerUrl="https://photos.test/banner.webp"
        photoUrls={["https://photos.test/p1.webp"]}
      />,
    );
    expect(screen.getByRole("img", { name: "Ada Bakes banner" })).toBeInTheDocument();
    expect(screen.queryByTestId("photo-banner")).toBeNull();
  });

  it("draws the logo above the default banner, so the initials aren't hidden behind it", () => {
    render(<ShopCover businessName="Hedgeon Finance" logoUrl={null} bannerUrl={null} />);
    // The default banner is "relative" (for its circles), which paints it over anything
    // after it that isn't positioned too. The logo's row must be lifted above it.
    const initials = screen.getByText("HF");
    const logoRow = initials.parentElement;
    expect(logoRow?.className).toContain("relative");
    expect(logoRow?.className).toContain("z-10");
  });
});
