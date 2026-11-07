"use server";

import { announcementSchema, notificationSchema } from "@gbam/shared";
import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { fieldErrorsFrom as schemaErrors, text, type FormState } from "@/app/(auth)/action-helpers";
import { audienceFromForm, lagosDateTime } from "@/components/admin/audience-form";
import { adminApi, type AnnouncementBody } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

/**
 * Server actions for the Announcements and Notifications pages. The API checks everything
 * again (and the messages.send permission); these check the form and pass it on.
 */

/** The API's own message for a refused request (written for admins), or a general one. */
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
  if (error instanceof ApiError && error.status === 503) {
    return "Announcements aren't set up yet: UNSUBSCRIBE_SIGNING_KEY is missing on the API.";
  }
  return "Something went wrong on our side. Please try again.";
}

/**
 * The form's errors by field. A problem in the audience (a shop id that isn't one, 0 days...)
 * is filed under "audience", shown next to the "Who it goes to" box in plain words.
 */
function fieldErrorsFrom(error: Parameters<typeof schemaErrors>[0]): Record<string, string> {
  const errors = schemaErrors(error);
  if (errors.audience) {
    errors.audience = 'Check the "Who it goes to" fields';
  }
  return errors;
}

/** "" (an empty box) counts as not given. */
function optionalText(formData: FormData, name: string): string | undefined {
  const value = text(formData, name).trim();
  if (value === "") {
    return undefined;
  }
  return value;
}

/** The announcement in the form, checked by the shared schema. */
function announcementFromForm(formData: FormData) {
  return announcementSchema.safeParse({
    subject: text(formData, "subject"),
    body: text(formData, "body"),
    buttonLabel: optionalText(formData, "buttonLabel"),
    buttonUrl: optionalText(formData, "buttonUrl"),
    audience: audienceFromForm(formData),
  });
}

export type PreviewState = FormState & {
  preview?: { subject: string; html: string; recipients: number };
};

/** "Preview": the email as a seller would see it, and how many sellers it goes to. */
export async function previewAnnouncementAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const input = announcementFromForm(formData);
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    const preview = await adminApi.previewAnnouncement(input.data as AnnouncementBody);
    return { preview };
  } catch (error) {
    return { error: failure(error) };
  }
}

/** "Save draft" on a new announcement: saves it, then opens its page. */
export async function createAnnouncementAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const input = announcementFromForm(formData);
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  let id: string;
  try {
    const created = await adminApi.createAnnouncement(input.data as AnnouncementBody);
    id = created.id;
  } catch (error) {
    return { error: failure(error) };
  }
  // redirect() works by throwing, so it's outside the try/catch above.
  redirect(`/admin/announcements/${id}`);
}

export async function updateAnnouncementAction(
  id: string,
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const input = announcementFromForm(formData);
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    await adminApi.updateAnnouncement(id, input.data as AnnouncementBody);
  } catch (error) {
    return { error: failure(error) };
  }
  refresh();
  return { notice: "Draft saved." };
}

export async function testAnnouncementAction(id: string): Promise<FormState> {
  try {
    await adminApi.testAnnouncement(id);
  } catch (error) {
    return { error: failure(error) };
  }
  return { notice: "Test sent to your email." };
}

/**
 * "Send" or "Schedule": the typed count must match the number of sellers right now (the API
 * says the right number if not). An empty time means send now.
 */
export async function sendAnnouncementAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const typed = text(formData, "confirmCount").trim();
  const confirmCount = Number(typed);
  if (typed === "" || !Number.isInteger(confirmCount) || confirmCount < 0) {
    return { fieldErrors: { confirmCount: "Type the number of sellers to confirm" } };
  }
  const scheduledAt = lagosDateTime(text(formData, "scheduledAt").trim());
  let recipients = 0;
  try {
    const result = await adminApi.sendAnnouncement(id, { confirmCount, scheduledAt });
    recipients = result.recipients;
  } catch (error) {
    return { error: failure(error) };
  }
  refresh();
  if (scheduledAt) {
    return { notice: `Scheduled for ${recipients} sellers.` };
  }
  return { notice: `Sending to ${recipients} sellers now. The counts update as it goes.` };
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

export async function cancelAnnouncementAction(id: string): Promise<FormState> {
  return simple(() => adminApi.cancelAnnouncement(id), "Cancelled. Nothing was sent.");
}

export async function deleteAnnouncementAction(id: string): Promise<FormState> {
  return simple(() => adminApi.deleteAnnouncement(id), "Moved to the bin.");
}

export async function restoreAnnouncementAction(id: string): Promise<FormState> {
  return simple(() => adminApi.restoreAnnouncement(id), "Restored from the bin.");
}

export type CountState = FormState & { recipients?: number };

/** "Check the count" on the notification form. */
export async function countNotificationAction(
  _prev: CountState,
  formData: FormData,
): Promise<CountState> {
  try {
    const result = await adminApi.countNotification(audienceFromForm(formData));
    return { recipients: result.recipients };
  } catch (error) {
    return { error: failure(error) };
  }
}

/** Sends a notification to the bells of every seller in the audience. */
export async function sendNotificationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const typed = text(formData, "confirmCount").trim();
  let confirmCount = Number.NaN;
  if (typed !== "") {
    confirmCount = Number(typed);
  }
  const input = notificationSchema.safeParse({
    type: text(formData, "type"),
    // Empty means "not chosen": the schema then uses its default, bell only.
    display: optionalText(formData, "display"),
    title: text(formData, "title"),
    body: text(formData, "body"),
    link: optionalText(formData, "link"),
    endsAt: lagosDateTime(text(formData, "endsAt").trim()),
    audience: audienceFromForm(formData),
    confirmCount,
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    await adminApi.sendNotification(input.data);
  } catch (error) {
    return { error: failure(error) };
  }
  refresh();
  return { notice: `Sent to ${input.data.confirmCount} sellers.` };
}

export async function deleteNotificationAction(id: string): Promise<FormState> {
  return simple(
    () => adminApi.deleteNotification(id),
    "Moved to the bin: it's gone from every bell.",
  );
}

export async function restoreNotificationAction(id: string): Promise<FormState> {
  return simple(() => adminApi.restoreNotification(id), "Restored: it's back in the bells.");
}
