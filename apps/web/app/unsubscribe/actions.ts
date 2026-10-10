"use server";

import { unstable_rethrow } from "next/navigation";
import type { FormState } from "@/app/(auth)/action-helpers";
import { api } from "@/lib/api";

/** The "Unsubscribe" button: turns off Gbam's news and tips for the shop in the link. */
export async function unsubscribeAction(
  sellerId: string,
  token: string,
  previous: FormState,
): Promise<FormState> {
  // Already done (pressed twice): nothing more to do.
  if (previous.notice) {
    return previous;
  }
  try {
    await api.unsubscribe(sellerId, token);
  } catch (error) {
    unstable_rethrow(error);
    return {
      error:
        "We couldn't use this link. You can switch news and tips off in Settings → Emails in your dashboard.",
    };
  }
  return { notice: "Done. You won't get news and tips from Gbam any more." };
}
