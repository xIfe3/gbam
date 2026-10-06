/* eslint-disable @next/next/no-img-element -- photos are small static files chosen later */
type PhotoProps = {
  description: string;
  src?: string;
  alt?: string;
  className?: string;
};

// A people-photo slot. Until a real photo is chosen (no `src`) it shows a branded striped
// placeholder with the description, so the page never has a broken image.
export function Photo({ description, src, alt, className = "" }: PhotoProps) {
  if (src) {
    return (
      <img src={src} alt={alt ?? description} className={`rounded-3xl object-cover ${className}`} />
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
