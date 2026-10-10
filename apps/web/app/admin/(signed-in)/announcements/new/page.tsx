import type { Metadata } from "next";
import Link from "next/link";
import { AnnouncementForm } from "@/components/admin/messaging-forms";
import { createAnnouncementAction, previewAnnouncementAction } from "../../messaging-actions";

export const metadata: Metadata = { title: "New announcement · Admin" };

/** Write a new announcement. It's saved as a draft; sending is a separate step. */
export default function NewAnnouncementPage() {
  return (
    <div className="space-y-5">
      <Link href="/admin/announcements" className="text-sm font-bold underline">
        ← All announcements
      </Link>
      <h1 className="font-display text-ink text-3xl font-black">New announcement</h1>
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <AnnouncementForm
          action={createAnnouncementAction}
          previewAction={previewAnnouncementAction}
          saveLabel="Save draft"
        />
      </div>
    </div>
  );
}
