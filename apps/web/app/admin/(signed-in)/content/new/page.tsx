import type { Metadata } from "next";
import Link from "next/link";
import { ContentEditor } from "@/components/admin/content-editor";
import { createContentAction } from "../../content-actions";

export const metadata: Metadata = { title: "New entry · Admin" };

const EMPTY = {
  title: "",
  summary: null,
  body: "",
  category: null,
  sortOrder: 0,
  seoDescription: null,
  data: null,
};

/** A new help article, FAQ, blog post, changelog entry or legal page. Saved as a draft. */
export default function NewContentPage() {
  return (
    <div className="space-y-5">
      <Link href="/admin/content" className="text-sm font-bold underline">
        ← All content
      </Link>
      <h1 className="font-display text-ink text-3xl font-black">New entry</h1>
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <ContentEditor
          action={createContentAction}
          initial={EMPTY}
          type="help_article"
          isNew
          saveLabel="Save draft"
        />
      </div>
    </div>
  );
}
