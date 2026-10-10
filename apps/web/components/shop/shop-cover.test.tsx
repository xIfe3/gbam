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

  it("without them: the gbam pattern and the shop's initials", () => {
    render(<ShopCover businessName="Ada Bakes" logoUrl={null} bannerUrl={null} />);
    expect(screen.queryByRole("img", { name: /banner/ })).toBeNull();
    expect(screen.getByTestId("default-banner")).toBeInTheDocument();
    expect(screen.getByText("AB")).toBeInTheDocument();
  });
});
