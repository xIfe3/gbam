import type { Metadata } from "next";
import Link from "next/link";
import { ContentUnavailable, formatDate } from "../content-unavailable";
import { EmptyState } from "@/components/brand/empty-state";
import { PageHeader } from "@/components/brand/page-header";
import { api } from "@/lib/api";
import type { ContentSummary } from "@/lib/api";

export const metadata: Metadata = {
  title: "Blog",
  description: "Practical notes for Nigerian sellers who sell on WhatsApp.",
};

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  let posts: ContentSummary[] = [];
  let failed = false;
  try {
    posts = await api.listContent("blog_post");
  } catch {
    failed = true;
  }

  return (
    <>
      <PageHeader
        eyebrow="Blog"
        title="Notes for WhatsApp sellers"
        lead="Practical ideas for getting paid and staying organised."
        photo={{ description: "seller writing notes beside her phone" }}
      />
      <div className="mx-auto max-w-3xl px-4 pb-16">
        {failed && <ContentUnavailable what="Blog posts" />}
        {!failed && posts.length === 0 && (
          <EmptyState
            title="No posts yet"
            description="We're writing our first stories for WhatsApp sellers. Check back soon."
          >
            <Link
              href="/how-it-works"
              className="text-brand focus-visible:outline-brand inline-flex min-h-11 items-center font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Meanwhile, see how gbam works →
            </Link>
          </EmptyState>
        )}
        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="focus-visible:outline-brand hover:bg-coral-wash block rounded-2xl bg-white p-5 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="text-ink-muted block text-sm">{formatDate(post.publishedAt)}</span>
                <span className="font-display text-ink mt-1 block text-2xl font-bold">
                  {post.title}
                </span>
                {post.summary && <span className="text-ink-muted mt-2 block">{post.summary}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
