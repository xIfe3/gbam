import { TOUR_STEPS, type TourName } from "@gbam/shared";

/**
 * The words for each guided tour. `target` matches a `data-tour="…"` attribute on the page:
 * that element glows while its step is showing. A step whose target isn't on the page
 * (e.g. no orders yet) still shows its text, just without a glow.
 */
/**
 * `waitForTarget`: the part this step explains is on a LATER screen of a multi-screen form
 * (the add-product form). Instead of pointing at nothing, the card waits with a small note
 * until the seller moves the form on and the part appears.
 */
export type TourStep = { title: string; body: string; target: string; waitForTarget?: boolean };

export const TOURS: Record<TourName, TourStep[]> = {
  dashboard: [
    {
      title: "Your orders land here",
      body: "Every order a customer places shows up in this list, newest first.",
      target: "orders",
    },
    {
      title: "Your products",
      body: "The Products tab is what customers can buy: photos, prices, sizes and colours.",
      target: "products-tab",
    },
    {
      title: "Share your shop link",
      body: "Copy your link and paste it in WhatsApp chats or your Status. That's how customers find you.",
      target: "shop-link",
    },
    {
      title: "Add your first product",
      body: "Tap Add product and start with one thing you sell. It takes about a minute.",
      target: "add-product",
    },
  ],
  editor: [
    {
      title: "Add 1 to 4 photos",
      body: "The first photo is the main one customers see. Use the arrows to change the order.",
      target: "photos",
    },
    {
      title: "Name, price and a short description",
      body: "Keep the name short. The description is where you mention material, sizes or how long it takes.",
      target: "details",
    },
    {
      title: "Sizes or colours?",
      body: "Turn on options if it comes in different versions, like Size (S, M, L) or Colour.",
      target: "options",
      waitForTarget: true,
    },
    {
      title: "Each combination has its own price and stock",
      body: "M / Red can cost more than S / Blue. Switch off any combination you don't sell.",
      target: "variants",
      waitForTarget: true,
    },
    {
      title: "Not counting stock? Leave it blank",
      body: "Blank stock means always available. Put a number if you want it to show Sold out at 0.",
      target: "stock",
      waitForTarget: true,
    },
  ],
  order: [
    {
      title: "Request payment",
      body: "This sends the customer a Paystack payment link on WhatsApp.",
      target: "order-actions",
    },
    {
      title: "It turns Paid by itself",
      body: "When the customer pays, the order changes to Paid and you both get a WhatsApp message.",
      target: "order-status",
    },
    {
      title: "Mark it sent",
      body: "When the order is on its way, mark it sent so the customer gets an update.",
      target: "order-actions",
    },
  ],
};

// Keep the words and the shared step counts in step: the API rejects steps past TOUR_STEPS.
for (const name of Object.keys(TOURS) as TourName[]) {
  if (TOURS[name].length !== TOUR_STEPS[name]) {
    throw new Error(
      `Tour "${name}" has ${TOURS[name].length} steps but TOUR_STEPS says ${TOUR_STEPS[name]}`,
    );
  }
}
