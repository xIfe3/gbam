import { isMarketingPage, MARKETING_PAGE_LABELS, resolveMarketing } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/admin/action-forms";
import { adminCan } from "@/components/admin/admin-nav";
import { shortTime } from "@/components/admin/list-bits";
import { MarketingForm } from "@/components/admin/marketing-form";
import { PublishForm } from "@/components/admin/publish-form";
import { adminApi } from "@/lib/admin-api";
import {
  publishContentAction,
  saveMarketingDraftAction,
  unpublishContentAction,
} from "../../../content-actions";
import { CONTENT_STATUS_LABELS } from "../../labels";

export const metadata: Metadata = { title: "Marketing page · Admin" };

/**
 * One marketing page's editable words and photos. Saved as a draft; publishing makes it live
 * within a minute (the site rereads it every minute) and keeps a version.
 */
export default async function MarketingPageEditor(props: { params: Promise<{ page: string }> }) {
  const { page } = await props.params;
  if (!isMarketingPage(page)) {
    notFound();
  }
  const me = await adminApi.me();
  const canPublish = adminCan(me, "content.publish");
  // The page's entry is made the first time it's opened, with today's words.
  const opened = await adminApi.openMarketingPage(page);
  const detail = await adminApi.contentEntry(opened.id);
  const entry = detail.entry;

  let saved: unknown = entry.data;
  if (entry.draft) {
    saved = entry.draft.data;
  }
  const fields = resolveMarketing(page, saved) as Record<string, unknown>;
  // The home page lives at "/", the others at their own name.
  let livePath = `/${page}`;
  if (page === "home") {
    livePath = "/";
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/content/marketing" className="text-sm font-bold underline">
        ← All marketing pages
      </Link>
      <div>
        <h1 className="font-display text-ink text-3xl font-black">
          {MARKETING_PAGE_LABELS[page]} page
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          {CONTENT_STATUS_LABELS[entry.status]}
          {entry.draft && " · has unpublished changes"} ·{" "}
          <a href={livePath} target="_blank" rel="noreferrer" className="underline">
            View the live page
          </a>
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <MarketingForm
          page={page}
          fields={fields}
          action={saveMarketingDraftAction.bind(null, opened.id, page, entry.title)}
        />
      </section>

      {canPublish && (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-bold">Publish</h2>
          <p className="text-ink-muted text-sm">
            Save the draft first. A publish shows on the site within a minute.
          </p>
          <PublishForm action={publishContentAction.bind(null, opened.id)} />
          {entry.status !== "draft" && (
            <ActionButton
              action={unpublishContentAction.bind(null, opened.id)}
              label="Go back to the original words"
            />
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
                  href={`/admin/content/${opened.id}/versions/${version.id}`}
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
    </div>
  );
}
