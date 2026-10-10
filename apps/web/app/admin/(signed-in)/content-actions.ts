"use server";

import { contentDraftSchema, newContentSchema } from "@gbam/shared";
import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { fieldErrorsFrom, text, type FormState } from "@/app/(auth)/action-helpers";
import { lagosDateTime } from "@/components/admin/audience-form";
import { draftFromForm } from "@/components/admin/content-form";
import { adminApi } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

/** Server actions for the content editor. The API checks every permission again. */

function failure(error: unknown): string {
  unstable_rethrow(error);
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    const body = error.body;
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = body.message;
      if (typeof message === "string") {
        return message;
      }
    }
  }
  return "Something went wrong on our side. Please try again.";
}

/** A new entry: saved as a draft, then its page opens. */
export async function createContentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = newContentSchema.safeParse({
    ...draftFromForm(formData),
    type: text(formData, "type"),
    slug: text(formData, "slug"),
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  let id: string;
  try {
    const created = await adminApi.createContent(input.data);
    id = created.id;
  } catch (error) {
    return { error: failure(error) };
  }
  // redirect() works by throwing, so it's outside the try/catch above.
  redirect(`/admin/content/${id}`);
}

export async function saveContentDraftAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = contentDraftSchema.safeParse(draftFromForm(formData));
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    await adminApi.saveContentDraft(id, input.data);
  } catch (error) {
    return { error: failure(error) };
  }
  refresh();
  return { notice: "Draft saved. It's not live until it's published." };
}

/** Publish now, or at the time picked (Lagos time). */
export async function publishContentAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const at = lagosDateTime(text(formData, "at").trim());
  const body: { at?: string } = {};
  if (at) {
    body.at = at;
  }
  try {
    await adminApi.publishContent(id, body);
  } catch (error) {
    return { error: failure(error) };
  }
  refresh();
  if (at) {
    return { notice: "Scheduled. It goes live at the time you picked." };
  }
  return { notice: "Published. It's live now." };
}

async function simple(call: () => Promise<unknown>, done: string): Promise<FormState> {
  try {
    await call();
  } catch (error) {
    return { error: failure(error) };
  }
  refresh();
  return { notice: done };
}

export async function unpublishContentAction(id: string): Promise<FormState> {
  return simple(() => adminApi.unpublishContent(id), "Unpublished: it's off the site.");
}

export async function deleteContentAction(id: string): Promise<FormState> {
  return simple(() => adminApi.deleteContent(id), "Moved to the bin.");
}

export async function restoreContentAction(id: string): Promise<FormState> {
  return simple(() => adminApi.restoreContent(id), "Restored from the bin.");
}

export async function restoreVersionAction(id: string, versionId: string): Promise<FormState> {
  return simple(
    () => adminApi.restoreContentVersion(id, versionId),
    "Copied into the draft. Publish to make it live.",
  );
}

/** The editor's "Image" button: uploads the photo and returns its address. */
export async function uploadContentImageAction(
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return { error: "Choose an image" };
  }
  try {
    return await adminApi.uploadContentImage(image);
  } catch (error) {
    return { error: failure(error) };
  }
}
