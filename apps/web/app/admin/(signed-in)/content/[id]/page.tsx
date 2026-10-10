import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-forms";
import { adminCan } from "@/components/admin/admin-nav";
import { ContentEditor } from "@/components/admin/content-editor";
import { shortTime } from "@/components/admin/list-bits";
import { PublishForm } from "@/components/admin/publish-form";
import { adminApi } from "@/lib/admin-api";
import {
  deleteContentAction,
  publishContentAction,
  restoreContentAction,
  saveContentDraftAction,
  unpublishContentAction,
} from "../../content-actions";
import { CONTENT_STATUS_LABELS, typeLabel } from "../labels";

export const metadata: Metadata = { title: "Edit content · Admin" };

/**
 * One entry: the editor opens on the unpublished draft if there is one, otherwise on what's
 * live. Publishing (content.publish) puts the draft live and keeps a version.
 */
export default async function ContentEntryPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const me = await adminApi.me();
  const canPublish = adminCan(me, "content.publish");
  const detail = await adminApi.contentEntry(id);
  const entry = detail.entry;
  const inBin = entry.deletedAt !== null;

  let current = {
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    category: entry.category,
    sortOrder: entry.sortOrder,
    seoDescription: entry.seoDescription,
    data: entry.data,
  };
  if (entry.draft) {
    current = entry.draft;
  }

  let when = "";
  if (entry.publishedAt) {
    when = ` · ${shortTime(entry.publishedAt)}`;
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/content" className="text-sm font-bold underline">
        ← All content
      </Link>
      <div>
        <h1 className="font-display text-ink text-3xl font-black">{current.title}</h1>
        <p className="text-ink-muted mt-1 text-sm">
          {typeLabel(entry.type)} · /{entry.slug} · {CONTENT_STATUS_LABELS[entry.status]}
          {when}
          {entry.draft && " · has unpublished changes"}
          {inBin && " · in the bin"}
        </p>
      </div>

      {!inBin && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <ContentEditor
            action={saveContentDraftAction.bind(null, id)}
            initial={current}
            type={entry.type}
            saveLabel="Save draft"
          />
        </section>
      )}

      {canPublish && !inBin && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-bold">Publish</h2>
          <p className="text-ink-muted text-sm">
            Save the draft first: publishing puts the last saved draft live.
          </p>
          <PublishForm action={publishContentAction.bind(null, id)} />
          {entry.status !== "draft" && (
            <ActionButton action={unpublishContentAction.bind(null, id)} label="Unpublish" />
          )}
        </section>
      )}

      {detail.versions.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-2 font-bold">Published versions</h2>
          <ul className="space-y-1 text-sm">
            {detail.versions.map((version) => (
              <li key={version.id}>
                <Link
                  href={`/admin/content/${id}/versions/${version.id}`}
                  className="font-bold underline"
                >
                  Version {version.version}
                </Link>{" "}
                <span className="text-ink-muted">
                  · {shortTime(version.createdAt)}
                  {version.publishedByName && ` by ${version.publishedByName}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!inBin && (
        <ActionButton action={deleteContentAction.bind(null, id)} label="Move to the bin" />
      )}
      {inBin && (
        <ActionButton action={restoreContentAction.bind(null, id)} label="Restore from the bin" />
      )}
    </div>
  );
}
