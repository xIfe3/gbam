"use server";

import { payoutAccountSchema } from "@gbam/shared";
import { redirect, unstable_rethrow } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import {
  apiFieldError,
  failureMessage,
  fieldErrorsFrom,
  text,
  type FormState,
} from "../../action-helpers";

/** After "Check account": the name the bank has for this account, for the seller to confirm. */
export type ResolveState = FormState & {
  accountName?: string;
  bankName?: string;
  /** Changes on every successful check, so the form knows a new answer arrived. */
  checkId?: number;
};

/** The two inputs, as typed (trimmed). Sent back so the form keeps them after an error. */
function readValues(formData: FormData) {
  return {
    bankCode: text(formData, "bankCode").trim(),
    accountNumber: text(formData, "accountNumber").trim(),
  };
}

/**
 * The error to show for a failed payout call: on the field the API names, else the API's
 * own message for 400/503 (written for sellers), else the usual fallbacks (429, generic).
 * The account number is never logged: failureMessage logs only the status.
 */
function payoutFailure(error: unknown, values: Record<string, string>, action: string): FormState {
  for (const field of ["bankCode", "accountNumber"]) {
    const message = apiFieldError(error, field);
    if (message !== null) {
      return { fieldErrors: { [field]: message }, values };
    }
  }
  if (error instanceof ApiError && (error.status === 400 || error.status === 503)) {
    const body = error.body;
    if (typeof body === "object" && body !== null && "message" in body) {
      if (typeof body.message === "string") {
        return { error: body.message, values };
      }
    }
  }
  return { error: failureMessage(error, action), values };
}

/** True for an API 409 whose body has this `code` (e.g. "PAYOUT_ACCOUNT_EXISTS"). */
function isConflict(error: unknown, code: string): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return false;
  }
  const body = error.body;
  return typeof body === "object" && body !== null && "code" in body && body.code === code;
}

/** "Check account": asks the API (and so Paystack) whose account this is. Saves nothing. */
export async function resolveAccountAction(
  _prev: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  const values = readValues(formData);
  const input = payoutAccountSchema.safeParse(values);
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }

  try {
    const result = await api.resolvePayoutAccount(input.data);
    return {
      accountName: result.accountName,
      bankName: result.bankName,
      values: input.data,
      checkId: Date.now(),
    };
  } catch (error) {
    // A session redirect thrown by lib/api must reach Next, not become an error message.
    unstable_rethrow(error);
    return payoutFailure(error, values, "resolve payout account");
  }
}

/**
 * "Yes, pay me here": the API checks the account again with Paystack, creates the
 * subaccount and saves it. Then on to the dashboard.
 */
export async function createPayoutAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = readValues(formData);
  const input = payoutAccountSchema.safeParse(values);
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }

  try {
    await api.createPayoutAccount(input.data);
  } catch (error) {
    unstable_rethrow(error);
    // Already set up (e.g. a second tab finished first): nothing left to do here.
    if (isConflict(error, "PAYOUT_ACCOUNT_EXISTS")) {
      redirect("/dashboard");
    }
    // Another request (e.g. a double click) is creating the account right now.
    if (isConflict(error, "PAYOUT_SETUP_IN_PROGRESS")) {
      return { error: "We're already setting this up. Refresh in a minute.", values };
    }
    return payoutFailure(error, values, "create payout account");
  }
  redirect("/dashboard");
}
