"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails are small WebP files from our own storage */
import { variantTitle } from "@gbam/shared";
import { useState } from "react";
import { Button } from "@/components/brand/button";
import { TextField } from "@/components/brand/fields";
import { setAllPrices, setAllStock, type EditorVariant } from "./editor-state";

type Photo = { id: string; smallUrl: string };

const STOCK_HINT = "Leave stock blank if you don't count it (it never shows as sold out).";

const CELL_INPUT =
  "min-h-11 w-full min-w-0 rounded-xl border-2 border-brand-tint bg-white px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-[invalid=true]:border-coral-deep";

/** The price and stock of a product with no options: one row, shown instead of the table. */
export function SingleVariantFields({
  variant,
  errors,
  onChange,
}: {
  variant: EditorVariant;
  errors: Record<string, string>;
  onChange: (variant: EditorVariant) => void;
}) {
  return (
    <div data-tour="stock" className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Price (₦)"
        inputMode="numeric"
        value={variant.priceText}
        error={errors["variants.0.price"]}
        onChange={(event) => onChange({ ...variant, priceText: event.target.value })}
      />
      <TextField
        label="Stock"
        inputMode="numeric"
        hint={STOCK_HINT}
        value={variant.stockText}
        error={errors["variants.0.stock"]}
        onChange={(event) => onChange({ ...variant, stockText: event.target.value })}
      />
    </div>
  );
}

/** "Same price / same stock for all combinations": fill one or both, one Apply button. */
function SameForAllRow({ onApply }: { onApply: (priceText: string, stockText: string) => void }) {
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  return (
    <div
      data-tour="stock"
      className="bg-brand-tint flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-end"
    >
      <p className="text-ink text-sm font-bold sm:hidden">Same for all combinations</p>
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-ink text-sm font-bold">Same price for all</span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="text-ink font-bold">
            ₦
          </span>
          <input
            aria-label="Same price for all"
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className={CELL_INPUT}
          />
        </span>
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-ink text-sm font-bold">Same stock for all</span>
        <input
          aria-label="Same stock for all"
          inputMode="numeric"
          value={stock}
          onChange={(event) => setStock(event.target.value)}
          className={CELL_INPUT}
        />
      </label>
      <Button variant="secondary" onClick={() => onApply(price, stock)}>
        Apply to all
      </Button>
    </div>
  );
}

/** Which photo customers see for one combination: a small menu instead of a row of buttons. */
function PhotoMenu({
  title,
  variant,
  images,
  onPick,
}: {
  title: string;
  variant: EditorVariant;
  images: Photo[];
  onPick: (imageId: string | null) => void;
}) {
  let current = "Main";
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (image && image.id === variant.imageId) {
      current = String(i + 1);
    }
  }

  // <details> is the browser's own open/close box: no extra code needed to toggle it.
  return (
    <details className="relative">
      <summary
        aria-label={`Photo for ${title}: ${current}`}
        className="border-brand-tint text-ink focus-visible:outline-brand flex min-h-11 cursor-pointer list-none items-center rounded-xl border-2 bg-white px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span aria-hidden="true">Photo: {current}</span>
        <span aria-hidden="true" className="ml-1">
          ▾
        </span>
      </summary>
      <div className="border-brand-tint absolute right-0 z-10 mt-1 flex gap-2 rounded-xl border-2 bg-white p-2 shadow-lg">
        <button
          type="button"
          aria-pressed={variant.imageId === null}
          onClick={() => onPick(null)}
          className="border-brand-tint text-ink focus-visible:outline-brand aria-pressed:border-brand aria-pressed:bg-brand-tint min-h-11 rounded-lg border-2 px-3 text-sm focus-visible:outline-2"
        >
          Main photo
        </button>
        {images.map((image, imageIndex) => (
          <button
            key={image.id}
            type="button"
            aria-pressed={variant.imageId === image.id}
            aria-label={`Use photo ${imageIndex + 1} for ${title}`}
            onClick={() => onPick(image.id)}
            className="border-brand-tint focus-visible:outline-brand aria-pressed:border-brand size-11 shrink-0 overflow-hidden rounded-lg border-2 bg-white focus-visible:outline-2 aria-pressed:border-4"
          >
            <img src={image.smallUrl} alt="" className="size-full object-contain" />
          </button>
        ))}
      </div>
    </details>
  );
}

/** One table row per combination of option values: price, stock, photo, selling or not. */
export function VariantCards({
  variants,
  images,
  errors,
  onChange,
}: {
  variants: EditorVariant[];
  images: Photo[];
  errors: Record<string, string>;
  onChange: (variants: EditorVariant[]) => void;
}) {
  function replace(index: number, variant: EditorVariant) {
    const next = [...variants];
    next[index] = variant;
    onChange(next);
  }

  function applyToAll(priceText: string, stockText: string) {
    let next = variants;
    if (priceText.trim() !== "") {
      next = setAllPrices(next, priceText);
    }
    if (stockText.trim() !== "") {
      next = setAllStock(next, stockText);
    }
    onChange(next);
  }

  // Only show the photo column when there is more than one photo to choose from.
  const showPhotos = images.length > 1;

  return (
    <div data-tour="variants" className="flex flex-col gap-4">
      <SameForAllRow onApply={applyToAll} />
      <p className="text-ink-muted text-sm">{STOCK_HINT}</p>

      {errors["variants"] && (
        <p role="alert" className="text-coral-deep text-sm font-medium">
          {errors["variants"]}
        </p>
      )}

      <div className="border-brand-tint overflow-x-auto rounded-xl border-2 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-ink-muted text-xs uppercase">
            <tr>
              <th scope="col" className="p-3 font-medium">
                Combination
              </th>
              <th scope="col" className="p-3 font-medium">
                Price
              </th>
              <th scope="col" className="p-3 font-medium">
                Stock
              </th>
              {showPhotos && (
                <th scope="col" className="p-3 font-medium">
                  Photo
                </th>
              )}
              <th scope="col" className="p-3 font-medium">
                Selling
              </th>
            </tr>
          </thead>
          <tbody className="divide-brand-tint divide-y-2">
            {variants.map((variant, index) => {
              const title = variantTitle(variant.optionValues);
              const priceError = errors[`variants.${index}.price`];
              const stockError = errors[`variants.${index}.stock`];
              const imageError = errors[`variants.${index}.imageId`];
              // A combination that's switched off is faded: customers won't see it.
              let rowClass = "align-top";
              if (!variant.isEnabled) {
                rowClass = "align-top opacity-60";
              }
              let sellingText = "Selling";
              if (!variant.isEnabled) {
                sellingText = "Not selling";
              }
              return (
                <tr key={index} className={rowClass}>
                  <td className="text-ink p-3 font-bold wrap-break-word">{title}</td>
                  <td className="p-3">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true" className="text-ink font-bold">
                        ₦
                      </span>
                      <input
                        aria-label={`Price for ${title}`}
                        aria-invalid={priceError ? true : undefined}
                        inputMode="numeric"
                        value={variant.priceText}
                        onChange={(event) =>
                          replace(index, { ...variant, priceText: event.target.value })
                        }
                        className={`${CELL_INPUT} min-w-24`}
                      />
                    </span>
                    {priceError && (
                      <p role="alert" className="text-coral-deep mt-1 text-xs font-medium">
                        {priceError}
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    <input
                      aria-label={`Stock for ${title}`}
                      aria-invalid={stockError ? true : undefined}
                      inputMode="numeric"
                      value={variant.stockText}
                      onChange={(event) =>
                        replace(index, { ...variant, stockText: event.target.value })
                      }
                      className={`${CELL_INPUT} min-w-16`}
                    />
                    {stockError && (
                      <p role="alert" className="text-coral-deep mt-1 text-xs font-medium">
                        {stockError}
                      </p>
                    )}
                  </td>
                  {showPhotos && (
                    <td className="p-3">
                      <PhotoMenu
                        title={title}
                        variant={variant}
                        images={images}
                        onPick={(imageId) => replace(index, { ...variant, imageId })}
                      />
                      {imageError && (
                        <p role="alert" className="text-coral-deep mt-1 text-xs font-medium">
                          {imageError}
                        </p>
                      )}
                    </td>
                  )}
                  <td className="p-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={variant.isEnabled}
                      aria-label={`Sell ${title}`}
                      onClick={() => replace(index, { ...variant, isEnabled: !variant.isEnabled })}
                      className="border-brand text-ink focus-visible:outline-brand aria-checked:bg-brand-tint min-h-11 rounded-full border-2 px-3 text-sm font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {sellingText}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
