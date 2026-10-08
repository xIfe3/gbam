import { formatNaira } from "@gbam/shared";

type Props = {
  /** Items only. Missing on orders placed before delivery fees existed. */
  subtotalKobo?: number;
  deliveryFeeKobo?: number;
  /** The delivery zone's name, or null/undefined when the order has no zone. */
  deliveryLabel: string | null | undefined;
  totalKobo: number;
  /** Classes for the Total line, so each page keeps its own look. */
  totalClassName?: string;
};

/**
 * "Items · Delivery (Lekki) · Total" under an order's item list. An order with no delivery
 * zone (including every order placed before delivery existed) shows just the total.
 */
export function OrderTotals({
  subtotalKobo,
  deliveryFeeKobo,
  deliveryLabel,
  totalKobo,
  totalClassName = "text-ink mt-3 flex justify-between text-lg font-black",
}: Props) {
  let fee = 0;
  if (deliveryFeeKobo !== undefined) {
    fee = deliveryFeeKobo;
  }
  const hasDelivery = (deliveryLabel !== null && deliveryLabel !== undefined) || fee > 0;

  let feeText = formatNaira(fee);
  if (fee === 0) {
    feeText = "Free";
  }
  let deliveryText = "Delivery";
  if (deliveryLabel) {
    deliveryText = `Delivery (${deliveryLabel})`;
  }
  // Older orders have no subtotal: the total was all items.
  let itemsKobo = totalKobo - fee;
  if (subtotalKobo !== undefined) {
    itemsKobo = subtotalKobo;
  }

  return (
    <div>
      {hasDelivery && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="flex justify-between">
            <span>Items</span>
            <span className="tabular-nums">{formatNaira(itemsKobo)}</span>
          </p>
          <p className="flex justify-between">
            <span>{deliveryText}</span>
            <span className="tabular-nums">{feeText}</span>
          </p>
        </div>
      )}
      <p className={totalClassName}>
        <span>Total</span>
        <span className="tabular-nums">{formatNaira(totalKobo)}</span>
      </p>
    </div>
  );
}
