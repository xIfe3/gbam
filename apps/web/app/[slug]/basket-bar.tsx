"use client";

import { formatNaira } from "@gbam/shared";
import Link from "next/link";
import { useEffect } from "react";
import { basketTotals, useBasket } from "@/lib/basket";

type Props = {
  shopSlug: string;
  /** True when Paystack just sent the customer back (?paid=GB-XXXX): the order is done. */
  clearOnMount?: boolean;
};

/** A bar fixed to the bottom of the screen showing the basket, with a link to order. */
export function BasketBar({ shopSlug, clearOnMount }: Props) {
  const basket = useBasket(shopSlug);
  const clearBasket = basket.clear;

  // An effect runs after the page is drawn. Here: empty the basket once the payment
  // return page is shown, so the paid items are not ordered again.
  useEffect(() => {
    if (clearOnMount) {
      clearBasket();
    }
  }, [clearOnMount, clearBasket]);

  const { itemCount, totalKobo } = basketTotals(basket.lines);
  if (itemCount === 0) {
    return null;
  }

  let itemsLabel = `${itemCount} items`;
  if (itemCount === 1) {
    itemsLabel = "1 item";
  }

  return (
    <div className="border-brand-tint fixed inset-x-0 bottom-0 z-10 border-t-2 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p className="text-ink font-bold">
          {itemsLabel} · {formatNaira(totalKobo)}
        </p>
        <Link
          href={`/${shopSlug}/order`}
          className="bg-brand hover:bg-brand-hover focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          View basket
        </Link>
      </div>
    </div>
  );
}
