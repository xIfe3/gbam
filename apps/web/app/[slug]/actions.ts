// "use server" = these functions run on the SERVER, even though the browser triggers them
// (by submitting a form). The browser never sees this code or the API address.
"use server";

import { createOrderSchema } from "@gbam/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";

/** What placeOrder returns; the checkout form shows a different screen for each. */
export type PlaceOrderState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** What the customer typed, sent back because React clears the form after submit. */
      values: { name: string; phone: string; note: string };
    }
  | { status: "success"; code: string; totalKobo: number };

/** The basket arrives as JSON text like {"<productId>": 2}. This checks its shape. */
const basketSchema = z.record(z.string(), z.coerce.number().int().min(0));

/** Reads a form field as text ("" if it's missing). */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (value === null) {
    return "";
  }
  return String(value);
}

export async function placeOrder(
  slug: string,
  _previousState: PlaceOrderState,
  formData: FormData,
): Promise<PlaceOrderState> {
  const values = {
    name: readField(formData, "name"),
    phone: readField(formData, "phone"),
    note: readField(formData, "note"),
  };

  // 1. Read the basket (a hidden form field filled in by checkout.tsx).
  let quantities: Record<string, number>;
  try {
    let basketJson = readField(formData, "items");
    if (basketJson === "") {
      basketJson = "{}";
    }
    quantities = basketSchema.parse(JSON.parse(basketJson));
  } catch {
    return {
      status: "error",
      message: "Something went wrong with your basket. Please retry.",
      values,
    };
  }

  const items = [];
  for (const productId of Object.keys(quantities)) {
    const quantity = quantities[productId];
    if (quantity !== undefined && quantity > 0) {
      items.push({ productId, quantity });
    }
  }

  let note: string | undefined = values.note.trim();
  if (note === "") {
    note = undefined;
  }

  // 2. Check everything with the SAME schema the API uses, so the customer sees
  //    mistakes immediately (e.g. a bad phone number) without a trip to the API.
  const parsed = createOrderSchema.safeParse({
    customer: { name: values.name, phone: values.phone },
    items,
    note,
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
    return { status: "success", code: order.code, totalKobo: order.totalKobo };
  } catch (error) {
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
