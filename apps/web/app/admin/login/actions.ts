"use server";

import { adminCodeSchema, adminLoginSchema } from "@gbam/shared";
import { redirect, unstable_rethrow } from "next/navigation";
import { apiFieldError, failureMessage, fieldErrorsFrom, text } from "@/app/(auth)/action-helpers";
import { adminApi } from "@/lib/admin-api";
import { setAdminCookie } from "@/lib/admin-session";

/**
 * Admin sign-in has two steps on one page: email + password, then the 6-digit code from the
 * authenticator app. `challengeToken` (from step 1) tells the API who passed step 1; it
 * lasts 5 minutes and is useless without the code.
 */
export type AdminLoginState = {
  step: "password" | "code";
  challengeToken?: string;
  email?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function adminLoginAction(
  previous: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const challengeToken = text(formData, "challengeToken");
  if (challengeToken === "") {
    return passwordStep(formData);
  }
  return codeStep(challengeToken, previous, formData);
}

async function passwordStep(formData: FormData): Promise<AdminLoginState> {
  const email = text(formData, "email");
  const input = adminLoginSchema.safeParse({ email, password: text(formData, "password") });
  if (!input.success) {
    return { step: "password", email, fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    const result = await adminApi.login(input.data);
    return { step: "code", challengeToken: result.challengeToken, email };
  } catch (error) {
    unstable_rethrow(error);
    return { step: "password", email, error: failureMessage(error, "admin login") };
  }
}

async function codeStep(
  challengeToken: string,
  previous: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const code = adminCodeSchema.safeParse(text(formData, "code"));
  if (!code.success) {
    return {
      step: "code",
      challengeToken,
      email: previous.email,
      fieldErrors: { code: "Enter the 6-digit code from your app" },
    };
  }

  let sessionToken: string;
  try {
    const result = await adminApi.verify({ challengeToken, code: code.data });
    sessionToken = result.sessionToken;
  } catch (error) {
    unstable_rethrow(error);
    const codeError = apiFieldError(error, "code");
    if (codeError !== null) {
      return {
        step: "code",
        challengeToken,
        email: previous.email,
        fieldErrors: { code: codeError },
      };
    }
    // Anything else (timed out, locked): start again from the password.
    return {
      step: "password",
      email: previous.email,
      error: failureMessage(error, "admin verify"),
    };
  }

  await setAdminCookie(sessionToken);
  // redirect() works by throwing, so it must stay outside any try/catch.
  redirect("/admin");
}
