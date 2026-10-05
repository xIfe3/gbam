"use client";

import type { StorefrontProduct } from "@/lib/api";
import { useBasket } from "@/lib/basket";
import { OrderingTip } from "./ordering-tip";
import { VariantPicker } from "./variant-picker";

/**
 * A server page cannot hand a function to a client component, so this small client wrapper
 * owns the "add" handler and puts the chosen variant into this shop's basket.
 */
export function ProductView({
  shopSlug,
  product,
}: {
  shopSlug: string;
  product: StorefrontProduct;
}) {
  const basket = useBasket(shopSlug);
  return (
    <>
      <OrderingTip />
      <VariantPicker product={product} onAdd={basket.add} />
    </>
  );
}
