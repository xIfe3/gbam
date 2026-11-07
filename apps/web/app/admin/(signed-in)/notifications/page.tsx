import { NOTIFICATION_DISPLAY_LABELS, NOTIFICATION_TYPE_LABELS } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-forms";
import { shortTime } from "@/components/admin/list-bits";
import { param } from "@/components/admin/list-params";
import { NotificationForm } from "@/components/admin/messaging-forms";
import { adminApi } from "@/lib/admin-api";
import {
  countNotificationAction,
  deleteNotificationAction,
  restoreNotificationAction,
  sendNotificationAction,
} from "../messaging-actions";

export const metadata: Metadata = { title: "Notifications · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Send a notification to sellers' dashboard bells, and see the ones already sent. */
export default async function NotificationsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const inBin = param(searchParams, "bin") === "1";
  const campaigns = await adminApi.notifications(inBin);

  let binLink = "/admin/notifications?bin=1";
  let binLabel = "Show the bin";
  if (inBin) {
    binLink = "/admin/notifications";
    binLabel = "Back to notifications";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-ink text-3xl font-black">
          Notifications{inBin && " (bin)"}
        </h1>
        <Link href={binLink} className="text-sm font-bold underline">
          {binLabel}
        </Link>
      </div>

      {!inBin && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 font-bold">New notification</h2>
          <p className="text-ink-muted mb-4 text-sm">
            Shows in the bell of each seller&apos;s dashboard, and as a banner or modal if you
            choose. It isn&apos;t emailed.
          </p>
          <NotificationForm action={sendNotificationAction} countAction={countNotificationAction} />
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="admin-list w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500">
            <tr>
              <th className="p-3">Notification</th>
              <th className="p-3">Type</th>
              <th className="p-3">Shown as</th>
              <th className="p-3">Read</th>
              <th className="p-3">Sent</th>
              <th className="p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="border-b border-zinc-100 align-top last:border-0">
                <td data-primary className="p-3">
                  <span className="font-bold">{campaign.title}</span>
                  <span className="text-ink-muted block">{campaign.body}</span>
                </td>
                <td data-label="Type" className="p-3">
                  {NOTIFICATION_TYPE_LABELS[campaign.type]}
                </td>
                <td data-label="Shown as" className="p-3">
                  {NOTIFICATION_DISPLAY_LABELS[campaign.display]}
                  {campaign.display !== "bell" && (
                    <span className="text-ink-muted block">
                      {campaign.acknowledgedCount} of {campaign.recipientCount} acknowledged
                    </span>
                  )}
                </td>
                <td data-label="Read" className="p-3">
                  {campaign.readCount} of {campaign.recipientCount}
                </td>
                <td data-label="Sent" className="p-3">
                  {shortTime(campaign.createdAt)}
                </td>
                <td className="p-3">
                  {!inBin && (
                    <ActionButton
                      action={deleteNotificationAction.bind(null, campaign.id)}
                      label="Move to the bin"
                    />
                  )}
                  {inBin && (
                    <ActionButton
                      action={restoreNotificationAction.bind(null, campaign.id)}
                      label="Restore"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {campaigns.length === 0 && <p className="p-5 text-zinc-500">None yet.</p>}
      </div>
    </div>
  );
}
