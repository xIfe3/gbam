"use server";

import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@gbam/shared";
import { redirect, unstable_rethrow } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { safeNextPath } from "@/lib/safe-next";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";
import {
  apiFieldError,
  failureMessage,
  fieldErrorsFrom,
  text,
  type FormState,
} from "./action-helpers";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email");
  const next = safeNextPath(text(formData, "next"));
  const values = { email };

  const input = loginSchema.safeParse({ email, password: text(formData, "password") });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }

  let sessionToken: string;
  try {
    const result = await api.login(input.data);
    sessionToken = result.sessionToken;
  } catch (error) {
    return { error: failureMessage(error, "login"), values };
  }

  await setSessionCookie(sessionToken);
  // redirect() works by throwing, so it must stay outside any try/catch.
  redirect(next ?? "/dashboard");
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = text(formData, "email");
  const values = { email };

  const input = forgotPasswordSchema.safeParse({ email });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }

  let requestId: string;
  try {
    const result = await api.forgotPassword(input.data.email);
    requestId = result.requestId;
  } catch (error) {
    return { error: failureMessage(error, "forgot password"), values };
  }

  // The API answers the same whether or not the email has an account. We carry the
  // requestId (not the code!) to the next page; the reset only works with both.
  const query = new URLSearchParams({ email: input.data.email, request: requestId });
  redirect(`/reset-password?${query.toString()}`);
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { email: text(formData, "email"), requestId: text(formData, "requestId") };

  const input = resetPasswordSchema.safeParse({
    email: values.email,
    requestId: values.requestId,
    code: text(formData, "code"),
    password: text(formData, "password"),
  });
  if (!input.success) {
    const fieldErrors = fieldErrorsFrom(input.error);
    if (fieldErrors.requestId) {
      return { error: "This reset link is not valid any more. Please start again.", values };
    }
    return { fieldErrors, values };
  }

  let sessionToken: string;
  try {
    const result = await api.resetPassword(input.data);
    sessionToken = result.sessionToken;
  } catch (error) {
    const codeError = apiFieldError(error, "code");
    if (codeError) {
      return { fieldErrors: { code: codeError }, values };
    }
    return { error: failureMessage(error, "reset password"), values };
  }

  await setSessionCookie(sessionToken);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  try {
    // Ends the session on the API side too, so a copied token stops working.
    await api.logout();
  } catch (error) {
    unstable_rethrow(error);
    // Even if the API is unreachable, still sign this browser out.
    console.error("logout API call failed", error instanceof ApiError ? error.status : "error");
  }
  await clearSessionCookie();
  redirect("/login");
}
