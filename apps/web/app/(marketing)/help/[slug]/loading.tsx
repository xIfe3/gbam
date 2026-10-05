import { ArticleSkeleton } from "@/components/brand/skeleton";

/** Shown instantly while this page's content loads from the API. */
export default function Loading() {
  return <ArticleSkeleton label="Loading the article…" />;
}
