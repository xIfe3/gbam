import type { Audience } from "@gbam/shared";

/** A form's text value; anything else (e.g. a file) counts as empty. */
function textOf(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

/** "yes" → true, "no" → false, anything else ("Any") → not used. */
function yesNo(formData: FormData, name: string): boolean | undefined {
  const value = textOf(formData, name);
  if (value === "yes") {
    return true;
  }
  if (value === "no") {
    return false;
  }
  return undefined;
}

/**
 * The audience fields of a messaging form, as the API expects them. Only filters that were
 * filled in are included, so an empty form means "every seller". The API checks the values.
 */
export function audienceFromForm(formData: FormData): Audience {
  const audience: Audience = {};
  const shopId = textOf(formData, "shopId");
  if (shopId !== "") {
    audience.shopId = shopId;
  }
  const verified = yesNo(formData, "verified");
  if (verified !== undefined) {
    audience.verified = verified;
  }
  const hasProducts = yesNo(formData, "hasProducts");
  if (hasProducts !== undefined) {
    audience.hasProducts = hasProducts;
  }
  const hasBank = yesNo(formData, "hasBank");
  if (hasBank !== undefined) {
    audience.hasBank = hasBank;
  }
  const noOrderDays = textOf(formData, "noOrderDays");
  if (noOrderDays !== "") {
    audience.noOrderDays = Number(noOrderDays);
  }
  const signedUpFrom = textOf(formData, "signedUpFrom");
  if (signedUpFrom !== "") {
    audience.signedUpFrom = signedUpFrom;
  }
  const signedUpTo = textOf(formData, "signedUpTo");
  if (signedUpTo !== "") {
    audience.signedUpTo = signedUpTo;
  }
  return audience;
}

/** A "datetime-local" box gives "2026-10-12T09:30" (no zone): it's Lagos time, UTC+1. */
export function lagosDateTime(value: string): string | undefined {
  if (value === "") {
    return undefined;
  }
  return `${value}:00+01:00`;
}
