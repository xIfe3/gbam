import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { upload, remove } = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ url: "https://photos.test/new-logo.webp" })),
  remove: vi.fn(async () => ({})),
}));
vi.mock("@/app/dashboard/settings/actions", () => ({
  uploadShopImageAction: upload,
  removeShopImageAction: remove,
}));

import { ShopImagesForm } from "./shop-images-form";

describe("ShopImagesForm", () => {
  it("uploads a logo and shows it straight away", async () => {
    render(<ShopImagesForm businessName="Ada Bakes" logoUrl={null} bannerUrl={null} />);
    const input = screen.getByLabelText("Upload a logo");
    const file = new File([new Uint8Array([1])], "logo.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(upload).toHaveBeenCalledWith("logo", expect.any(FormData));
    expect(screen.getByRole("img", { name: "Ada Bakes logo" })).toHaveAttribute(
      "src",
      "https://photos.test/new-logo.webp",
    );
  });

  it("an image can be removed", async () => {
    render(
      <ShopImagesForm
        businessName="Ada Bakes"
        logoUrl={null}
        bannerUrl="https://photos.test/banner.webp"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove banner" }));
    });
    expect(remove).toHaveBeenCalledWith("banner");
    expect(screen.getByTestId("default-banner")).toBeInTheDocument();
  });
});
