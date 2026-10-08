"use server";

import { reasonSchema } from "@gbam/shared";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { text, type FormState } from "@/app/(auth)/action-helpers";
import { adminApi, type BulkResult } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

/**
 * Server actions for the admin pages (shops, refunds, support, team, roles, sessions).
 * The API checks every permission again; these only check the form and pass it on.
 */

/**
 * A message for an API refusal. Admin API messages for 4xx answers ("Already suspended",
 * "This is the last superadmin...") are written for admins, so they're shown as they are.
 */
function adminFailure(error: unknown): string {
  unstable_rethrow(error);
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    const body = error.body;
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = body.message;
      if (typeof message === "string") {
        return message;
      }
    }
  }
  return "Something went wrong. Please try again.";
}

/** Reads the "reason" box; returns the reason, or field errors to show. */
function readReason(formData: FormData): { reason: string } | { state: FormState } {
  const parsed = reasonSchema.safeParse({ reason: text(formData, "reason") });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Write a short reason";
    return { state: { fieldErrors: { reason: message } } };
  }
  return { reason: parsed.data.reason };
}

/** Runs one API call that needs a reason, then refreshes the page to show the change. */
async function withReason(
  formData: FormData,
  call: (reason: string) => Promise<unknown>,
  done: string,
): Promise<FormState> {
  const read = readReason(formData);
  if ("state" in read) {
    return read.state;
  }
  try {
    await call(read.reason);
  } catch (error) {
    return { error: adminFailure(error) };
  }
  refresh();
  return { notice: done };
}

/** Runs one API call with no form input, then refreshes. */
async function simple(call: () => Promise<unknown>, done: string): Promise<FormState> {
  try {
    await call();
  } catch (error) {
    return { error: adminFailure(error) };
  }
  refresh();
  return { notice: done };
}

// ---- Shops ----

export async function suspendShopAction(id: string, _prev: FormState, formData: FormData) {
  return withReason(formData, (reason) => adminApi.suspendShop(id, reason), "Shop suspended.");
}

export async function reopenShopAction(id: string, _prev: FormState, formData: FormData) {
  return withReason(formData, (reason) => adminApi.reopenShop(id, reason), "Shop reopened.");
}

export async function unlockSellerAction(id: string): Promise<FormState> {
  return simple(() => adminApi.unlockSeller(id), "Seller unlocked: they can sign in now.");
}

export async function resendVerificationAction(id: string): Promise<FormState> {
  return simple(() => adminApi.resendVerification(id), "A new verification code was emailed.");
}

const dateSchema = z.iso.date("Pick a date");

/** A date sets the fee waiver; the Clear button (clear=1) ends it. */
export async function feeWaiverAction(id: string, _prev: FormState, formData: FormData) {
  let until: string | null = null;
  if (text(formData, "clear") !== "1") {
    const parsed = dateSchema.safeParse(text(formData, "until"));
    if (!parsed.success) {
      return { fieldErrors: { until: "Pick a date" } };
    }
    until = parsed.data;
  }
  let done = "Fee waiver ended.";
  if (until !== null) {
    done = `No Gbam fee until ${until}.`;
  }
  return simple(() => adminApi.setFeeWaiver(id, until), done);
}

/** Called from the bulk dialog (not a form), so it returns what happened to each shop. */
export async function bulkShopsAction(
  action: "suspend" | "reopen",
  ids: string[],
  note: string,
): Promise<BulkResult> {
  const result = await adminApi.bulkShops(action, ids, note);
  refresh();
  return result;
}

// ---- Refunds ----

/** Needs the tick ("the money is back with the customer") and a note. */
export async function resolveRefundAction(id: string, _prev: FormState, formData: FormData) {
  if (text(formData, "confirmed") !== "on") {
    return {
      fieldErrors: { confirmed: "Tick the box once the money is back with the customer" },
    };
  }
  return withReason(
    formData,
    (reason) => adminApi.resolveRefund(id, reason),
    "Marked as refunded.",
  );
}
