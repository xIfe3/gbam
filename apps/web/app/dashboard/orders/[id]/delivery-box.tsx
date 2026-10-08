import type { OrderDelivery } from "@/lib/api";
import { CopyLinkButton } from "../../copy-link-button";

/**
 * Where the order goes: the zone, the address and landmark, and a button that copies them
 * for sending to a rider. Orders placed before delivery existed show nothing.
 */
export function DeliveryBox({ order }: { order: OrderDelivery }) {
  const zoneName = order.deliveryZoneName ?? null;
  const address = order.deliveryAddress ?? null;
  const landmark = order.deliveryLandmark ?? null;
  const isPickup = order.deliveryIsPickup === true;

  if (zoneName === null && address === null && !isPickup) {
    return null;
  }

  // What "Copy address" puts on the clipboard: the address, then the landmark on its own line.
  let copyText = "";
  if (address !== null) {
    copyText = address;
    if (landmark !== null) {
      copyText = `${address}\n${landmark}`;
    }
  }

  return (
    <section
      aria-labelledby="delivery-heading"
      className="rounded-xl border border-zinc-200 bg-white p-5"
    >
      <h2 id="delivery-heading" className="mb-2 font-semibold">
        Delivery
      </h2>
      {zoneName !== null && <p className="text-sm text-zinc-600">{zoneName}</p>}
      {isPickup && <p className="mt-1">Customer will pick up</p>}
      {address !== null && (
        <div className="mt-1 space-y-1">
          <p>{address}</p>
          {landmark !== null && <p className="text-sm text-zinc-600">{landmark}</p>}
          <CopyLinkButton url={copyText} label="Copy address" />
        </div>
      )}
    </section>
  );
}
