"use server";

import { changePasswordSchema, closeAccountSchema, shopSettingsSchema } from "@gbam/shared";
import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  apiFieldError,
  failureMessage,
  fieldErrorsFrom,
  text,
  type FormState,
} from "@/app/(auth)/action-helpers";
import { api } from "@/lib/api";
import { clearSessionCookie } from "@/lib/session";

/** Shop name and WhatsApp number. The shop link never changes. */
export async function updateShopAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { businessName: text(formData, "businessName"), phone: text(formData, "phone") };
  const input = shopSettingsSchema.safeParse(values);
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }

  try {
    await api.updateShopSettings(input.data);
  } catch (error) {
    // A session redirect thrown by lib/api must reach Next, not become an error message.
    unstable_rethrow(error);
    const phoneError = apiFieldError(error, "phone");
    if (phoneError !== null) {
      return { fieldErrors: { phone: phoneError }, values };
    }
    return { error: failureMessage(error, "update shop settings"), values };
  }
  // The shop name also shows in the dashboard header: re-render it with the new one.
  refresh();
  return { notice: "Saved.", values };
}

/** New password. Passwords are never sent back to the form, even after an error. */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = changePasswordSchema.safeParse({
    currentPassword: text(formData, "currentPassword"),
    newPassword: text(formData, "newPassword"),
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }

  try {
    await api.changePassword(input.data);
  } catch (error) {
    unstable_rethrow(error);
    const currentError = apiFieldError(error, "currentPassword");
    if (currentError !== null) {
      return { fieldErrors: { currentPassword: currentError } };
    }
    return { error: failureMessage(error, "change password") };
  }
  return { notice: "Password changed. Any other phones or computers have been signed out." };
}

/** Delete my account: the API hides the shop and signs out everywhere; this browser too. */
export async function closeAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { businessName: text(formData, "businessName") };
  const input = closeAccountSchema.safeParse({
    businessName: values.businessName,
    password: text(formData, "password"),
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }

  try {
    await api.closeAccount(input.data);
  } catch (error) {
    unstable_rethrow(error);
    for (const field of ["businessName", "password"]) {
      const message = apiFieldError(error, field);
      if (message !== null) {
        return { fieldErrors: { [field]: message }, values };
      }
    }
    return { error: failureMessage(error, "close account"), values };
  }
  await clearSessionCookie();
  redirect("/login?closed=1");
}
