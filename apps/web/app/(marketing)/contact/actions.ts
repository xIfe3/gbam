// "use server" = these functions run on the SERVER, even though the browser triggers them
// (by submitting a form). The browser never sees this code or the API address.
"use server";

import { contactMessageSchema } from "@gbam/shared";
import type { z } from "zod";
import { api, ApiError } from "@/lib/api";

/** What sendContactMessage returns; the form shows a different screen for each. */
export type ContactState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** What the visitor typed, sent back because React clears the form after submit. */
      values: { name: string; email: string; phone: string; message: string };
    }
  | { status: "success" };

/** Reads a form field as text ("" if it's missing). */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (value === null) {
    return "";
  }
  return String(value);
}

export async function sendContactMessage(
  _previousState: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const values = {
    name: readField(formData, "name"),
    email: readField(formData, "email"),
    phone: readField(formData, "phone"),
    message: readField(formData, "message"),
  };

  // The phone number is optional: an empty box means "not given", not "invalid".
  let phone: string | undefined = values.phone.trim();
  if (phone === "") {
    phone = undefined;
  }

  // Same schema the API uses, so mistakes show up without a trip to the API.
  const parsed = contactMessageSchema.safeParse({
    name: values.name,
    email: values.email,
    phone,
    message: values.message,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: errorsByField(parsed.error),
      values,
    };
  }

  try {
    await api.sendContactMessage(parsed.data);
    return { status: "success" };
  } catch (error) {
    // 4xx = the API refused it (e.g. rate limit: "Too many attempts, try again in N minutes").
    if (error instanceof ApiError && error.status < 500) {
      return { status: "error", message: error.message, values };
    }
    console.error("sendContactMessage failed", error);
    return {
      status: "error",
      message: "We couldn't send your message. Please try again, or email hello@gbam.app.",
      values,
    };
  }
}

/** Groups validation errors by field name so the form can show each next to its input. */
function errorsByField(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    let field = "form";
    const firstPart = issue.path[0];
    if (firstPart !== undefined) {
      field = String(firstPart);
    }

    let messages = result[field];
    if (!messages) {
      messages = [];
      result[field] = messages;
    }
    messages.push(issue.message);
  }
  return result;
}
