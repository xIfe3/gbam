import { z } from "zod";

export const PRODUCT_LIMITS = {
  maxImages: 4,
  maxOptions: 3,
  maxValuesPerOption: 20,
  maxVariants: 50,
  minPriceKobo: 10000,
  maxPhotoBytes: 10 * 1024 * 1024,
};

/**
 * The URL piece of a product's name, e.g. "Ankara Wrap Dress!" becomes "ankara-wrap-dress".
 * This is the same algorithm as the SQL slug backfill in the database migration, so keep
 * them in step. "order" is reserved (it is a storefront route), so it becomes "order-1".
 */
export function productSlugBase(name: string): string {
  const lower = name.toLowerCase();
  const hyphenated = lower.replace(/[^a-z0-9]+/g, "-");
  const cut = hyphenated.slice(0, 60);
  const trimmed = cut.replace(/^-+/, "").replace(/-+$/, "");

  if (trimmed === "") {
    return "product";
  }
  if (trimmed === "order") {
    return "order-1";
  }
  return trimmed;
}

/** ["M", "Red"] becomes "M / Red". A product with no options has an empty title. */
export function variantTitle(optionValues: string[]): string {
  return optionValues.join(" / ");
}

/** Every combination of option values, in option order. No options gives one empty combination. */
export function combinations(options: { name: string; values: string[] }[]): string[][] {
  let result: string[][] = [[]];

  for (const option of options) {
    const next: string[][] = [];
    for (const partial of result) {
      for (const value of option.values) {
        next.push([...partial, value]);
      }
    }
    result = next;
  }

  return result;
}

/**
 * Turns what a seller typed ("12,000", "₦12,000") into kobo. Whole naira only, so
 * "12.5k" and "-5" give null. Money is always integer kobo, never a float.
 */
export function parseNairaInput(text: string): number | null {
  let cleaned = text.replace(/\s/g, "").replace(/,/g, "");
  if (cleaned.startsWith("₦")) {
    cleaned = cleaned.slice(1);
  }

  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  const naira = Number(cleaned);
  const kobo = naira * 100;
  if (!Number.isSafeInteger(kobo)) {
    return null;
  }
  return kobo;
}

export const productStatusSchema = z.enum(["active", "hidden", "archived"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;

const optionSchema = z.object({
  name: z.string().trim().min(1).max(30),
  values: z
    .array(z.string().trim().min(1).max(30))
    .min(1)
    .max(PRODUCT_LIMITS.maxValuesPerOption)
    .refine((values) => new Set(values).size === values.length, "Each value must be different"),
});

const variantSchema = z.object({
  id: z.uuid().optional(),
  optionValues: z.array(z.string()),
  // The upper bounds keep values inside the database's integer column (max 2147483647),
  // so a huge number is a validation error instead of a server error.
  priceKobo: z
    .number()
    .int()
    .min(PRODUCT_LIMITS.minPriceKobo, "Minimum price is ₦100")
    .max(2_000_000_000, "That price is too high"),
  // null means unlimited stock
  stock: z.number().int().min(0).max(1_000_000, "That stock is too high").nullable(),
  imageId: z.uuid().nullable(),
  isEnabled: z.boolean(),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).optional(),
    imageIds: z
      .array(z.uuid())
      .min(1)
      .max(PRODUCT_LIMITS.maxImages)
      .refine((ids) => new Set(ids).size === ids.length, "Each photo can only be used once"),
    options: z.array(optionSchema).max(PRODUCT_LIMITS.maxOptions),
    variants: z.array(variantSchema).min(1).max(PRODUCT_LIMITS.maxVariants),
  })
  .superRefine((product, ctx) => {
    // Option names must be unique, ignoring upper/lower case ("Size" and "size" clash).
    const seenNames = new Set<string>();
    for (let i = 0; i < product.options.length; i++) {
      const option = product.options[i];
      if (!option) {
        continue;
      }
      const lowerName = option.name.toLowerCase();
      if (seenNames.has(lowerName)) {
        ctx.addIssue({
          code: "custom",
          message: "Option names must be different",
          path: ["options", i, "name"],
        });
      }
      seenNames.add(lowerName);
    }

    // With no options there is exactly one default variant with no option values.
    if (product.options.length === 0 && product.variants.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "A product with no options has exactly one variant",
        path: ["variants"],
      });
    }

    const seenCombinations = new Set<string>();
    for (let i = 0; i < product.variants.length; i++) {
      const variant = product.variants[i];
      if (!variant) {
        continue;
      }

      // A variant that already failed the checks below would only add a noisy duplicate issue.
      let valuesAreValid = true;

      if (variant.optionValues.length !== product.options.length) {
        valuesAreValid = false;
        ctx.addIssue({
          code: "custom",
          message: "Pick one value for every option",
          path: ["variants", i, "optionValues"],
        });
      } else {
        for (let j = 0; j < product.options.length; j++) {
          const option = product.options[j];
          const value = variant.optionValues[j];
          if (!option || value === undefined || !option.values.includes(value)) {
            valuesAreValid = false;
            ctx.addIssue({
              code: "custom",
              message: "That value is not one of the option's values",
              path: ["variants", i, "optionValues", j],
            });
          }
        }
      }

      // JSON gives an unambiguous key even when a value contains "/" or ",".
      if (valuesAreValid) {
        const key = JSON.stringify(variant.optionValues);
        if (seenCombinations.has(key)) {
          ctx.addIssue({
            code: "custom",
            message: "Two options have the same combination",
            path: ["variants", i, "optionValues"],
          });
        }
        seenCombinations.add(key);
      }

      if (variant.imageId !== null && !product.imageIds.includes(variant.imageId)) {
        ctx.addIssue({
          code: "custom",
          message: "Choose one of this product's photos",
          path: ["variants", i, "imageId"],
        });
      }
    }

    let anyEnabled = false;
    for (const variant of product.variants) {
      if (variant.isEnabled) {
        anyEnabled = true;
      }
    }
    if (!anyEnabled) {
      ctx.addIssue({
        code: "custom",
        message: "Switch on at least one option",
        path: ["variants"],
      });
    }
  });
export type ProductInput = z.output<typeof productInputSchema>;

/** Same as a new product, plus the version the seller opened (stops two edits overwriting each other). */
export const updateProductInputSchema = productInputSchema.and(
  z.object({ version: z.number().int().min(1) }),
);
export type UpdateProductInput = z.output<typeof updateProductInputSchema>;
