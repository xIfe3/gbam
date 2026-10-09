import { unstable_rethrow } from "next/navigation";
import { ApiError } from "@/lib/api";

/** One labelled number on a report page. Use inside a <dl>. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className="font-display text-ink text-2xl font-black">{value}</dd>
    </div>
  );
}

/**
 * The message for a range the API refused ("The start date must be on or before the end
 * date"), or the error thrown again for anything else (the error page handles those).
 */
export function rangeProblem(error: unknown): string {
  // Next.js uses thrown errors for redirects; those must carry on, not be shown here.
  unstable_rethrow(error);
  if (error instanceof ApiError && error.status === 400) {
    const body = error.body;
    if (typeof body === "object" && body !== null && "message" in body) {
      const message = body.message;
      if (typeof message === "string") {
        return message;
      }
    }
    return "That range doesn't work. Pick another.";
  }
  throw error;
}
