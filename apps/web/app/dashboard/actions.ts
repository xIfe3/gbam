"use server";

import { orderStatusSchema } from "@gbam/shared";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";

export type UpdateStatusState = { error?: string };

const inputSchema = z.object({ orderId: z.uuid(), status: orderStatusSchema });

export async function updateOrderStatus(
  _prev: UpdateStatusState,
  formData: FormData,
): Promise<UpdateStatusState> {
  const input = inputSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
  });
  if (!input.success) return { error: "Invalid request." };

  try {
    // The API re-checks the transition against the state machine; the buttons are a hint.
    await api.updateOrderStatus(input.data.orderId, input.data.status);
  } catch (error) {
    // A session-expired redirect thrown by lib/api must reach Next, not become an error message.
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 409) {
      refresh(); // someone else changed it first; show the current state
      return { error: "This order changed in the meantime. Here's its latest status." };
    }
    console.error("updateOrderStatus failed", error);
    return { error: "Couldn't update the order. Please try again." };
  }
  refresh();
  return {};
}
