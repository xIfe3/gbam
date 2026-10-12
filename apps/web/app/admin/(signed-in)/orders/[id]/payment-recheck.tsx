import { ActionButton } from "@/components/admin/action-forms";
import { recheckPaymentAction } from "../../admin-actions";

/**
 * "Re-check with Paystack", shown while the order has a payment we haven't heard back about
 * (status "pending"). For when a customer says "I paid" and the webhook may have gone missing.
 */
export function PaymentRecheck({
  orderId,
  payments,
}: {
  orderId: string;
  payments: { status: string }[];
}) {
  let hasUnconfirmed = false;
  for (const payment of payments) {
    if (payment.status === "pending") {
      hasUnconfirmed = true;
    }
  }
  if (!hasUnconfirmed) {
    return null;
  }
  return (
    <div className="mt-3">
      <ActionButton
        action={recheckPaymentAction.bind(null, orderId)}
        label="Re-check with Paystack"
      />
    </div>
  );
}
