import { isStaging } from "@/lib/app-env";

/** A strip across the top of every page on the staging copy, so nobody mistakes it for live. */
export function StagingBanner() {
  if (!isStaging()) {
    return null;
  }
  return (
    <div role="status" className="bg-ink px-4 py-2 text-center text-sm font-bold text-white">
      Staging: test copy of Gbam. Payments are in test mode and nothing here is real.
    </div>
  );
}
