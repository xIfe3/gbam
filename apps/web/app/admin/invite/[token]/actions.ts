"use server";

import { acceptInviteSchema } from "@gbam/shared";
import { redirect, unstable_rethrow } from "next/navigation";
import { apiFieldError, failureMessage, fieldErrorsFrom, text } from "@/app/(auth)/action-helpers";
import { adminApi } from "@/lib/admin-api";
import { setAdminCookie } from "@/lib/admin-session";

export type AcceptInviteState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set once accepted: shown one time, then never again. */
  backupCodes?: string[];
  /** The new admin's session, used by "continue" once the codes are saved. */
  sessionToken?: string;
};

/**
 * Sets the password and checks the first code from the app. It doesn't sign in yet: setting a
 * cookie in a server action makes Next.js re-render this page, which would find the invite
 * used and show "This invite has expired" in place of the backup codes. The cookie is set by
 * finishSetupAction, when they press "continue" after saving the codes.
 */
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
    return { backupCodes: result.backupCodes, sessionToken: result.sessionToken };
  } catch (error) {
    unstable_rethrow(error);
    const codeError = apiFieldError(error, "code");
    if (codeError !== null) {
      return { fieldErrors: { code: codeError } };
    }
    return { error: failureMessage(error, "accept admin invite") };
  }
}

/** "I've saved them, continue": signs the new admin in and opens the admin area. */
export async function finishSetupAction(sessionToken: string): Promise<void> {
  await setAdminCookie(sessionToken);
  redirect("/admin");
}
