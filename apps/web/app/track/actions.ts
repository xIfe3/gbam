"use server";

import { ISSUE_REASONS, reportIssueSchema, trackLookupSchema } from "@gbam/shared";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";

// Server Actions for the customer tracking pages. The browser can send anything, so each
// one checks its input again before calling the API.

export type LookupState = { error?: string; values?: { code: string; phoneLast4: string } };

const LOOKUP_NOT_FOUND = "We couldn't find an order with that code and phone number.";
const TOO_MANY = "Too many tries. Please wait a few minutes and try again.";
const GENERIC = "Something went wrong on our side. Please try again.";
const GONE = "We can't find this order any more. Message the seller on WhatsApp for help.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value === "string") {
    return value;
  }
  return "";
}

/** /track form: code + last 4 phone digits → open the private tracking page. */
export async function lookupAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const values = { code: text(formData, "code"), phoneLast4: text(formData, "phoneLast4") };
  const parsed = trackLookupSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the code and digits.", values };
  }
  let found: { code: string; key: string };
  try {
    found = await api.trackLookup(parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 404) {
      return { error: LOOKUP_NOT_FOUND, values };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { error: TOO_MANY, values };
    }
    console.error("track lookup failed");
    return { error: GENERIC, values };
  }
  // redirect() works by throwing, so it stays outside the try/catch.
  redirect(`/track/${found.code}?k=${encodeURIComponent(found.key)}`);
}

const keySchema = z.string().min(20).max(200);

/** "Pay now": returns the Paystack link to open, or a message. */
export async function payNowAction(
  code: string,
  key: string,
): Promise<{ url?: string; error?: string }> {
  if (!keySchema.safeParse(key).success) {
    return { error: GENERIC };
  }
  try {
    const result = await api.trackPay(code, key);
    return { url: result.url };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 409) {
      return { error: "This order isn't waiting for payment any more. Refresh the page." };
    }
    if (error instanceof ApiError && error.status === 404) {
      return { error: GONE };
    }
    console.error("track pay failed");
    return { error: GENERIC };
  }
}

export type ReportState = { done?: boolean; error?: string };

/** "Report a problem": a reason from the list plus an optional short note. */
export async function reportIssueAction(
  code: string,
  key: string,
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  if (!keySchema.safeParse(key).success) {
    return { error: GENERIC };
  }
  let note: string | undefined = text(formData, "note").trim();
  if (note === "") {
    note = undefined;
  }
  const reason = text(formData, "reason");
  if (!(ISSUE_REASONS as readonly string[]).includes(reason)) {
    return { error: "Choose what went wrong." };
  }
  const parsed = reportIssueSchema.safeParse({ reason, note });
  if (!parsed.success) {
    return { error: "Keep the note under 500 characters." };
  }
  try {
    await api.trackReportIssue(code, key, parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 429) {
      return { error: "You've reported this order a few times already. The seller has been told." };
    }
    if (error instanceof ApiError && error.status === 404) {
      return { error: GONE };
    }
    console.error("track report failed");
    return { error: GENERIC };
  }
  revalidatePath(`/track/${code}`);
  return { done: true };
}
