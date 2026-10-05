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
};

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
      if (i === optionIndex || pick === null || pick === undefined) {
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
export function VariantPicker({ product, onAdd }: Props) {
  // useState: values React remembers between re-renders. Changing one re-draws the component.
  const [chosen, setChosen] = useState<(string | null)[]>(product.options.map(() => null));
  const [quantity, setQuantity] = useState(1);
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
  } else {
    let lowest = product.variants[0]?.priceKobo ?? 0;
    let highest = lowest;
    for (const candidate of product.variants) {
      if (candidate.priceKobo < lowest) lowest = candidate.priceKobo;
      if (candidate.priceKobo > highest) highest = candidate.priceKobo;
    }
    priceText = formatNaira(lowest);
    if (lowest !== highest) {
      priceText = `From ${priceText}`;
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
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-10">
      <div className="flex flex-col gap-3 md:flex-row-reverse md:items-start">
        {shownImage ? (
          // Plain <img>: the URLs are absolute and aspect-square stops layout shift.
          // The main photo is not lazy: it is the first thing the visitor sees.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownImage.largeUrl}
            alt={product.name}
            width={800}
            height={800}
            className="bg-blush aspect-square w-full rounded-2xl object-cover md:flex-1"
          />
        ) : (
          <div className="bg-blush aspect-square w-full rounded-2xl md:flex-1" />
        )}
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
                    className="size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h1 className="font-display text-ink text-3xl leading-tight font-black">{product.name}</h1>
        <p className="text-ink mt-2 text-2xl font-bold">{priceText}</p>
        {lowStockText && <p className="text-ink-muted mt-1 text-sm">{lowStockText}</p>}
        {soldOut && <p className="text-ink-muted mt-1 text-sm">Sold out</p>}
        {product.description && (
          <p className="text-ink-muted mt-4 whitespace-pre-line">{product.description}</p>
        )}

        {product.options.map((option, optionIndex) => (
          <fieldset key={option.name} className="mt-6">
            <legend className="text-ink mb-2 font-bold">{option.name}</legend>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const available = valueIsAvailable(product.variants, chosen, optionIndex, value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={chosen[optionIndex] === value}
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

        <div className="mt-6 flex items-center gap-3">
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
        </div>

        <div className="mt-6">
          <Button variant="primary" size="lg" disabled={!canAdd} onClick={handleAdd}>
            Add to order
          </Button>
        </div>
      </div>
    </div>
  );
}
