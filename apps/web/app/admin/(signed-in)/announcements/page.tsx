import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-forms";
import { shortTime } from "@/components/admin/list-bits";
import { param } from "@/components/admin/list-params";
import { adminApi } from "@/lib/admin-api";
import { restoreAnnouncementAction } from "../messaging-actions";
import { ANNOUNCEMENT_STATUS_LABELS } from "./status";

export const metadata: Metadata = { title: "Announcements · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Email announcements to sellers ("news and tips"), newest first. */
export default async function AnnouncementsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const inBin = param(searchParams, "bin") === "1";
  const rows = await adminApi.announcements(inBin);

  let binLink = "/admin/announcements?bin=1";
  let binLabel = "Show the bin";
  if (inBin) {
    binLink = "/admin/announcements";
    binLabel = "Back to announcements";
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-ink text-3xl font-black">
          Announcements{inBin && " (bin)"}
        </h1>
        <div className="flex gap-4">
          <Link href={binLink} className="text-sm font-bold underline">
            {binLabel}
          </Link>
          {!inBin && (
            <Link
              href="/admin/announcements/new"
              className="bg-brand rounded-full px-4 py-2 text-sm font-bold text-white"
            >
              New announcement
            </Link>
          )}
        </div>
      </div>
      <p className="text-ink-muted text-sm">
        Emails to sellers about news and tips. Each one has an unsubscribe link; sellers who
        unsubscribed, and suspended or closed shops, never get them.
      </p>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="admin-list w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500">
            <tr>
              <th className="p-3">Subject</th>
              <th className="p-3">Status</th>
              <th className="p-3">When</th>
              {inBin && (
                <th className="p-3">
                  <span className="sr-only">Restore</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              let when = `Written ${shortTime(row.createdAt)}`;
              if (row.sentAt) {
                when = `Sent ${shortTime(row.sentAt)}`;
              } else if (row.scheduledAt) {
                when = `For ${shortTime(row.scheduledAt)}`;
              }
              return (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td data-primary className="p-3">
                    <Link href={`/admin/announcements/${row.id}`} className="font-bold underline">
                      {row.subject}
                    </Link>
                  </td>
                  <td data-label="Status" className="p-3">
                    {ANNOUNCEMENT_STATUS_LABELS[row.status]}
                  </td>
                  <td data-label="When" className="p-3">
                    {when}
                  </td>
                  {inBin && (
                    <td className="p-3">
                      <ActionButton
                        action={restoreAnnouncementAction.bind(null, row.id)}
                        label="Restore"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-5 text-zinc-500">No announcements yet.</p>}
      </div>
    </div>
  );
}
