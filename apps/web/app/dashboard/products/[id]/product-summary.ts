import { formatNaira } from "@gbam/shared";

/** The bits of a variant these helpers need. */
export type SummaryVariant = { priceKobo: number; stock: number | null; isEnabled: boolean };

/** "12 left", "Sold out" at 0, or "Not tracked" when stock is blank. */
export function stockLabel(variant: SummaryVariant): string {
  if (variant.stock === null) {
    return "Not tracked";
  }
  if (variant.stock === 0) {
    return "Sold out";
  }
  return `${variant.stock} left`;
}

/** "₦12,000 – ₦15,000" over the switched-on combinations, or one price when they're equal. */
export function priceRangeText(variants: SummaryVariant[]): string {
  let lowest: number | null = null;
  let highest: number | null = null;
  for (const variant of variants) {
    if (!variant.isEnabled) {
      continue;
    }
    if (lowest === null || variant.priceKobo < lowest) {
      lowest = variant.priceKobo;
    }
    if (highest === null || variant.priceKobo > highest) {
      highest = variant.priceKobo;
    }
  }
  if (lowest === null || highest === null) {
    return "Nothing switched on";
  }
  if (lowest === highest) {
    return formatNaira(lowest);
  }
  return `${formatNaira(lowest)} – ${formatNaira(highest)}`;
}

/**
 * "6 combinations · 4 on sale · 1 sold out · 23 in stock in total": what customers can
 * actually buy right now. "On sale" = switched on and not sold out. The stock total only
 * counts switched-on combinations whose stock is tracked, and is left out if none are.
 */
export function summaryText(variants: SummaryVariant[]): string {
  let onSale = 0;
  let soldOut = 0;
  let stockTotal = 0;
  let anyTracked = false;
  for (const variant of variants) {
    if (!variant.isEnabled) {
      continue;
    }
    if (variant.stock === 0) {
      soldOut = soldOut + 1;
    } else {
      onSale = onSale + 1;
    }
    if (variant.stock !== null) {
      anyTracked = true;
      stockTotal = stockTotal + variant.stock;
    }
  }
  let combinations = `${variants.length} combinations`;
  if (variants.length === 1) {
    combinations = "1 combination";
  }
  const parts = [combinations, `${onSale} on sale`, `${soldOut} sold out`];
  if (anyTracked) {
    parts.push(`${stockTotal} in stock in total`);
  }
  return parts.join(" · ");
}
