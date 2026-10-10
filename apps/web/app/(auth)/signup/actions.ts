"use server";

import { codeSchema, signupSchema, slugSchema } from "@gbam/shared";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { setSessionCookie } from "@/lib/session";
import {
  apiFieldError,
  failureMessage,
  fieldErrorsFrom,
  retryAfterSeconds,
  text,
  type FormState,
} from "../action-helpers";

/** Where a freshly verified user goes: step 3, adding the bank account they'll be paid into. */
const AFTER_VERIFY = "/signup/your-look";

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Everything typed except the password is sent back so the form keeps it on an error.
  const values = {
    businessName: text(formData, "businessName"),
    slug: text(formData, "slug").trim().toLowerCase(),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  };

  const input = signupSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }

  let sessionToken: string;
  try {
    const result = await api.signup(input.data);
    sessionToken = result.sessionToken;
  } catch (error) {
    // 409: the email, link or phone is already used. The API says which field.
    if (error instanceof ApiError && error.status === 409) {
      const field = ["email", "slug", "phone"].find((name) => apiFieldError(error, name) !== null);
      if (field) {
        return {
          fieldErrors: { [field]: apiFieldError(error, field) ?? "Already in use" },
          values,
        };
      }
    }
    return { error: failureMessage(error, "signup"), values };
  }

  await setSessionCookie(sessionToken);
  redirect("/signup/verify");
}

export type SlugCheck = { status: "available" | "taken" | "reserved" | "invalid" | "error" };

/** Called by the shop-link field as the seller types. */
export async function checkSlugAction(slug: string): Promise<SlugCheck> {
  const clean = slug.trim().toLowerCase();
  const parsed = slugSchema.safeParse(clean);
  if (!parsed.success) {
    return { status: "invalid" };
  }
  try {
    const result = await api.slugAvailable(clean);
    if (result.available) {
      return { status: "available" };
    }
    if (result.reason === "reserved" || result.reason === "invalid") {
      return { status: result.reason };
    }
    return { status: "taken" };
  } catch {
    // Includes 429: the check is only a hint, the real check runs on submit.
    return { status: "error" };
  }
}

export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = codeSchema.safeParse(text(formData, "code"));
  if (!code.success) {
    return { fieldErrors: { code: "Enter the 6-digit code from your email" } };
  }

  try {
    await api.verifyEmail(code.data);
  } catch (error) {
    const codeError = apiFieldError(error, "code");
    if (codeError) {
      return { fieldErrors: { code: codeError } };
    }
    return { error: failureMessage(error, "verify email") };
  }
  redirect(AFTER_VERIFY);
}

/** "42 seconds" for short waits; "50 minutes" (rounded up) once it is over 2 minutes. */
function waitText(seconds: number): string {
  if (seconds <= 120) {
    return `${seconds} seconds`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minutes`;
}

export async function resendCodeAction(): Promise<FormState> {
  try {
    await api.resendCode();
  } catch (error) {
    const seconds = retryAfterSeconds(error);
    if (seconds !== null) {
      return { error: `Please wait ${waitText(seconds)} before asking for another code.` };
    }
    return { error: failureMessage(error, "resend code") };
  }
  return { notice: "We sent you a new code. The old one no longer works." };
}
