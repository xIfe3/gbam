import type { OrderStatus } from "@gbam/shared";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/order-labels";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
