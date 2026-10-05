import { useMemo, useSyncExternalStore } from "react";
import type { StorefrontProduct } from "./api";

/** One line in the customer's basket. */
export type BasketLine = {
  variantId: string;
  productSlug: string;
  productName: string;
  variantTitle: string;
  priceKobo: number;
  photoUrl: string | null;
  quantity: number;
};

export type BasketProblem = {
  line: BasketLine;
  problem: "gone" | "sold_out" | "only_n_left" | "price_changed";
  left?: number;
  newPriceKobo?: number;
};

const MAX_QUANTITY = 99;

// Same-tab changes do not fire the browser's "storage" event (only OTHER tabs get it),
// so writeBasket also fires this event to tell every basket component on this page.
const CHANGE_EVENT = "gbam-basket-change";

// Used when localStorage is blocked (private mode, cookies off): the basket then lives
// only in memory until the page is closed. One entry per shop.
const memoryBaskets = new Map<string, string>();

function storageKey(shopSlug: string): string {
  return `gbam-basket:${shopSlug}`;
}

// ---- Pure functions (no browser needed) ----

export function addLine(lines: BasketLine[], line: BasketLine): BasketLine[] {
  const result: BasketLine[] = [];
  let merged = false;
  for (const existing of lines) {
    if (existing.variantId === line.variantId) {
      let quantity = existing.quantity + line.quantity;
      if (quantity > MAX_QUANTITY) {
        quantity = MAX_QUANTITY;
      }
      result.push({ ...existing, quantity });
      merged = true;
    } else {
      result.push(existing);
    }
  }
  if (!merged) {
    result.push(line);
  }
  return result;
}

/** Quantity 0 (or less) removes the line. */
export function setQuantity(
  lines: BasketLine[],
  variantId: string,
  quantity: number,
): BasketLine[] {
  const result: BasketLine[] = [];
  for (const line of lines) {
    if (line.variantId !== variantId) {
      result.push(line);
      continue;
    }
    if (quantity <= 0) {
      continue;
    }
    let safeQuantity = quantity;
    if (safeQuantity > MAX_QUANTITY) {
      safeQuantity = MAX_QUANTITY;
    }
    result.push({ ...line, quantity: safeQuantity });
  }
  return result;
}

export function basketTotals(lines: BasketLine[]): { itemCount: number; totalKobo: number } {
  let itemCount = 0;
  let totalKobo = 0;
  for (const line of lines) {
    itemCount = itemCount + line.quantity;
    totalKobo = totalKobo + line.priceKobo * line.quantity;
  }
  return { itemCount, totalKobo };
}

/**
 * Compares the basket with fresh product data from the server. The basket was saved
 * days ago, so a product may have been deleted, sold out, or repriced since.
 */
export function checkBasket(lines: BasketLine[], products: StorefrontProduct[]): BasketProblem[] {
  const problems: BasketProblem[] = [];
  for (const line of lines) {
    let product: StorefrontProduct | undefined = undefined;
    for (const candidate of products) {
      if (candidate.slug === line.productSlug) {
        product = candidate;
      }
    }
    let variant: StorefrontProduct["variants"][number] | undefined = undefined;
    if (product !== undefined) {
      for (const candidate of product.variants) {
        if (candidate.id === line.variantId) {
          variant = candidate;
        }
      }
    }
    if (variant === undefined) {
      problems.push({ line, problem: "gone" });
      continue;
    }
    // stock null means the seller does not track stock: always available.
    if (variant.stock !== null && variant.stock <= 0) {
      problems.push({ line, problem: "sold_out" });
      continue;
    }
    if (variant.stock !== null && line.quantity > variant.stock) {
      problems.push({ line, problem: "only_n_left", left: variant.stock });
      continue;
    }
    if (variant.priceKobo !== line.priceKobo) {
      problems.push({ line, problem: "price_changed", newPriceKobo: variant.priceKobo });
    }
  }
  return problems;
}

// ---- Browser storage (every access is wrapped: storage can be blocked or full) ----

/** The saved basket as JSON text ("" when there is none). */
function readRaw(shopSlug: string): string {
  try {
    const stored = localStorage.getItem(storageKey(shopSlug));
    if (stored === null) {
      return "";
    }
    return stored;
  } catch {
    const inMemory = memoryBaskets.get(shopSlug);
    if (inMemory === undefined) {
      return "";
    }
    return inMemory;
  }
}

function isBasketLine(value: unknown): value is BasketLine {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const line = value as Record<string, unknown>;
  const photoOk = line.photoUrl === null || typeof line.photoUrl === "string";
  return (
    typeof line.variantId === "string" &&
    typeof line.productSlug === "string" &&
    typeof line.productName === "string" &&
    typeof line.variantTitle === "string" &&
    typeof line.priceKobo === "number" &&
    typeof line.quantity === "number" &&
    photoOk
  );
}

/** Turns saved text back into lines. Anything unreadable becomes an empty basket. */
function parseBasket(raw: string): BasketLine[] {
  if (raw === "") {
    return [];
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return [];
    }
    const lines: BasketLine[] = [];
    for (const item of data) {
      if (isBasketLine(item)) {
        lines.push(item);
      }
    }
    return lines;
  } catch {
    return [];
  }
}

export function readBasket(shopSlug: string): BasketLine[] {
  return parseBasket(readRaw(shopSlug));
}

export function writeBasket(shopSlug: string, lines: BasketLine[]): void {
  const text = JSON.stringify(lines);
  try {
    localStorage.setItem(storageKey(shopSlug), text);
  } catch {
    memoryBaskets.set(shopSlug, text);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// ---- React hook ----

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // another tab changed the basket
  window.addEventListener(CHANGE_EVENT, onChange); // this tab changed it
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function serverSnapshot(): string {
  return "";
}

/**
 * The basket for one shop. useSyncExternalStore is React's way to read data that lives
 * outside React (here: localStorage) and re-draw when it changes. It compares the JSON
 * text, so a new lines array is only built when the text really changed.
 */
export function useBasket(shopSlug: string) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(shopSlug), serverSnapshot);
  // useMemo keeps the same array until the text changes, so effects that watch it stay calm.
  const lines = useMemo(() => parseBasket(raw), [raw]);

  // Each change re-reads the latest saved basket first, so two quick changes cannot
  // overwrite each other with a stale copy.
  function add(line: BasketLine) {
    writeBasket(shopSlug, addLine(readBasket(shopSlug), line));
  }
  function changeQuantity(variantId: string, quantity: number) {
    writeBasket(shopSlug, setQuantity(readBasket(shopSlug), variantId, quantity));
  }
  function clear() {
    writeBasket(shopSlug, []);
  }

  return { lines, add, setQuantity: changeQuantity, clear };
}
