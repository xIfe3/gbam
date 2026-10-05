"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails are small WebP files from our own storage */
import { variantTitle } from "@gbam/shared";
import { useState } from "react";
import { Button } from "@/components/brand/button";
import { TextField } from "@/components/brand/fields";
import { setAllPrices, setAllStock, type EditorVariant } from "./editor-state";

type Photo = { id: string; smallUrl: string };

const STOCK_HINT = "Leave blank if you don't count stock";

/** The price and stock of a product with no options: one row, shown instead of cards. */
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
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Price (₦)"
        inputMode="numeric"
        placeholder="12,000"
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

/** "Set one price for all": type once, apply to every card. */
function SetAllRow({
  label,
  buttonLabel,
  placeholder,
  onApply,
}: {
  label: string;
  buttonLabel: string;
  placeholder: string;
  onApply: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <TextField
          label={label}
          inputMode="numeric"
          placeholder={placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <Button variant="secondary" onClick={() => onApply(text)}>
        {buttonLabel}
      </Button>
    </div>
  );
}

/** One card per combination of option values. */
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

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-brand-tint flex flex-col gap-3 rounded-xl p-4">
        <SetAllRow
          label="Set one price for all"
          buttonLabel="Apply price"
          placeholder="12,000"
          onApply={(text) => onChange(setAllPrices(variants, text))}
        />
        <SetAllRow
          label="Set one stock for all"
          buttonLabel="Apply stock"
          placeholder="10"
          onApply={(text) => onChange(setAllStock(variants, text))}
        />
      </div>

      {errors["variants"] && (
        <p role="alert" className="text-coral-deep text-sm font-medium">
          {errors["variants"]}
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {variants.map((variant, index) => {
          const title = variantTitle(variant.optionValues);
          return (
            <li
              key={index}
              className="border-brand-tint flex flex-col gap-3 rounded-xl border-2 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-ink min-w-0 text-base font-bold wrap-break-word">{title}</h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={variant.isEnabled}
                  aria-label={`${title} on or off`}
                  onClick={() => replace(index, { ...variant, isEnabled: !variant.isEnabled })}
                  className="border-brand text-ink focus-visible:outline-brand aria-checked:bg-brand-tint min-h-11 min-w-16 shrink-0 rounded-full border-2 px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {variant.isEnabled && "On"}
                  {!variant.isEnabled && "Off"}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label={`Price for ${title}`}
                  inputMode="numeric"
                  placeholder="12,000"
                  value={variant.priceText}
                  error={errors[`variants.${index}.price`]}
                  onChange={(event) => replace(index, { ...variant, priceText: event.target.value })}
                />
                <TextField
                  label={`Stock for ${title}`}
                  inputMode="numeric"
                  hint={STOCK_HINT}
                  value={variant.stockText}
                  error={errors[`variants.${index}.stock`]}
                  onChange={(event) => replace(index, { ...variant, stockText: event.target.value })}
                />
              </div>

              <div role="group" aria-label={`Photo for ${title}`} className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={variant.imageId === null}
                  onClick={() => replace(index, { ...variant, imageId: null })}
                  className="border-brand-tint text-ink focus-visible:outline-brand aria-pressed:border-brand aria-pressed:bg-brand-tint min-h-11 rounded-xl border-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Main photo
                </button>
                {images.map((image, imageIndex) => (
                  <button
                    key={image.id}
                    type="button"
                    aria-pressed={variant.imageId === image.id}
                    aria-label={`Use photo ${imageIndex + 1} for ${title}`}
                    onClick={() => replace(index, { ...variant, imageId: image.id })}
                    className="border-brand-tint focus-visible:outline-brand aria-pressed:border-brand size-11 overflow-hidden rounded-xl border-2 focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:border-4"
                  >
                    <img src={image.smallUrl} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
              {errors[`variants.${index}.imageId`] && (
                <p role="alert" className="text-coral-deep text-sm font-medium">
                  {errors[`variants.${index}.imageId`]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
