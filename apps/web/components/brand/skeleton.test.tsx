import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardLoading from "@/app/dashboard/loading";
import OrderLoading from "@/app/dashboard/orders/[id]/loading";
import ProductsLoading from "@/app/dashboard/products/loading";
import ProductDetailsLoading from "@/app/dashboard/products/[id]/loading";
import EditProductLoading from "@/app/dashboard/products/[id]/edit/loading";
import NewProductLoading from "@/app/dashboard/products/new/loading";
import ShopLoading from "@/app/[slug]/loading";
import ProductPageLoading from "@/app/[slug]/[product]/loading";
import BasketLoading from "@/app/[slug]/order/loading";

// Every loading screen must tell screen-reader users what is happening.
const SCREENS = [
  { name: "orders list", Screen: DashboardLoading, text: "Loading your orders…" },
  { name: "order", Screen: OrderLoading, text: "Loading the order…" },
  { name: "products list", Screen: ProductsLoading, text: "Loading your products…" },
  { name: "product details", Screen: ProductDetailsLoading, text: "Loading the product…" },
  { name: "edit product", Screen: EditProductLoading, text: "Loading the product…" },
  { name: "new product", Screen: NewProductLoading, text: "Opening the product form…" },
  { name: "shop", Screen: ShopLoading, text: "Loading the shop…" },
  { name: "product page", Screen: ProductPageLoading, text: "Loading the product…" },
  { name: "basket", Screen: BasketLoading, text: "Opening your basket…" },
];

describe("loading screens", () => {
  for (const { name, Screen, text } of SCREENS) {
    it(`${name} announces itself`, () => {
      render(<Screen />);
      expect(screen.getByRole("status")).toHaveTextContent(text);
    });
  }
});
