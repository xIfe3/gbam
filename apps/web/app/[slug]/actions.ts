// "use server" = these functions run on the SERVER, even though the browser triggers them
// (by submitting a form). The browser never sees this code or the API address.
"use server";

import { createOrderSchema } from "@gbam/shared";
import { z } from "zod";
import { apiFieldError } from "@/app/(auth)/action-helpers";
import { api, ApiError, type StorefrontProduct } from "@/lib/api";

/** What placeOrder returns; the checkout form shows a different screen for each. */
export type PlaceOrderState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** What the customer typed, sent back because React clears the form after submit. */
      values: {
        name: string;
        phone: string;
        email: string;
        note: string;
        zoneId: string;
        address: string;
        landmark: string;
      };
    }
  | { status: "success"; code: string; totalKobo: number; trackingKey: string };

/** The basket arrives as JSON text like [{"variantId":"…","quantity":2}]. This checks its shape. */
const basketSchema = z.array(
  z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(99) }),
);

/** What checkBasketAction accepts: one shop slug and at most 50 product slugs. */
const checkBasketArgumentsSchema = z.object({
  shopSlug: z.string().min(1).max(100),
  productSlugs: z.array(z.string().min(1).max(200)).max(50),
});

/** Reads a form field as text ("" if it's missing). */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (value === null) {
    return "";
  }
  return String(value);
}

/**
 * Fresh product data for the order page. The basket is saved in the customer's browser
 * and may be days old, so the page asks again for current stock and prices.
 */
export async function checkBasketAction(
  shopSlug: string,
  productSlugs: string[],
): Promise<StorefrontProduct[]> {
  // A server action is a public endpoint: anyone can call it with any values, whatever
  // the TypeScript types say. Check the shape and cap the size before doing any work.
  const parsedArguments = checkBasketArgumentsSchema.safeParse({ shopSlug, productSlugs });
  if (!parsedArguments.success) {
    throw new Error("Invalid basket check request");
  }

  // The same product can be in the basket as several variants; fetch it only once.
  const uniqueSlugs: string[] = [];
  for (const productSlug of parsedArguments.data.productSlugs) {
    if (!uniqueSlugs.includes(productSlug)) {
      uniqueSlugs.push(productSlug);
    }
  }

  const products: StorefrontProduct[] = [];
  for (const productSlug of uniqueSlugs) {
    try {
      const page = await api.storefrontProduct(parsedArguments.data.shopSlug, productSlug);
      products.push(page.product);
    } catch (error) {
      // 404 = the seller deleted or hid it. Leaving it out lets checkBasket call it "gone".
      if (error instanceof ApiError && error.status === 404) {
        continue;
      }
      throw error;
    }
  }
  return products;
}

export async function placeOrder(
  slug: string,
  _previousState: PlaceOrderState,
  formData: FormData,
): Promise<PlaceOrderState> {
  const values = {
    name: readField(formData, "name"),
    phone: readField(formData, "phone"),
    email: readField(formData, "email"),
    note: readField(formData, "note"),
    zoneId: readField(formData, "zoneId"),
    address: readField(formData, "address"),
    landmark: readField(formData, "landmark"),
  };

  // 1. Read the basket lines (a hidden form field filled in by basket-view.tsx).
  let items: { variantId: string; quantity: number }[];
  try {
    let basketJson = readField(formData, "items");
    if (basketJson === "") {
      basketJson = "[]";
    }
    items = basketSchema.parse(JSON.parse(basketJson));
  } catch {
    return {
      status: "error",
      message: "Something went wrong with your basket. Please retry.",
      values,
    };
  }

  let note: string | undefined = values.note.trim();
  if (note === "") {
    note = undefined;
  }

  // 2. Check everything with the SAME schema the API uses, so the customer sees
  //    mistakes immediately (e.g. a bad phone number) without a trip to the API.
  // The email is optional: blank means "no receipt", not "invalid email".
  let email: string | undefined = values.email.trim();
  if (email === "") {
    email = undefined;
  }
  // Delivery: which zone (empty when the shop has none), the fee the customer saw, and the
  // address. The API re-reads the fee from its database and refuses a mismatch.
  let zoneId: string | null = null;
  if (values.zoneId !== "") {
    zoneId = values.zoneId;
  }
  let expectedFeeKobo: number | null = null;
  const expectedFeeText = readField(formData, "expectedFeeKobo");
  if (zoneId !== null && expectedFeeText !== "") {
    expectedFeeKobo = Number(expectedFeeText);
  }
  const parsed = createOrderSchema.safeParse({
    customer: { name: values.name, phone: values.phone, email },
    items,
    note,
    delivery: { zoneId, expectedFeeKobo, address: values.address, landmark: values.landmark },
  });
  if (!parsed.success) {
    let message = "Please check your details.";
    if (items.length === 0) {
      message = "Add at least one item.";
    }
    return { status: "error", message, fieldErrors: errorsByField(parsed.error), values };
  }

  // 3. Send it to the API.
  try {
    const order = await api.placeOrder(slug, parsed.data);
    return {
      status: "success",
      code: order.code,
      totalKobo: order.totalKobo,
      trackingKey: order.trackingKey,
    };
  } catch (error) {
    // A delivery problem (zone removed, price changed, no address) goes next to that field.
    for (const field of ["delivery", "address"]) {
      const message = apiFieldError(error, field);
      if (message !== null) {
        return {
          status: "error",
          message: "Please check your delivery details.",
          fieldErrors: { [field]: [message] },
          values,
        };
      }
    }
    // 4xx = the API rejected the order (e.g. product unavailable): show its message.
    if (error instanceof ApiError && error.status < 500) {
      return { status: "error", message: error.message, values };
    }
    // Anything else is our fault: log it, show a generic message.
    console.error("placeOrder failed", error);
    return { status: "error", message: "We couldn't place your order. Please try again.", values };
  }
}

/**
 * Groups validation errors by field name so the form can show each next to its input.
 * Zod reports a path like ["customer", "phone"]; we use the last part ("phone").
 */
function errorsByField(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    let field = "form";
    const lastPart = issue.path[issue.path.length - 1];
    if (lastPart !== undefined) {
      field = String(lastPart);
    }

    let messages = result[field];
    if (!messages) {
      messages = [];
      result[field] = messages;
    }
    messages.push(issue.message);
  }
  return result;
}
