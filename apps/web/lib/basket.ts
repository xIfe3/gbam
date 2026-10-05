/** One line in the customer's basket. Task 10 adds the storage around this type. */
export type BasketLine = {
  variantId: string;
  productSlug: string;
  productName: string;
  variantTitle: string;
  priceKobo: number;
  photoUrl: string | null;
  quantity: number;
};
