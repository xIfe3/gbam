/* eslint-disable @next/next/no-img-element -- photos are small static files chosen later */
type PhotoProps = {
  description: string;
  src?: string;
  alt?: string;
  className?: string;
  /** True for a photo at the top of the page: load it straight away instead of lazily. */
  priority?: boolean;
};

// A people-photo slot. Until a real photo is chosen (no `src`) it shows a branded striped
// placeholder with the description, so the page never has a broken image.
export function Photo({ description, src, alt, className = "", priority = false }: PhotoProps) {
  if (src) {
    // lazy: photos further down the page only download when they're about to be seen.
    // A photo at the top is needed at once, so it skips the wait and is fetched first.
    let loading: "lazy" | "eager" = "lazy";
    let fetchPriority: "high" | "auto" = "auto";
    if (priority) {
      loading = "eager";
      fetchPriority = "high";
    }
    return (
      <img
        src={src}
        alt={alt ?? description}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        className={`rounded-3xl object-cover ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={description}
      className={`bg-coral-wash text-ink-muted flex items-center justify-center rounded-3xl border border-dashed border-coral-tint p-3 text-center text-xs ${className}`}
    >
      <span aria-hidden="true">{description}</span>
    </div>
  );
}
