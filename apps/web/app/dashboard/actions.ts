"use server";

import { orderStatusSchema } from "@gbam/shared";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";

export type UpdateStatusState = { error?: string };

const inputSchema = z.object({ orderId: z.uuid(), status: orderStatusSchema });

function isPayoutAccountRequired(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    body.code === "PAYOUT_ACCOUNT_REQUIRED"
  );
}

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
    // No payout account yet: nothing changed, so no refresh; say what to do instead.
    if (error instanceof ApiError && error.status === 409 && isPayoutAccountRequired(error.body)) {
      return { error: "Add your bank account to start receiving payments." };
    }
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

/** The seller marks a customer's reported problem as dealt with. */
export async function resolveIssueAction(
  orderId: string,
  issueId: string,
): Promise<{ error?: string }> {
  const ids = z.object({ orderId: z.uuid(), issueId: z.uuid() }).safeParse({ orderId, issueId });
  if (!ids.success) {
    return { error: "Invalid request." };
  }
  try {
    await api.resolveOrderIssue(ids.data.orderId, ids.data.issueId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("resolveIssue failed", error);
    return { error: "Couldn't mark it resolved. Please try again." };
  }
  refresh();
  return {};
}
