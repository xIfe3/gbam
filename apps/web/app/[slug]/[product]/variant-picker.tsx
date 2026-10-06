// "use client" = this component runs in the BROWSER (it needs clicks and state).
"use client";

import { formatNaira } from "@gbam/shared";
import { useState } from "react";
import { Button } from "@/components/brand/button";
import type { StorefrontProduct, StorefrontVariant } from "@/lib/api";
import type { BasketLine } from "@/lib/basket";

type Props = {
  product: StorefrontProduct;
  onAdd: (line: BasketLine) => void;
  /** Where "View your order" goes after adding (the shop's order page). */
  orderHref?: string;
};

// How long the button says "✓ Added" after a tap.
const ADDED_MS = 2500;

const MAX_QUANTITY = 99;
const LOW_STOCK_AT = 5;

// 44px round buttons with a visible keyboard focus ring.
const stepperClasses =
  "text-ink border-brand-tint hover:bg-coral-wash focus-visible:outline-brand flex size-11 items-center justify-center rounded-full border-2 bg-white text-xl focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";

function isInStock(variant: StorefrontVariant): boolean {
  // stock null means "not tracked", which counts as always available.
  return variant.stock === null || variant.stock > 0;
}

/**
 * Does any in-stock variant have `value` at option `optionIndex` while matching every
 * OTHER option the customer has already chosen? If not, the value is crossed out.
 */
function valueIsAvailable(
  variants: StorefrontVariant[],
  chosen: (string | null)[],
  optionIndex: number,
  value: string,
): boolean {
  for (const variant of variants) {
    if (!isInStock(variant)) {
      continue;
    }
    if (variant.optionValues[optionIndex] !== value) {
      continue;
    }
    let matchesOthers = true;
    for (let i = 0; i < chosen.length; i++) {
      const pick = chosen[i];
      if (i === optionIndex || pick === null) {
        continue;
      }
      if (variant.optionValues[i] !== pick) {
        matchesOthers = false;
      }
    }
    if (matchesOthers) {
      return true;
    }
  }
  return false;
}

/** The variant whose option values equal the customer's choices, or null. */
function findVariant(
  variants: StorefrontVariant[],
  chosen: (string | null)[],
): StorefrontVariant | null {
  for (const variant of variants) {
    let matches = true;
    for (let i = 0; i < chosen.length; i++) {
      if (variant.optionValues[i] !== chosen[i]) {
        matches = false;
      }
    }
    if (matches) {
      return variant;
    }
  }
  return null;
}

/** Photos, option buttons, price, quantity and "Add to order" for one product. */
export function VariantPicker({ product, onAdd, orderHref }: Props) {
  // useState: values React remembers between re-renders. Changing one re-draws the component.
  const [chosen, setChosen] = useState<(string | null)[]>(product.options.map(() => null));
  const [quantity, setQuantity] = useState(1);
  // "✓ Added" on the button for a moment, and a lasting "Added to your order" line.
  const [justAdded, setJustAdded] = useState(false);
  const [addedOnce, setAddedOnce] = useState(false);
  // A thumbnail the customer tapped. It wins over the variant's own photo until they
  // pick a different option.
  const [tappedImageId, setTappedImageId] = useState<string | null>(null);

  const allChosen = !chosen.includes(null);
  let variant: StorefrontVariant | null = null;
  if (allChosen) {
    variant = findVariant(product.variants, chosen);
  }

  // Which photo is the big one: tapped thumbnail, else the variant's photo, else photo 1.
  let shownImageId = tappedImageId;
  if (shownImageId === null && variant !== null) {
    shownImageId = variant.imageId;
  }
  let shownImage = product.images[0];
  for (const image of product.images) {
    if (image.id === shownImageId) {
      shownImage = image;
    }
  }

  // Price: the chosen variant's, or "from" the lowest while the choice is incomplete.
  let priceText = "";
  if (variant !== null) {
    priceText = formatNaira(variant.priceKobo);
  } else if (product.variants.length > 0) {
    let lowest = product.variants[0]?.priceKobo ?? 0;
    let highest = lowest;
    for (const candidate of product.variants) {
      if (candidate.priceKobo < lowest) lowest = candidate.priceKobo;
      if (candidate.priceKobo > highest) highest = candidate.priceKobo;
    }
    priceText = formatNaira(lowest);
    if (lowest !== highest) {
      priceText = `from ${priceText}`;
    }
  }

  // Quantity limit: tracked stock, or 99 when stock isn't tracked.
  let maxQuantity = MAX_QUANTITY;
  if (variant !== null && variant.stock !== null) {
    maxQuantity = Math.min(variant.stock, MAX_QUANTITY);
  }
  let shownQuantity = Math.min(quantity, maxQuantity);
  if (shownQuantity < 1) {
    shownQuantity = 1;
  }

  const soldOut = variant !== null && !isInStock(variant);
  const canAdd = variant !== null && !soldOut;

  let lowStockText = "";
  if (variant !== null && variant.stock !== null && variant.stock > 0) {
    if (variant.stock <= LOW_STOCK_AT) {
      lowStockText = `${variant.stock} left`;
    }
  }

  // Plain <img>: the URLs are absolute and aspect-square stops layout shift.
  // The main photo is not lazy: it is the first thing the visitor sees.
  // object-contain + a white frame: the whole photo shows at its real shape (a wide logo
  // or a tall dress), never cropped or zoomed to fill the square.
  let mainImage = (
    <div className="border-brand-tint aspect-square w-full rounded-2xl border bg-white md:flex-1" />
  );
  if (shownImage !== undefined) {
    mainImage = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={shownImage.largeUrl}
        alt={product.name}
        width={800}
        height={800}
        className="border-brand-tint aspect-square w-full rounded-2xl border bg-white object-contain p-3 md:flex-1"
      />
    );
  }

  // Tell the customer, in words, what's still missing or what they've picked.
  const missing: string[] = [];
  for (let i = 0; i < product.options.length; i++) {
    const option = product.options[i];
    if (option && chosen[i] === null) {
      missing.push(option.name);
    }
  }
  let pickHint: string | null = null;
  if (missing.length > 0) {
    pickHint = `Choose a ${missing.join(" and ")} to add it to your order.`;
  } else if (variant !== null && product.options.length > 0) {
    pickHint = `You picked: ${variant.title}`;
  }

  let addButtonText = "Add to order";
  if (justAdded) {
    addButtonText = "✓ Added";
  }

  function choose(optionIndex: number, value: string) {
    const next = [...chosen];
    next[optionIndex] = value;
    setChosen(next);
    setTappedImageId(null);
    setQuantity(1);
  }

  function handleAdd() {
    if (variant === null) {
      throw new Error("Cannot add before every option is chosen");
    }
    let photoUrl: string | null = null;
    if (shownImage !== undefined) {
      photoUrl = shownImage.smallUrl;
    }
    onAdd({
      variantId: variant.id,
      productSlug: product.slug,
      productName: product.name,
      variantTitle: variant.title,
      priceKobo: variant.priceKobo,
      photoUrl,
      quantity: shownQuantity,
    });
    setJustAdded(true);
    setAddedOnce(true);
    setTimeout(() => setJustAdded(false), ADDED_MS);
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
      {/* min-w-0: lets the thumbnail row scroll inside itself instead of widening the page. */}
      <div className="flex min-w-0 flex-col gap-3 md:flex-row-reverse md:items-start">
        {mainImage}
        {product.images.length > 1 && (
          // Swipe sideways on phones (scroll-snap); a column down the left on wider screens.
          <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto md:w-20 md:flex-col md:overflow-visible">
            {product.images.map((image, index) => (
              <li key={image.id} className="shrink-0 snap-start">
                <button
                  type="button"
                  aria-label={`Show photo ${index + 1}`}
                  aria-pressed={shownImage !== undefined && shownImage.id === image.id}
                  onClick={() => setTappedImageId(image.id)}
                  className="focus-visible:outline-brand border-brand-tint aria-pressed:border-brand block size-14 overflow-hidden rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-2 md:size-20"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.smallUrl}
                    alt=""
                    width={80}
                    height={80}
                    loading="lazy"
                    className="size-full bg-white object-contain p-1"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-brand-tint min-w-0 md:rounded-2xl md:border md:bg-white md:p-6">
        <h1 className="font-display text-ink text-3xl leading-tight font-black">{product.name}</h1>
        {/* aria-live: screen readers hear the price and stock change when options are picked. */}
        <div aria-live="polite">
          <p className="text-ink mt-2 text-2xl font-bold">{priceText}</p>
          {lowStockText && <p className="text-ink-muted mt-1 text-sm">{lowStockText}</p>}
          {soldOut && <p className="text-ink-muted mt-1 text-sm">Sold out</p>}
        </div>
        {product.description && (
          <p className="text-ink-muted mt-4 whitespace-pre-line">{product.description}</p>
        )}

        {product.options.map((option, optionIndex) => (
          <fieldset key={option.name} className="mt-6">
            <legend className="text-ink mb-2 font-bold">Choose a {option.name}</legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const available = valueIsAvailable(product.variants, chosen, optionIndex, value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={chosen[optionIndex] === value}
                    aria-label={available ? value : `${value}, sold out`}
                    disabled={!available}
                    onClick={() => choose(optionIndex, value)}
                    className="text-ink border-brand-tint hover:bg-coral-wash focus-visible:outline-brand aria-pressed:border-brand aria-pressed:bg-brand-tint min-h-11 min-w-11 rounded-full border-2 bg-white px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:line-through disabled:opacity-40"
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {/* On phones this bar is pinned to the bottom of the screen, so "Add to order" is
            always one tap away; on wider screens it sits in the card. */}
        <div className="border-brand-tint fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t-2 bg-white px-4 py-3 md:static md:mt-6 md:border-0 md:p-0">
          <button
            type="button"
            aria-label="Fewer"
            className={stepperClasses}
            disabled={shownQuantity <= 1}
            onClick={() => setQuantity(shownQuantity - 1)}
          >
            −
          </button>
          <span data-testid="quantity" className="text-ink w-8 text-center font-bold">
            {shownQuantity}
          </span>
          <button
            type="button"
            aria-label="More"
            className={stepperClasses}
            disabled={shownQuantity >= maxQuantity}
            onClick={() => setQuantity(shownQuantity + 1)}
          >
            +
          </button>
          <div className="flex-1 md:flex-none">
            <Button variant="primary" size="lg" disabled={!canAdd} onClick={handleAdd}>
              {addButtonText}
            </Button>
          </div>
        </div>

        {pickHint && <p className="text-ink-muted mt-4 text-sm">{pickHint}</p>}

        {/* role="status": screen readers announce it; it stays so they can go to checkout. */}
        <div role="status" className="mt-4">
          {addedOnce && (
            <p className="bg-brand-tint text-ink flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm font-medium">
              <span>✓ Added to your order.</span>
              {orderHref && (
                <a
                  href={orderHref}
                  className="text-brand focus-visible:outline-brand font-bold underline focus-visible:outline-2"
                >
                  View your order →
                </a>
              )}
            </p>
          )}
        </div>

        <ul className="text-ink-muted mt-6 flex flex-col gap-1.5 text-sm">
          <li>💬 Order updates come on WhatsApp</li>
          <li>🔒 Pay securely with Paystack</li>
        </ul>
      </div>
    </div>
  );
}
