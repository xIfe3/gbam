// Shown when the content API cannot be reached, instead of crashing the page.
export function ContentUnavailable({ what }: { what: string }) {
  return (
    <div role="alert" className="bg-coral-wash text-ink rounded-2xl p-6">
      <p className="font-bold">{what} couldn&apos;t load, please try again.</p>
      <p className="text-ink-muted mt-1 text-sm">
        If it keeps happening, email support@gbam.app.
      </p>
    </div>
  );
}

// "3 October 2026" from an ISO date string.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
