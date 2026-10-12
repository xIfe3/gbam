import type { OrderDetail } from "@/lib/api";

type Message = OrderDetail["whatsappMessages"][number];

/** Friendly names for our templates (see WHATSAPP_TEMPLATES in packages/integrations). */
const TEMPLATE_LABEL: Record<string, string> = {
  order_received: "Order received",
  order_payment_request: "Payment link",
  payment_reminder: "Payment reminder",
  payment_received: "Payment confirmed",
  order_out_for_delivery: "On the way",
  order_cancelled: "Cancelled",
  order_refunded: "Refunded",
  // Older names, for messages sent before the templates were renamed.
  gbam_order_received: "Order received",
  gbam_payment_request: "Payment link",
  gbam_order_paid: "Payment confirmed",
  gbam_order_fulfilled: "Ready / sent out",
  gbam_order_delivered: "Delivered",
  gbam_order_cancelled: "Cancelled",
  gbam_order_refunded: "Refunded",
};

/** Like WhatsApp's own ticks: ✓ sent, ✓✓ delivered, blue ✓✓ read. */
const STATUS_DISPLAY: Record<Message["status"], { text: string; className: string }> = {
  accepted: { text: "Sending…", className: "text-zinc-400" },
  sent: { text: "✓ Sent", className: "text-zinc-500" },
  delivered: { text: "✓✓ Delivered", className: "text-zinc-600" },
  read: { text: "✓✓ Read", className: "text-sky-600" },
  failed: { text: "Failed", className: "text-rose-600" },
};

/** What we told the customer on WhatsApp about this order, and whether it arrived. */
export function WhatsAppMessages({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="mb-2 font-semibold">WhatsApp messages</h2>
      <ul className="space-y-2 text-sm">
        {messages.map((message) => {
          let label = message.template;
          const friendly = TEMPLATE_LABEL[message.template];
          if (friendly) {
            label = friendly;
          }
          const status = STATUS_DISPLAY[message.status];

          return (
            <li key={message.id}>
              <div className="flex justify-between gap-4">
                <span>{label}</span>
                <span className={status.className}>{status.text}</span>
              </div>
              {message.status === "failed" && message.errorMessage && (
                <p className="text-xs text-rose-600">
                  {message.errorMessage}
                  {message.errorCode !== null && <> (Meta error {message.errorCode})</>}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
