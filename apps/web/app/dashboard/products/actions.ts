"use server";

import { PRODUCT_LIMITS, productInputSchema } from "@gbam/shared";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { errorsFromIssues } from "./editor/editor-state";

// Every function here is a Server Action: the browser calls it, but it runs on the server
// (where the session cookie and the API client live). The browser can send anything, so each
// action re-checks its input instead of trusting the form.

export type SaveResult = { error?: string; fieldErrors?: Record<string, string> };
export type PhotoResult = { id: string; smallUrl: string } | { error: string };

const LIST_PATH = "/dashboard/products";
const GENERIC_ERROR = "Something went wrong on our side. Please try again.";
const STALE_ERROR = "This product changed since you opened it. Reload to see the latest.";

// Statuses where the API's own message is written for the seller (bad input, not found,
// stale, too big, rate limited). For anything else we show a generic message.
const SHOWN_STATUSES = [400, 404, 409, 413, 429];

/** A message safe to show. Logs only the status, never the request. */
function messageFor(error: unknown, action: string): string {
  // lib/api throws a Next redirect (session expired) from inside API calls. It must reach Next.
  unstable_rethrow(error);
  if (error instanceof ApiError) {
    const body = error.body;
    if (SHOWN_STATUSES.includes(error.status) && typeof body === "object" && body !== null) {
      if ("message" in body && typeof body.message === "string") {
        return body.message;
      }
    }
    console.error(`${action} failed with status ${error.status}`);
  } else {
    console.error(`${action} failed`);
  }
  return GENERIC_ERROR;
}

/**
 * The API reports some problems against a field: { message: "Validation failed", issues:
 * { fieldErrors: { imageIds: ["..."] } } }. Returns those as editor error keys with the
 * real text, or null when the error has no field errors. (Only the first text per field.)
 */
function fieldErrorsFrom(error: unknown): Record<string, string> | null {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null;
  }
  const body = error.body;
  if (typeof body !== "object" || body === null || !("issues" in body)) {
    return null;
  }
  const issues = body.issues;
  if (typeof issues !== "object" || issues === null || !("fieldErrors" in issues)) {
    return null;
  }
  const fieldErrors = issues.fieldErrors;
  if (typeof fieldErrors !== "object" || fieldErrors === null) {
    return null;
  }

  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (!Array.isArray(messages)) {
      continue;
    }
    const first: unknown = messages[0];
    if (typeof first !== "string") {
      continue;
    }
    // The editor calls the photos field "images".
    let key = field;
    if (field === "imageIds") {
      key = "images";
    }
    result[key] = first;
  }
  if (Object.keys(result).length === 0) {
    return null;
  }
  return result;
}

/** What a failed create or update returns: field errors when the API sent any. */
function saveFailure(error: unknown, action: string): SaveResult {
  const fieldErrors = fieldErrorsFrom(error);
  if (fieldErrors) {
    return { fieldErrors };
  }
  return { error: messageFor(error, action) };
}

/** Uploads one photo straight away; the product it belongs to is saved later. */
export async function uploadPhotoAction(formData: FormData): Promise<PhotoResult> {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  // Checked here too, before spending an API call on a file the API would refuse.
  if (photo.size > PRODUCT_LIMITS.maxPhotoBytes) {
    return { error: "Photos can be up to 10 MB" };
  }
  try {
    return await api.uploadProductPhoto(formData);
  } catch (error) {
    return { error: messageFor(error, "uploadPhoto") };
  }
}

export async function deletePhotoAction(id: string): Promise<{ error?: string }> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) {
    return { error: "Invalid photo." };
  }
  try {
    await api.deleteProductPhoto(parsed.data);
    return {};
  } catch (error) {
    return { error: messageFor(error, "deletePhoto") };
  }
}

export async function createProductAction(input: unknown): Promise<SaveResult> {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: errorsFromIssues(parsed.error.issues) };
  }
  try {
    await api.createProduct(parsed.data);
  } catch (error) {
    return saveFailure(error, "createProduct");
  }
  // redirect() works by throwing, so it stays outside the try/catch.
  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

export async function updateProductAction(
  id: string,
  input: unknown,
  version: number,
): Promise<SaveResult> {
  const parsedId = z.uuid().safeParse(id);
  const parsedVersion = z.number().int().min(1).safeParse(version);
  if (!parsedId.success || !parsedVersion.success) {
    return { error: "Invalid request." };
  }
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return { fieldErrors: errorsFromIssues(parsed.error.issues) };
  }
  try {
    // `version` is optimistic locking: the API refuses the save (409) if the product was
    // changed since the form was opened, instead of silently overwriting that change.
    await api.updateProduct(parsedId.data, { ...parsed.data, version: parsedVersion.data });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 409) {
      return { error: STALE_ERROR };
    }
    return saveFailure(error, "updateProduct");
  }
  revalidatePath(LIST_PATH);
  // Back to the product's details page, which now shows the saved changes.
  redirect(`${LIST_PATH}/${parsedId.data}`);
}

export async function setProductStatusAction(
  id: string,
  status: "active" | "hidden",
): Promise<{ error?: string }> {
  const parsedId = z.uuid().safeParse(id);
  const parsedStatus = z.enum(["active", "hidden"]).safeParse(status);
  if (!parsedId.success || !parsedStatus.success) {
    return { error: "Invalid request." };
  }
  try {
    await api.setProductStatus(parsedId.data, parsedStatus.data);
  } catch (error) {
    return { error: messageFor(error, "setProductStatus") };
  }
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${parsedId.data}`);
  return {};
}

/** Deletes the product, or archives it when it has been ordered (the API decides). */
export async function deleteProductAction(id: string): Promise<{ error?: string }> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { error: "Invalid request." };
  }
  try {
    await api.deleteProduct(parsedId.data);
  } catch (error) {
    return { error: messageFor(error, "deleteProduct") };
  }
  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
