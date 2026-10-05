import {
  combinations,
  parseNairaInput,
  productInputSchema,
  type ProductInput,
} from "@gbam/shared";

// Pure functions (no React) for the product editor, so they are easy to test.

export type EditorOption = { name: string; values: string[] };

export type EditorVariant = {
  /** Set when the variant already exists on the server, so saving keeps it. */
  id?: string;
  optionValues: string[];
  /** As typed, e.g. "₦12,000". */
  priceText: string;
  /** As typed. Blank means "don't track stock". */
  stockText: string;
  imageId: string | null;
  isEnabled: boolean;
};

export type EditorState = {
  name: string;
  description: string;
  images: { id: string; smallUrl: string }[];
  hasOptions: boolean;
  options: EditorOption[];
  variants: EditorVariant[];
  /**
   * While an option has no values there are no combinations, so the variant list is empty.
   * The variants (and the options they belonged to) are kept here so their ids, prices and
   * stock come back once values exist again.
   */
  stash?: { options: EditorOption[]; variants: EditorVariant[] };
};

/** A new product: no photos yet, no options, one blank variant. */
export function emptyState(): EditorState {
  return {
    name: "",
    description: "",
    images: [],
    hasOptions: false,
    options: [],
    variants: [blankVariant([])],
  };
}

function blankVariant(optionValues: string[]): EditorVariant {
  return { optionValues, priceText: "", stockText: "", imageId: null, isEnabled: true };
}

/** What the API's product looks like in the editor. Images are in position order. */
export function stateFromProduct(product: {
  name: string;
  description: string | null;
  images: { id: string; position: number; smallUrl: string }[];
  options: EditorOption[];
  variants: {
    id: string;
    optionValues: string[];
    priceKobo: number;
    stock: number | null;
    imageId: string | null;
    isEnabled: boolean;
  }[];
}): EditorState {
  const sorted = [...product.images].sort((a, b) => a.position - b.position);
  const images: { id: string; smallUrl: string }[] = [];
  for (const image of sorted) {
    images.push({ id: image.id, smallUrl: image.smallUrl });
  }

  const variants: EditorVariant[] = [];
  for (const variant of product.variants) {
    let stockText = "";
    if (variant.stock !== null) {
      stockText = String(variant.stock);
    }
    variants.push({
      id: variant.id,
      optionValues: variant.optionValues,
      priceText: String(variant.priceKobo / 100),
      stockText,
      imageId: variant.imageId,
      isEnabled: variant.isEnabled,
    });
  }

  let description = "";
  if (product.description !== null) {
    description = product.description;
  }
  return {
    name: product.name,
    description,
    images,
    hasOptions: product.options.length > 0,
    options: product.options,
    variants,
  };
}

/**
 * For each new option, which old option it came from (or null if it is brand new).
 * First by name, then the leftover old options are handed out in order. This is what lets
 * a renamed option ("Size" → "Sizes") keep its variants, and a removed option be spotted.
 */
function matchOptions(oldOptions: EditorOption[], newOptions: EditorOption[]): (number | null)[] {
  const result: (number | null)[] = [];
  const used = new Set<number>();

  for (const newOption of newOptions) {
    let found: number | null = null;
    for (let i = 0; i < oldOptions.length; i++) {
      const oldOption = oldOptions[i];
      if (oldOption && !used.has(i) && oldOption.name === newOption.name) {
        found = i;
        break;
      }
    }
    if (found !== null) {
      used.add(found);
    }
    result.push(found);
  }

  for (let n = 0; n < result.length; n++) {
    if (result[n] !== null) {
      continue;
    }
    for (let i = 0; i < oldOptions.length; i++) {
      if (!used.has(i)) {
        result[n] = i;
        used.add(i);
        break;
      }
    }
  }
  return result;
}

/**
 * The old value that a new value stands for. The same text is the same value. Otherwise a
 * value at the same position that no longer exists is a rename ("M" → "Medium").
 * null means a brand-new value.
 */
function oldValueFor(oldValues: string[], newValues: string[], newIndex: number): string | null {
  const newValue = newValues[newIndex];
  if (newValue === undefined) {
    return null;
  }
  if (oldValues.includes(newValue)) {
    return newValue;
  }
  const atSamePosition = oldValues[newIndex];
  if (atSamePosition !== undefined && !newValues.includes(atSamePosition)) {
    return atSamePosition;
  }
  return null;
}

/**
 * Rebuilds the variant list after the options changed. Every combination of the new
 * options reuses the old variant it corresponds to, so price, stock, photo and id carry over.
 * Each old variant is used at most once, so an id never appears twice.
 */
export function rebuildVariants(
  previous: EditorVariant[],
  oldOptions: EditorOption[],
  newOptions: EditorOption[],
): EditorVariant[] {
  const alignment = matchOptions(oldOptions, newOptions);
  const combos = combinations(newOptions);
  const usedPrevious = new Set<number>();
  const result: EditorVariant[] = [];

  for (const combo of combos) {
    // required[p] = the value the old variant must have at old option position p.
    // undefined = any value (that old option was removed, or the new one has no old twin).
    const required: (string | undefined)[] = [];
    let isNewCombination = false;

    for (let i = 0; i < newOptions.length; i++) {
      const oldIndex = alignment[i];
      const newOption = newOptions[i];
      const value = combo[i];
      if (oldIndex === null || oldIndex === undefined || !newOption || value === undefined) {
        continue;
      }
      const oldOption = oldOptions[oldIndex];
      if (!oldOption) {
        continue;
      }
      const newIndex = newOption.values.indexOf(value);
      const oldValue = oldValueFor(oldOption.values, newOption.values, newIndex);
      if (oldValue === null) {
        isNewCombination = true;
      } else {
        required[oldIndex] = oldValue;
      }
    }

    let match: EditorVariant | null = null;
    if (!isNewCombination) {
      for (let p = 0; p < previous.length; p++) {
        const candidate = previous[p];
        if (!candidate || usedPrevious.has(p)) {
          continue;
        }
        let fits = true;
        for (let o = 0; o < required.length; o++) {
          const wanted = required[o];
          if (wanted !== undefined && candidate.optionValues[o] !== wanted) {
            fits = false;
            break;
          }
        }
        if (fits) {
          usedPrevious.add(p);
          match = candidate;
          break;
        }
      }
    }

    if (match === null) {
      result.push(blankVariant(combo));
    } else {
      result.push({ ...match, optionValues: combo });
    }
  }
  return result;
}

function anyOptionEmpty(options: EditorOption[]): boolean {
  for (const option of options) {
    if (option.values.length === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Changes the options and keeps the variants in step. While an option has no values the
 * variants are parked in `stash` (not thrown away); once every option has a value the
 * variants are rebuilt from whatever is current, or from the stash.
 */
export function withOptions(state: EditorState, options: EditorOption[]): EditorState {
  let source = { options: state.options, variants: state.variants };
  if (state.variants.length === 0 && state.stash) {
    source = state.stash;
  }

  if (anyOptionEmpty(options)) {
    if (source.variants.length === 0) {
      return { ...state, options, variants: [] };
    }
    return { ...state, options, variants: [], stash: source };
  }

  const variants = rebuildVariants(source.variants, source.options, options);
  return { ...state, options, variants, stash: undefined };
}

/** Switches "Does it come in options?". Going back to No restores the single variant. */
export function withHasOptions(state: EditorState, hasOptions: boolean): EditorState {
  if (hasOptions === state.hasOptions) {
    return state;
  }
  let options: EditorOption[] = [];
  if (hasOptions) {
    options = [{ name: "", values: [] }];
  }
  return { ...withOptions(state, options), hasOptions };
}

export function setAllPrices(variants: EditorVariant[], priceText: string): EditorVariant[] {
  const result: EditorVariant[] = [];
  for (const variant of variants) {
    result.push({ ...variant, priceText });
  }
  return result;
}

export function setAllStock(variants: EditorVariant[], stockText: string): EditorVariant[] {
  const result: EditorVariant[] = [];
  for (const variant of variants) {
    result.push({ ...variant, stockText });
  }
  return result;
}

/** After a photo is removed, variants that used it fall back to the main photo. */
export function clearMissingImages(
  variants: EditorVariant[],
  images: { id: string }[],
): EditorVariant[] {
  const result: EditorVariant[] = [];
  for (const variant of variants) {
    let stillThere = variant.imageId === null;
    for (const image of images) {
      if (image.id === variant.imageId) {
        stillThere = true;
      }
    }
    if (stillThere) {
      result.push(variant);
    } else {
      result.push({ ...variant, imageId: null });
    }
  }
  return result;
}

/** Turns zod's path into the key the screens look errors up by, e.g. "variants.2.price". */
function errorKey(path: PropertyKey[]): string {
  const parts: string[] = [];
  for (const part of path) {
    parts.push(String(part));
  }
  const key = parts.join(".");
  if (key === "imageIds") {
    return "images";
  }
  return key.replace(/\.priceKobo$/, ".price");
}

/** The first error in a list of issues, written for the seller. */
function friendlyMessage(key: string, code: string, message: string): string {
  if (key === "name") {
    return "Enter a product name";
  }
  if (key === "images" && code === "too_small") {
    return "Add at least one photo";
  }
  if (/^options\.\d+\.name$/.test(key) && code !== "custom") {
    return "Give this option a name, like Size";
  }
  if (/^options\.\d+\.values$/.test(key) && code === "too_small") {
    return "Add at least one value";
  }
  return message;
}

export type BuildResult =
  | { ok: true; input: ProductInput }
  | { ok: false; errors: Record<string, string> };

/**
 * Checks what the seller typed and builds the product to send. Prices go through
 * parseNairaInput (whole naira → kobo). A blank stock means "not tracked" (null).
 * Errors are keyed like "name", "images", "options.0.values", "variants.2.price".
 */
export function toProductInput(state: EditorState): BuildResult {
  const errors: Record<string, string> = {};
  const variants: unknown[] = [];

  let sourceVariants = state.variants;
  let options = state.options;
  if (!state.hasOptions) {
    // A product with no options has exactly one variant, with no option values.
    options = [];
    const first = state.variants[0];
    if (first) {
      sourceVariants = [{ ...first, optionValues: [] }];
    } else {
      sourceVariants = [blankVariant([])];
    }
  }

  for (let i = 0; i < sourceVariants.length; i++) {
    const variant = sourceVariants[i];
    if (!variant) {
      continue;
    }

    const priceKobo = parseNairaInput(variant.priceText);
    if (priceKobo === null) {
      if (variant.priceText.trim() === "") {
        errors[`variants.${i}.price`] = "Enter a price, like 12,000";
      } else {
        errors[`variants.${i}.price`] = "Enter the price in naira, like 12,000";
      }
    }

    let stock: number | null = null;
    const stockText = variant.stockText.trim();
    if (stockText !== "") {
      if (/^\d+$/.test(stockText)) {
        stock = Number(stockText);
      } else {
        errors[`variants.${i}.stock`] = "Enter a whole number, or leave it blank";
      }
    }

    const entry: Record<string, unknown> = {
      optionValues: variant.optionValues,
      priceKobo,
      stock,
      imageId: variant.imageId,
      isEnabled: variant.isEnabled,
    };
    if (variant.id !== undefined) {
      entry.id = variant.id;
    }
    variants.push(entry);
  }

  const imageIds: string[] = [];
  for (const image of state.images) {
    imageIds.push(image.id);
  }

  const candidate: Record<string, unknown> = {
    name: state.name,
    imageIds,
    options,
    variants,
  };
  const description = state.description.trim();
  if (description !== "") {
    candidate.description = description;
  }

  const parsed = productInputSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = errorKey(issue.path);
      // Our own price/stock messages (above) are clearer than zod's for unreadable text.
      if (errors[key] === undefined) {
        errors[key] = friendlyMessage(key, issue.code, issue.message);
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  if (!parsed.success) {
    return { ok: false, errors: { form: "Check the product and try again" } };
  }
  return { ok: true, input: parsed.data };
}

/** Same key naming as toProductInput, for errors the server sends back. */
export function errorsFromIssues(
  issues: { path: PropertyKey[]; code: string; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = errorKey(issue.path);
    if (errors[key] === undefined) {
      errors[key] = friendlyMessage(key, issue.code, issue.message);
    }
  }
  return errors;
}
