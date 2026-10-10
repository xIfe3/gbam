import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-forms";
import { adminCan } from "@/components/admin/admin-nav";
import { shortTime } from "@/components/admin/list-bits";
import { adminApi } from "@/lib/admin-api";
import { restoreVersionAction } from "../../../../content-actions";

export const metadata: Metadata = { title: "Compare versions · Admin" };

type Props = { params: Promise<{ id: string; versionId: string }> };

/** One text side by side with another, to see what changed. */
function Column({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <section aria-label={label} className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-ink-muted mb-2 text-sm font-bold">{label}</h2>
      <p className="font-bold">{title}</p>
      <pre className="mt-2 font-sans text-sm whitespace-pre-wrap">{body}</pre>
    </section>
  );
}

/** A published version next to the current text (the draft, or what's live). */
export default async function VersionPage(props: Props) {
  const { id, versionId } = await props.params;
  const me = await adminApi.me();
  const detail = await adminApi.contentEntry(id);
  const version = await adminApi.contentVersion(id, versionId);
  const entry = detail.entry;

  let nowLabel = "Now (live)";
  let nowTitle = entry.title;
  let nowBody = entry.body;
  if (entry.draft) {
    nowLabel = "Now (draft)";
    nowTitle = entry.draft.title;
    nowBody = entry.draft.body;
  }

  return (
    <div className="space-y-5">
      <Link href={`/admin/content/${id}`} className="text-sm font-bold underline">
        ← Back to the entry
      </Link>
      <h1 className="font-display text-ink text-3xl font-black">
        Version {version.version}{" "}
        <span className="text-ink-muted text-lg">· {shortTime(version.createdAt)}</span>
      </h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Column label={`Version ${version.version}`} title={version.title} body={version.body} />
        <Column label={nowLabel} title={nowTitle} body={nowBody} />
      </div>
      {adminCan(me, "content.publish") && (
        <ActionButton
          action={restoreVersionAction.bind(null, id, versionId)}
          label="Restore this version"
        />
      )}
    </div>
  );
}
