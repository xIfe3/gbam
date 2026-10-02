"use server";

import { createOrderSchema } from "@gbam/shared";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";

export type PlaceOrderState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** Echoed back because React resets the form after an action runs. */
      values: { name: string; phone: string; note: string };
    }
  | { status: "success"; code: string; totalKobo: number };

const itemsSchema = z.record(z.string(), z.coerce.number().int().min(0));

export async function placeOrder(
  slug: string,
  _prev: PlaceOrderState,
  formData: FormData,
): Promise<PlaceOrderState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    note: String(formData.get("note") ?? ""),
  };

  let quantities: Record<string, number>;
  try {
    quantities = itemsSchema.parse(JSON.parse(String(formData.get("items") ?? "{}")));
  } catch {
    return {
      status: "error",
      message: "Something went wrong with your basket. Please retry.",
      values,
    };
  }

  // Same schema the API enforces, so the customer sees errors before a round trip.
  const parsed = createOrderSchema.safeParse({
    customer: { name: values.name, phone: values.phone },
    items: Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ productId, quantity })),
    note: values.note.trim() || undefined,
  });
  if (!parsed.success) {
    const message = parsed.error.issues.some((i) => i.path[0] === "items")
      ? "Add at least one item."
      : "Please check your details.";
    return { status: "error", message, fieldErrors: flattenCustomer(parsed.error), values };
  }

  try {
    const order = await api.placeOrder(slug, parsed.data);
    return { status: "success", code: order.code, totalKobo: order.totalKobo };
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return { status: "error", message: error.message, values };
    }
    console.error("placeOrder failed", error);
    return { status: "error", message: "We couldn't place your order. Please try again.", values };
  }
}

/** "customer.phone" issues → { phone: [...] } so the form can show them by field. */
function flattenCustomer(error: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path.at(-1) ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
