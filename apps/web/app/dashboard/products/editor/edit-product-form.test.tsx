import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { actions } = vi.hoisted(() => ({
  actions: {
    uploadPhotoAction: vi.fn(),
    deletePhotoAction: vi.fn(),
    updateProductAction: vi.fn(),
    setProductStatusAction: vi.fn(),
    deleteProductAction: vi.fn(),
  },
}));
vi.mock("../actions", () => actions);

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import type { ProductDetail } from "@/lib/api";
import { EditProductForm } from "./edit-product-form";

const IMG = "11111111-1111-4111-8111-111111111111";
const VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function product(): ProductDetail {
  return {
    id: PRODUCT,
    slug: "ankara-dress",
    name: "Ankara Dress",
    description: null,
    status: "active",
    version: 4,
    images: [{ id: IMG, position: 0, largeUrl: "/l.webp", smallUrl: "/s.webp" }],
    options: [],
    variants: [
      {
        id: VARIANT,
        optionValues: [],
        title: "",
        priceKobo: 1200000,
        stock: 3,
        imageId: null,
        isEnabled: true,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditProductForm", () => {
  it("shows the stale-save message when the product changed elsewhere", async () => {
    actions.updateProductAction.mockResolvedValue({
      error: "This product changed since you opened it. Reload to see the latest.",
    });
    render(<EditProductForm product={product()} />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(
        screen.getByText("This product changed since you opened it. Reload to see the latest."),
      ).toBeInTheDocument(),
    );
    // Saved with the version it was opened with, keeping the variant's id.
    const call = actions.updateProductAction.mock.calls[0];
    expect(call?.[0]).toBe(PRODUCT);
    expect(call?.[1].variants[0].id).toBe(VARIANT);
    expect(call?.[1].variants[0].priceKobo).toBe(1200000);
    expect(call?.[2]).toBe(4);

    // "Reload" re-reads the product from the server.
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks before deleting", () => {
    render(<EditProductForm product={product()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete product" }));

    expect(
      screen.getByText("Delete this product? If it has been ordered before, it will be archived instead."),
    ).toBeInTheDocument();
    expect(actions.deleteProductAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(actions.deleteProductAction).toHaveBeenCalledWith(PRODUCT);
  });

  it("can cancel the delete", () => {
    render(<EditProductForm product={product()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Delete this product\?/)).toBeNull();
  });

  it("hides a showing product", async () => {
    actions.setProductStatusAction.mockResolvedValue({});
    render(<EditProductForm product={product()} />);

    fireEvent.click(screen.getByRole("button", { name: "Hide from shop" }));

    await waitFor(() =>
      expect(actions.setProductStatusAction).toHaveBeenCalledWith(PRODUCT, "hidden"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Show in shop" })).toBeInTheDocument(),
    );
  });
});
