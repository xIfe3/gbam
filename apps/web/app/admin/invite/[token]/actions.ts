"use server";

import { acceptInviteSchema } from "@gbam/shared";
import { unstable_rethrow } from "next/navigation";
import { apiFieldError, failureMessage, fieldErrorsFrom, text } from "@/app/(auth)/action-helpers";
import { adminApi } from "@/lib/admin-api";
import { setAdminCookie } from "@/lib/admin-session";

export type AcceptInviteState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set once accepted: shown one time, then never again. */
  backupCodes?: string[];
};

/** Sets the password, checks the first code from the app, and signs the new admin in. */
export async function acceptInviteAction(
  token: string,
  _previous: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const input = acceptInviteSchema.safeParse({
    password: text(formData, "password"),
    code: text(formData, "code"),
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }

  try {
    const result = await adminApi.acceptInvite(token, input.data);
    await setAdminCookie(result.sessionToken);
    return { backupCodes: result.backupCodes };
  } catch (error) {
    unstable_rethrow(error);
    const codeError = apiFieldError(error, "code");
    if (codeError !== null) {
      return { fieldErrors: { code: codeError } };
    }
    return { error: failureMessage(error, "accept admin invite") };
  }
}
