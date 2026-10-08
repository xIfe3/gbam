import { PauseCircle } from "lucide-react";

/** Shown on every dashboard page while Gbam has paused (suspended) the shop. */
export function SuspendedBanner() {
  return (
    <aside
      aria-label="Shop paused"
      className="bg-coral-wash border-coral-tint mb-6 rounded-lg border p-4"
    >
      <p className="text-ink flex items-start gap-2 text-sm font-medium">
        <PauseCircle size={18} className="text-coral-deep mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Your shop is paused: customers can&apos;t order or pay for now. Orders already paid can
          still be delivered and refunded. To find out why, email{" "}
          <a href="mailto:support@gbam.app" className="font-bold underline">
            support@gbam.app
          </a>
          .
        </span>
      </p>
    </aside>
  );
}
