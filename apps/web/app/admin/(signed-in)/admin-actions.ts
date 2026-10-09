"use server";

import {
  ADMIN_PERMISSIONS,
  inviteAdminSchema,
  maintenanceSchema,
  parseNairaInput,
  platformSettingsSchema,
  reasonSchema,
  roleInputSchema,
  ticketReplySchema,
  ticketUpdateSchema,
  updateAdminSchema,
  type AdminPermission,
  type TicketBulkAction,
  type TicketPriority,
  type TicketStatus,
} from "@gbam/shared";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { apiFieldError, fieldErrorsFrom, text, type FormState } from "@/app/(auth)/action-helpers";
import { adminApi, type BulkResult } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

/**
 * Server actions for the admin pages (shops, refunds, support, team, roles, sessions).
 * The API checks every permission again; these only check the form and pass it on.
 */

/**
 * A message for an API refusal. Admin API messages for 4xx answers ("Already suspended",
 * "This is the last superadmin...") are written for admins, so they're shown as they are.
 */
function adminFailure(error: unknown): string {
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
  return "Something went wrong. Please try again.";
}

/** Reads the "reason" box; returns the reason, or field errors to show. */
function readReason(formData: FormData): { reason: string } | { state: FormState } {
  const parsed = reasonSchema.safeParse({ reason: text(formData, "reason") });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Write a short reason";
    return { state: { fieldErrors: { reason: message } } };
  }
  return { reason: parsed.data.reason };
}

/** Runs one API call that needs a reason, then refreshes the page to show the change. */
async function withReason(
  formData: FormData,
  call: (reason: string) => Promise<unknown>,
  done: string,
): Promise<FormState> {
  const read = readReason(formData);
  if ("state" in read) {
    return read.state;
  }
  try {
    await call(read.reason);
  } catch (error) {
    return { error: adminFailure(error) };
  }
  refresh();
  return { notice: done };
}

/** Runs one API call with no form input, then refreshes. */
async function simple(call: () => Promise<unknown>, done: string): Promise<FormState> {
  try {
    await call();
  } catch (error) {
    return { error: adminFailure(error) };
  }
  refresh();
  return { notice: done };
}

// ---- Shops ----

export async function suspendShopAction(id: string, _prev: FormState, formData: FormData) {
  return withReason(formData, (reason) => adminApi.suspendShop(id, reason), "Shop suspended.");
}

export async function reopenShopAction(id: string, _prev: FormState, formData: FormData) {
  return withReason(formData, (reason) => adminApi.reopenShop(id, reason), "Shop reopened.");
}

export async function unlockSellerAction(id: string): Promise<FormState> {
  return simple(() => adminApi.unlockSeller(id), "Seller unlocked: they can sign in now.");
}

export async function resendVerificationAction(id: string): Promise<FormState> {
  return simple(() => adminApi.resendVerification(id), "A new verification code was emailed.");
}

const dateSchema = z.iso.date("Pick a date");

/** A date sets the fee waiver; the Clear button (clear=1) ends it. */
export async function feeWaiverAction(id: string, _prev: FormState, formData: FormData) {
  let until: string | null = null;
  if (text(formData, "clear") !== "1") {
    const parsed = dateSchema.safeParse(text(formData, "until"));
    if (!parsed.success) {
      return { fieldErrors: { until: "Pick a date" } };
    }
    until = parsed.data;
  }
  let done = "Fee waiver ended.";
  if (until !== null) {
    done = `No Gbam fee until ${until}.`;
  }
  return simple(() => adminApi.setFeeWaiver(id, until), done);
}

/** Called from the bulk dialog (not a form), so it returns what happened to each shop. */
export async function bulkShopsAction(
  action: "suspend" | "reopen",
  ids: string[],
  note: string,
): Promise<BulkResult> {
  const result = await adminApi.bulkShops(action, ids, note);
  refresh();
  return result;
}

// ---- Refunds ----

/** Needs the tick ("the money is back with the customer") and a note. */
export async function resolveRefundAction(id: string, _prev: FormState, formData: FormData) {
  if (text(formData, "confirmed") !== "on") {
    return {
      fieldErrors: { confirmed: "Tick the box once the money is back with the customer" },
    };
  }
  return withReason(
    formData,
    (reason) => adminApi.resolveRefund(id, reason),
    "Marked as refunded.",
  );
}

// ---- Support ----

export async function handleMessageAction(id: string, _prev: FormState, formData: FormData) {
  return withReason(formData, (reason) => adminApi.handleMessage(id, reason), "Marked handled.");
}

export async function bulkHandleMessagesAction(ids: string[], note: string): Promise<BulkResult> {
  const result = await adminApi.bulkHandleMessages(ids, note);
  refresh();
  return result;
}

export async function resolveIssueAction(id: string, _prev: FormState, formData: FormData) {
  return withReason(formData, (reason) => adminApi.resolveIssue(id, reason), "Marked resolved.");
}

// ---- Team (superadmin) ----

/** A form's roleId: "" (none picked) becomes null. */
function roleIdFrom(formData: FormData): string | null {
  const value = text(formData, "roleId");
  if (value === "") {
    return null;
  }
  return value;
}

export async function inviteAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { name: text(formData, "name"), email: text(formData, "email") };
  const input = inviteAdminSchema.safeParse({
    ...values,
    roleId: roleIdFrom(formData),
    isSuperadmin: text(formData, "isSuperadmin") === "on",
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error), values };
  }
  try {
    await adminApi.inviteAdmin(input.data);
  } catch (error) {
    const emailError = apiFieldError(error, "email");
    if (emailError !== null) {
      return { fieldErrors: { email: emailError }, values };
    }
    return { error: adminFailure(error), values };
  }
  refresh();
  return { notice: `Invite sent to ${input.data.email}.` };
}

export async function updateAdminAction(id: string, _prev: FormState, formData: FormData) {
  const input = updateAdminSchema.safeParse({
    roleId: roleIdFrom(formData),
    isSuperadmin: text(formData, "isSuperadmin") === "on",
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  return simple(() => adminApi.updateAdmin(id, input.data), "Saved.");
}

export async function resetAuthenticatorAction(id: string): Promise<FormState> {
  return simple(
    () => adminApi.resetAuthenticator(id),
    "They're signed out and a new setup link was emailed.",
  );
}

export async function removeAdminAction(id: string): Promise<FormState> {
  return simple(() => adminApi.removeAdmin(id), "Removed. They're signed out everywhere.");
}

// ---- Roles (superadmin) ----

/** The ticked permission checkboxes (all named "permissions"), keeping only real names. */
function permissionsFrom(formData: FormData): AdminPermission[] {
  const ticked: AdminPermission[] = [];
  for (const value of formData.getAll("permissions")) {
    for (const permission of ADMIN_PERMISSIONS) {
      if (value === permission && !ticked.includes(permission)) {
        ticked.push(permission);
      }
    }
  }
  return ticked;
}

async function saveRole(
  formData: FormData,
  call: (input: { name: string; permissions: AdminPermission[] }) => Promise<unknown>,
): Promise<FormState> {
  const input = roleInputSchema.safeParse({
    name: text(formData, "name"),
    permissions: permissionsFrom(formData),
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  try {
    await call(input.data);
  } catch (error) {
    const nameError = apiFieldError(error, "name");
    if (nameError !== null) {
      return { fieldErrors: { name: nameError } };
    }
    return { error: adminFailure(error) };
  }
  refresh();
  return { notice: "Role saved." };
}

export async function createRoleAction(_prev: FormState, formData: FormData) {
  return saveRole(formData, (input) => adminApi.createRole(input));
}

export async function updateRoleAction(id: string, _prev: FormState, formData: FormData) {
  return saveRole(formData, (input) => adminApi.updateRole(id, input));
}

export async function deleteRoleAction(id: string): Promise<FormState> {
  return simple(() => adminApi.deleteRole(id), "Moved to the bin for 30 days.");
}

export async function restoreRoleAction(id: string): Promise<FormState> {
  return simple(() => adminApi.restoreRole(id), "Role restored.");
}

// ---- Sessions (superadmin) ----

export async function endAdminSessionAction(id: string): Promise<FormState> {
  return simple(() => adminApi.endAdminSession(id), "Signed out on that device.");
}

export async function endAllAdminSessionsAction(adminId: string): Promise<FormState> {
  return simple(() => adminApi.endAllAdminSessions(adminId), "Signed out everywhere.");
}

export async function endSellerSessionAction(id: string, _prev: FormState, formData: FormData) {
  return withReason(
    formData,
    (reason) => adminApi.endSellerSession(id, reason),
    "Seller signed out on that device.",
  );
}

// ---- Platform settings and maintenance ----

/** The form shows the fee as a percent and the cap in naira; the API wants basis points and kobo. */
const FIELD_FOR = { feePercentBasisPoints: "feePercent", feeCapKobo: "feeCapNaira" } as const;

/** A whole number from a text box, or NaN (which the schema then reports). */
function wholeNumber(formData: FormData, name: string): number {
  return Number(text(formData, name).trim());
}

export async function saveSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // "1.5" (%) → 150 basis points. Math.round keeps it a whole number.
  const percent = Number(text(formData, "feePercent").trim());
  let capKobo = parseNairaInput(text(formData, "feeCapNaira"));
  if (capKobo === null) {
    capKobo = Number.NaN;
  }
  const input = platformSettingsSchema.safeParse({
    feePercentBasisPoints: Math.round(percent * 100),
    feeCapKobo: capKobo,
    foundingWaiverDays: wholeNumber(formData, "foundingWaiverDays"),
    reminderAfterHours: wholeNumber(formData, "reminderAfterHours"),
    cancelAfterHours: wholeNumber(formData, "cancelAfterHours"),
    supportEmail: text(formData, "supportEmail").trim(),
    contactEmail: text(formData, "contactEmail").trim(),
    privacyEmail: text(formData, "privacyEmail").trim(),
    whatsappNumber: text(formData, "whatsappNumber"),
    // An unticked checkbox isn't sent at all, so "missing" means off.
    signupsOpen: text(formData, "signupsOpen") === "on",
  });
  if (!input.success) {
    const errors = fieldErrorsFrom(input.error);
    // Point the fee errors at the boxes the admin actually typed in.
    const fieldErrors: Record<string, string> = {};
    for (const [field, message] of Object.entries(errors)) {
      let formField: string = field;
      if (field === "feePercentBasisPoints" || field === "feeCapKobo") {
        formField = FIELD_FOR[field];
      }
      fieldErrors[formField] = message;
    }
    return { fieldErrors };
  }
  try {
    await adminApi.saveSettings(input.data);
  } catch (error) {
    return { error: adminFailure(error) };
  }
  refresh();
  return { notice: "Settings saved. Everything uses them within 30 seconds." };
}

/** "2026-10-09T15:00" typed in a date-time box (Lagos time) → an exact time with its offset. */
function lagosTime(value: string): string | null {
  if (value === "") {
    return null;
  }
  // Nigeria is UTC+1 all year (no daylight saving).
  return `${value}:00+01:00`;
}

export async function maintenanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const level = text(formData, "level");
  let message: string | null = text(formData, "message").trim();
  if (message === "") {
    message = null;
  }
  let backBy = lagosTime(text(formData, "backBy"));
  if (level === "off") {
    message = null;
    backBy = null;
  }
  const input = maintenanceSchema.safeParse({ level, message, backBy });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  // Switching it ON affects every visitor, so it needs a tick to confirm.
  if (input.data.level !== "off" && text(formData, "confirmed") !== "on") {
    return {
      fieldErrors: { confirmed: "Tick the box to confirm: visitors will see the maintenance page" },
    };
  }
  try {
    await adminApi.setMaintenance(input.data);
  } catch (error) {
    return { error: adminFailure(error) };
  }
  refresh();
  if (input.data.level === "off") {
    return { notice: "Maintenance is off. The site is open." };
  }
  return { notice: "Maintenance is on. It reaches every page within about 20 seconds." };
}

/** The "Active now" panel asks for fresh numbers every few seconds through this. */
export async function activeNowAction() {
  return adminApi.active();
}

/** Puts a failed background job back in its queue (system.manage; the API records it). */
export async function retryJobAction(queue: string, id: string): Promise<FormState> {
  return simple(() => adminApi.retryJob(queue, id), "Queued to run again.");
}

// ---- Tickets ----

/** What a bulk ticket button does, besides the ids and note the dialog collects. */
export type TicketBulkChoice = {
  action: TicketBulkAction;
  assigneeId?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
};

export async function bulkTicketsAction(
  choice: TicketBulkChoice,
  ids: string[],
  note: string,
): Promise<BulkResult> {
  const result = await adminApi.bulkTickets({ ...choice, ids, note });
  refresh();
  return result;
}

/** A reply the person who asked will get by email. */
export async function ticketReplyAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = ticketReplySchema.safeParse({ message: text(formData, "message") });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  return simple(
    () => adminApi.replyTicket(id, input.data.message),
    "Reply sent: they'll get it by email.",
  );
}

/** A note only admins see. */
export async function ticketNoteAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = ticketReplySchema.safeParse({ message: text(formData, "message") });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  return simple(() => adminApi.noteTicket(id, input.data.message), "Note added.");
}

/** Status, priority and assignee, saved together. An empty assignee means nobody. */
export async function updateTicketAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  let assigneeId: string | null = text(formData, "assigneeId");
  if (assigneeId === "") {
    assigneeId = null;
  }
  const input = ticketUpdateSchema.safeParse({
    status: text(formData, "status"),
    priority: text(formData, "priority"),
    assigneeId,
  });
  if (!input.success) {
    return { fieldErrors: fieldErrorsFrom(input.error) };
  }
  return simple(() => adminApi.updateTicket(id, input.data), "Saved.");
}

export async function deleteTicketAction(id: string, _prev: FormState, formData: FormData) {
  return withReason(formData, (reason) => adminApi.deleteTicket(id, reason), "Moved to the bin.");
}

export async function restoreTicketAction(id: string): Promise<FormState> {
  return simple(() => adminApi.restoreTicket(id), "Restored from the bin.");
}
