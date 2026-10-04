import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentUnavailable, formatDate } from "../../content-unavailable";
import { CtaBand } from "@/components/brand/cta-band";
import { Prose } from "@/components/brand/prose";
import { ApiError, api } from "@/lib/api";
import type { ContentEntryDto } from "@/lib/api";

export const dynamic = "force-dynamic";

type Loaded = { entry: ContentEntryDto | null; failed: boolean };

// 404 from the API means "no such post"; any other error means the API is down.
async function load(slug: string): Promise<Loaded> {
  try {
    const entry = await api.getContent("blog_post", slug);
    return { entry, failed: false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return { entry: null, failed: true };
  }
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { entry } = await load(slug);
  if (!entry) {
    return { title: "Blog" };
  }
  const metadata: Metadata = { title: entry.title };
  if (entry.summary) {
    metadata.description = entry.summary;
  }
  return metadata;
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const { entry, failed } = await load(slug);

  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/blog"
          className="text-brand focus-visible:outline-brand inline-flex min-h-11 items-center text-sm font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Back to blog
        </Link>
        {failed && <ContentUnavailable what="This post" />}
        {entry && (
          <>
            <p className="text-ink-muted mt-4 text-sm">{formatDate(entry.publishedAt)}</p>
            <h1 className="font-display text-ink mt-2 mb-6 text-4xl leading-tight font-black">
              {entry.title}
            </h1>
            <Prose markdown={entry.body} />
          </>
        )}
      </article>
      <CtaBand />
    </>
  );
}
