"use client";

import type { StorefrontProduct } from "@/lib/api";
import type { BasketLine } from "@/lib/basket";
import { VariantPicker } from "./variant-picker";

/**
 * A server page cannot hand a function to a client component, so this small client wrapper
 * owns the "add" handler. It does nothing yet: Task 10 wires it to the basket.
 */
export function ProductView({ product }: { product: StorefrontProduct }) {
  function handleAdd(line: BasketLine) {
    void line;
  }
  return <VariantPicker product={product} onAdd={handleAdd} />;
}
