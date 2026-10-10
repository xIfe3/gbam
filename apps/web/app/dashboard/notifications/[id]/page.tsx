import { NOTIFICATION_TYPE_LABELS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { PendingButton } from "@/components/brand/form-bits";
import { formatWhen, typeMark } from "@/components/dashboard/notification-bits";
import { api, ApiError, type SellerNotification } from "@/lib/api";
import {
  deleteNotificationAction,
  markNotificationUnreadAction,
  restoreNotificationAction,
  trashNotificationAction,
} from "../../bell-actions";
import { ConfirmButton } from "../confirm-button";

export const metadata: Metadata = { title: "Notification" };

const BUTTON = "border-brand-tint text-ink rounded-full border-2 px-4 py-2 text-sm font-bold";

/** One notification in full. Opening it marks it read, like opening an email. */
export default async function NotificationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  let item: SellerNotification;
  try {
    item = await api.notification(id);
  } catch (error) {
    unstable_rethrow(error);
    // 404 also covers another shop's notification: no hint that it exists.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }

  if (item.readAt === null) {
    try {
      await api.markNotificationRead(item.id);
    } catch (error) {
      unstable_rethrow(error);
      // Not worth failing the page over: it just stays unread.
      console.error("marking a notification read failed");
    }
  }

  const inTrash = item.deletedAt !== null;
  let backLink = "/dashboard/notifications";
  if (inTrash) {
    backLink = "/dashboard/notifications?tab=trash";
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={backLink} className="text-brand-hover text-sm font-bold">
        ← All notifications
      </Link>
      <article className="rounded-2xl bg-white p-5">
        <p className="text-ink-muted flex gap-2 text-sm font-bold">
          <span aria-hidden="true">{typeMark(item.type)}</span>
          {NOTIFICATION_TYPE_LABELS[item.type]} · {formatWhen(item.createdAt)}
        </p>
        <h1 className="font-display text-ink mt-2 text-2xl font-black">{item.title}</h1>
        <p className="text-ink mt-3 whitespace-pre-line">{item.body}</p>
        {inTrash && (
          <p className="bg-blush text-ink mt-4 rounded-xl p-3 text-sm">
            This is in the trash. It will be deleted for good 30 days after it was moved there.
          </p>
        )}
        {item.link && (
          <Link
            href={item.link}
            className="bg-brand mt-5 inline-block rounded-full px-5 py-2 font-bold text-white"
          >
            Open
          </Link>
        )}
      </article>

      <div role="group" aria-label="Actions" className="flex flex-wrap gap-2">
        {!inTrash && (
          <>
            <form action={markNotificationUnreadAction.bind(null, item.id)}>
              <PendingButton pendingLabel="Saving…" className={BUTTON}>
                Mark unread
              </PendingButton>
            </form>
            <form action={trashNotificationAction.bind(null, item.id)}>
              <PendingButton pendingLabel="Moving…" className={BUTTON}>
                Move to trash
              </PendingButton>
            </form>
          </>
        )}
        {inTrash && (
          <>
            <form action={restoreNotificationAction.bind(null, item.id)}>
              <PendingButton pendingLabel="Restoring…" className={BUTTON}>
                Restore
              </PendingButton>
            </form>
            <ConfirmButton
              action={deleteNotificationAction.bind(null, item.id)}
              label="Delete for good"
              confirmLabel="Yes, delete it"
              question="This cannot be undone."
            />
          </>
        )}
      </div>
    </div>
  );
}
