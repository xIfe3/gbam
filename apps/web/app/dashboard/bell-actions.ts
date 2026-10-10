"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { api } from "@/lib/api";

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
