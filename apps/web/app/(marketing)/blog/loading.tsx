import { ListSkeleton } from "@/components/brand/skeleton";

/** Shown instantly while this page's content loads from the API. */
export default function Loading() {
  return <ListSkeleton label="Loading the blog…" />;
}
