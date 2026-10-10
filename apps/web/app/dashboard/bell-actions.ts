"use server";

import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { api, type NotificationBulkAction } from "@/lib/api";

/** Marks one bell notification read. A failure just leaves it unread; the bell carries on. */
export async function markNotificationReadAction(id: string): Promise<void> {
  try {
    await api.markNotificationRead(id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("marking a notification read failed");
  }
  refresh();
}

export async function markAllNotificationsReadAction(): Promise<void> {
  try {
    await api.markAllNotificationsRead();
  } catch (error) {
    unstable_rethrow(error);
    console.error("marking all notifications read failed");
  }
  refresh();
}

/**
 * Marks one notification unread again, then goes back to the list: staying on its page
 * would mark it read straight away (opening a notification reads it).
 */
export async function markNotificationUnreadAction(id: string): Promise<void> {
  try {
    await api.changeNotification(id, "unread");
  } catch (error) {
    unstable_rethrow(error);
    console.error("marking a notification unread failed");
  }
  redirect("/dashboard/notifications");
}

/** Moves one notification to the trash. It stays there 30 days, then goes for good. */
export async function trashNotificationAction(id: string): Promise<void> {
  try {
    await api.changeNotification(id, "trash");
  } catch (error) {
    unstable_rethrow(error);
    console.error("moving a notification to the trash failed");
  }
  refresh();
}

export async function restoreNotificationAction(id: string): Promise<void> {
  try {
    await api.changeNotification(id, "restore");
  } catch (error) {
    unstable_rethrow(error);
    console.error("restoring a notification failed");
  }
  refresh();
}

/** Deletes one notification for good (only from the trash), then shows the trash. */
export async function deleteNotificationAction(id: string): Promise<void> {
  try {
    await api.deleteNotification(id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("deleting a notification failed");
  }
  redirect("/dashboard/notifications?tab=trash");
}

export async function emptyNotificationTrashAction(): Promise<void> {
  try {
    await api.emptyNotificationTrash();
  } catch (error) {
    unstable_rethrow(error);
    console.error("emptying the notification trash failed");
  }
  refresh();
}

/** The same change for every ticked notification. Returns a message if it didn't work. */
export async function bulkNotificationsAction(
  ids: string[],
  action: NotificationBulkAction,
): Promise<{ error?: string }> {
  try {
    await api.bulkNotifications(ids, action);
  } catch (error) {
    unstable_rethrow(error);
    console.error("changing several notifications failed");
    return { error: "That didn't work. Please try again." };
  }
  refresh();
  return {};
}
