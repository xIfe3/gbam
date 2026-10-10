import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-forms";
import { shortTime } from "@/components/admin/list-bits";
import { AnnouncementForm, SendAnnouncementForm } from "@/components/admin/messaging-forms";
import { adminApi } from "@/lib/admin-api";
import {
  cancelAnnouncementAction,
  deleteAnnouncementAction,
  previewAnnouncementAction,
  restoreAnnouncementAction,
  sendAnnouncementAction,
  testAnnouncementAction,
  updateAnnouncementAction,
} from "../../messaging-actions";
import { ANNOUNCEMENT_STATUS_LABELS } from "../status";

export const metadata: Metadata = { title: "Announcement · Admin" };

/**
 * One announcement. A draft can be edited, tested and sent or scheduled; a scheduled one
 * can be cancelled; once sending, it shows how many emails went and failed.
 */
export default async function AnnouncementPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const detail = await adminApi.announcement(id);
  const announcement = detail.announcement;
  const isDraft = announcement.status === "draft";
  const inBin = announcement.deletedAt !== null;
  const canBin = !inBin && announcement.status !== "sending" && announcement.status !== "scheduled";

  let when = "";
  if (announcement.sentAt) {
    when = ` · sent ${shortTime(announcement.sentAt)}`;
  } else if (announcement.scheduledAt) {
    when = ` · for ${shortTime(announcement.scheduledAt)}`;
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/announcements" className="text-sm font-bold underline">
        ← All announcements
      </Link>
      <div>
        <h1 className="font-display text-ink text-3xl font-black">{announcement.subject}</h1>
        <p className="text-ink-muted mt-1 text-sm">
          {ANNOUNCEMENT_STATUS_LABELS[announcement.status]}
          {when}
          {inBin && " · in the bin"}
        </p>
      </div>

      {!isDraft && (
        <dl className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <dt className="text-ink-muted text-sm">Sent</dt>
            <dd className="font-display text-ink text-2xl font-black">{detail.counts.sent}</dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <dt className="text-ink-muted text-sm">Waiting</dt>
            <dd className="font-display text-ink text-2xl font-black">{detail.counts.queued}</dd>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <dt className="text-ink-muted text-sm">Failed</dt>
            <dd className="font-display text-ink text-2xl font-black">{detail.counts.failed}</dd>
          </div>
        </dl>
      )}

      {isDraft && !inBin && (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 font-bold">Edit</h2>
            <AnnouncementForm
              action={updateAnnouncementAction.bind(null, id)}
              previewAction={previewAnnouncementAction}
              initial={announcement}
              saveLabel="Save draft"
            />
          </section>
          <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="font-bold">Check it, then send</h2>
            <ActionButton
              action={testAnnouncementAction.bind(null, id)}
              label="Send a test to me"
            />
            <SendAnnouncementForm
              action={sendAnnouncementAction.bind(null, id)}
              audienceCount={detail.audienceCount}
            />
          </section>
        </>
      )}

      {announcement.status === "scheduled" && (
        <ActionButton action={cancelAnnouncementAction.bind(null, id)} label="Cancel sending" />
      )}
      {canBin && (
        <ActionButton action={deleteAnnouncementAction.bind(null, id)} label="Move to the bin" />
      )}
      {inBin && (
        <ActionButton
          action={restoreAnnouncementAction.bind(null, id)}
          label="Restore from the bin"
        />
      )}
    </div>
  );
}
