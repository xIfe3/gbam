import { ImagePlus } from "lucide-react";
import Link from "next/link";

/**
 * Shown on the orders page while the shop has no banner photo. A real photo of the food or
 * clothes makes a shop look trusted at a glance; without one, the banner shows the shop's
 * product photos or a plain gbam one.
 */
export function BannerPhotoTip() {
  return (
    <aside
      aria-label="Banner photo"
      className="border-brand-tint mb-5 flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-ink flex items-start gap-2 text-sm font-medium">
        <ImagePlus size={18} className="text-brand-hover mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Add a photo of your best items as your shop banner. A real photo makes customers trust
          your shop.
        </span>
      </p>
      <Link
        href="/dashboard/settings#look"
        className="text-brand focus-visible:outline-brand inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-current px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Add a banner photo
      </Link>
    </aside>
  );
}
