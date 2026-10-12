"use server";

import {
  changePasswordSchema,
  closeAccountSchema,
  deliverySettingsSchema,
  parseNairaInput,
  emailSettingsSchema,
  orderSettingsSchema,
  shopSettingsSchema,
  slugSchema,
} from "@gbam/shared";
import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  apiFieldError,
  failureMessage,
  fieldErrorsFrom,
  text,
  type FormState,
} from "@/app/(auth)/action-helpers";
import type { SlugCheck } from "@/app/(auth)/signup/actions";
import { api, ApiError } from "@/lib/api";
import { clearSessionCookie } from "@/lib/session";
import { SITE_HOST } from "@/lib/site";

/** Shop name and WhatsApp number. (The shop link changes separately, see changeSlugAction.) */
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

/**
 * Which optional emails the seller wants. A ticked checkbox sends "on"; an unticked one
 * sends nothing at all, so "not in the form" means off.
 */
export async function updateEmailsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ticked = formData.get("newOrderEmails") === "on";
  const news = formData.get("newsEmails") === "on";
  const input = emailSettingsSchema.safeParse({ newOrderEmails: ticked, newsEmails: news });
  if (!input.success) {
    return { error: "Something went wrong. Please try again." };
  }

  try {
    await api.updateEmailSettings(input.data);
  } catch (error) {
    unstable_rethrow(error);
    return { error: failureMessage(error, "update email settings") };
  }
  let notice = "Saved. We won't email you about new orders.";
  if (input.data.newOrderEmails) {
    notice = "Saved. We'll email you when a new order comes in.";
  }
  return { notice };
}

/**
 * Whether every order waits for the seller to check it before the customer can pay.
 * An unticked checkbox sends nothing, so "not in the form" means off (customers pay at once).
 */
export async function updateOrderSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ticked = formData.get("approveOrdersFirst") === "on";
  const input = orderSettingsSchema.safeParse({ approveOrdersFirst: ticked });
  if (!input.success) {
    return { error: "Something went wrong. Please try again." };
  }

  try {
    await api.updateOrderSettings(input.data);
  } catch (error) {
    unstable_rethrow(error);
    return { error: failureMessage(error, "update order settings") };
  }
  let notice = "Saved. Customers can pay as soon as they order.";
  if (input.data.approveOrdersFirst) {
    notice = "Saved. You'll check each order, then tap Request payment.";
  }
  return { notice };
}

/** One zone row as the delivery form sends it: the fee is still the text the seller typed. */
type ZoneRow = { id?: string; name: string; fee: string; isPickup: boolean };

/**
 * Settings → Delivery. The form sends every zone as one JSON field ("zones"), with fees as
 * typed ("2,500", "₦2500"); they become kobo here, then the shared schema checks the list.
 */
export async function saveDeliveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let rows: ZoneRow[] = [];
  try {
    rows = JSON.parse(text(formData, "zones")) as ZoneRow[];
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
  if (!Array.isArray(rows)) {
    return { error: "Something went wrong. Please try again." };
  }

  const zones = [];
  for (const row of rows) {
    const feeKobo = parseNairaInput(String(row.fee));
    if (feeKobo === null) {
      return {
        fieldErrors: { zones: `Enter the fee for ${row.name} in whole naira, like 2500` },
      };
    }
    const zone: { id?: string; name: string; feeKobo: number; isPickup: boolean } = {
      name: String(row.name),
      feeKobo,
      isPickup: row.isPickup === true,
    };
    if (row.id) {
      zone.id = String(row.id);
    }
    zones.push(zone);
  }

  const input = deliverySettingsSchema.safeParse({
    zones,
    pickupNote: text(formData, "pickupNote"),
  });
  if (!input.success) {
    const firstIssue = input.error.issues[0];
    let message = "Please check your delivery zones.";
    if (firstIssue) {
      message = firstIssue.message;
    }
    if (firstIssue && firstIssue.path[0] === "pickupNote") {
      return { fieldErrors: { pickupNote: message } };
    }
    return { fieldErrors: { zones: message } };
  }

  let savedZonesJson = "";
  try {
    const saved = await api.saveDeliverySettings(input.data);
    // New zones only get their ids now. Sending the saved list back lets the form use them,
    // so the next save updates these zones instead of removing and re-adding them.
    if (saved && Array.isArray(saved.zones)) {
      savedZonesJson = JSON.stringify(saved.zones);
    }
  } catch (error) {
    unstable_rethrow(error);
    return { error: failureMessage(error, "save delivery zones") };
  }
  return { notice: "Delivery zones saved.", values: { savedZones: savedZonesJson } };
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
export async function closeAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
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

/** The live "Available ✓ / Taken" check on Settings' shop link box. Only a hint. */
export async function checkShopSlugAction(slug: string): Promise<SlugCheck> {
  const clean = slug.trim().toLowerCase();
  if (!slugSchema.safeParse(clean).success) {
    return { status: "invalid" };
  }
  try {
    const result = await api.shopSlugAvailable(clean);
    if (result.available) {
      return { status: "available" };
    }
    if (result.reason === "reserved" || result.reason === "invalid") {
      return { status: result.reason };
    }
    return { status: "taken" };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "error" };
  }
}

/** A new shop link. The old one keeps working: it redirects to the new one. */
export async function changeSlugAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = text(formData, "slug").trim().toLowerCase();
  let saved: string;
  try {
    const result = await api.changeSlug(slug);
    saved = result.slug;
  } catch (error) {
    unstable_rethrow(error);
    const fieldError = apiFieldError(error, "slug");
    if (fieldError !== null) {
      return { fieldErrors: { slug: fieldError }, values: { slug } };
    }
    return { error: failureMessage(error, "change shop link"), values: { slug } };
  }
  refresh();
  return {
    notice: `Done. Your shop is now at ${SITE_HOST}/${saved}. Your old link still works and takes people there.`,
  };
}

/** Uploads the shop's logo or banner (from Settings or the signup "your look" step). */
export async function uploadShopImageAction(
  kind: "logo" | "banner",
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { error: "Choose a photo" };
  }
  try {
    const result = await api.uploadShopImage(kind, image);
    return { url: result.url };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && (error.status === 400 || error.status === 413)) {
      const body = error.body;
      if (typeof body === "object" && body !== null && "message" in body) {
        const message = body.message;
        if (typeof message === "string") {
          return { error: message };
        }
      }
    }
    return { error: failureMessage(error, "upload shop image") };
  }
}

/** Back to the default look (initials or the gbam pattern). */
export async function removeShopImageAction(kind: "logo" | "banner"): Promise<{ error?: string }> {
  try {
    await api.removeShopImage(kind);
  } catch (error) {
    unstable_rethrow(error);
    return { error: failureMessage(error, "remove shop image") };
  }
  return {};
}
