import type { ZodError } from "zod";
import { ApiError } from "@/lib/api";

/**
 * What a form shows after a submit. `values` puts back what was typed (never a password or
 * code). `fieldErrors` is keyed by input name.
 */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** A success note (e.g. "code sent"). */
  notice?: string;
};

/** Reads a text input from the form; anything else (e.g. a File) counts as empty. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value === "string") {
    return value;
  }
  return "";
}

/** First zod message per field, e.g. { email: "Invalid email address" }. */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (result[key] === undefined) {
      result[key] = issue.message;
    }
  }
  return result;
}

function bodyMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "message" in body) {
    if (typeof body.message === "string") {
      return body.message;
    }
  }
  return null;
}

/** A message safe to show for an API failure. Logs only the status, never request data. */
export function failureMessage(error: unknown, action: string): string {
  if (error instanceof ApiError) {
    const message = bodyMessage(error.body);
    // 401 (wrong credentials) and 429 (try again in N minutes) carry a message written for users.
    if ((error.status === 401 || error.status === 429) && message !== null) {
      return message;
    }
    console.error(`${action} failed with status ${error.status}`);
  } else {
    console.error(`${action} failed`);
  }
  return "Something went wrong on our side. Please try again.";
}

/** The `field: "code"` style message the API sends for a rejected input. */
export function apiFieldError(error: unknown, field: string): string | null {
  if (!(error instanceof ApiError) || typeof error.body !== "object" || error.body === null) {
    return null;
  }
  if ("field" in error.body && error.body.field === field) {
    return bodyMessage(error.body);
  }
  return null;
}

/** Seconds the API asked us to wait (429), or null. */
export function retryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 429) {
    return null;
  }
  if (typeof error.body === "object" && error.body !== null && "retryAfterSeconds" in error.body) {
    const seconds = Number(error.body.retryAfterSeconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return null;
}
