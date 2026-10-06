"use client";

import Link from "next/link";
import { basketTotals, useBasket } from "@/lib/basket";

/**
 * The shop's own header on its pages: the first letter of its name as a round badge, the
 * name (back to the shop), how ordering works, and a basket button with the item count.
 */
export function ShopHeader({ shopSlug, businessName }: { shopSlug: string; businessName: string }) {
  const basket = useBasket(shopSlug);
  const { itemCount } = basketTotals(basket.lines);
  let initial = "?";
  if (businessName.trim() !== "") {
    initial = businessName.trim().charAt(0).toUpperCase();
  }

  return (
    <header className="bg-brand-tint">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="bg-brand font-display flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/${shopSlug}`}
            className="text-ink focus-visible:outline-brand block truncate font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {businessName}
          </Link>
          <p className="text-ink-muted truncate text-xs">Orders via WhatsApp · Pay with Paystack</p>
        </div>
        <Link
          href={`/${shopSlug}/order`}
          className="border-brand text-ink hover:bg-white focus-visible:outline-brand inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 bg-white/70 px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true">🧺</span>
          Your order ({itemCount})
        </Link>
      </div>
    </header>
  );
}
