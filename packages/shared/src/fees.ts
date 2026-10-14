/**
 * gbam's pricing. These are the DEFAULTS: the live values are in Admin → Settings.
 *
 * Money is in kobo (₦1 = 100 kobo). Percentages are in "basis points" so we never use
 * decimals: 100 basis points = 1%, so 150 = 1.5%.
 */
export const PLATFORM_FEE = {
  /** gbam's cut of each paid order: 150 basis points = 1.5%. */
  percentBasisPoints: 150,
  /** Never take more than this per order: 100_000 kobo = ₦1,000. */
  capKobo: 100_000,
};

/**
 * gbam's fee for one order, in kobo.
 *
 * `feeWaivedUntil` is the "founding seller" offer: until that date, the seller pays no
 * gbam fee. null means no waiver.
 */
export function calculatePlatformFee(
  totalKobo: number,
  feeWaivedUntil: Date | null,
  now: Date = new Date(),
  /** The current rates from Admin → Settings; PLATFORM_FEE (the defaults) when not given. */
  rates: { percentBasisPoints: number; capKobo: number } = PLATFORM_FEE,
): number {
  if (feeWaivedUntil !== null && now < feeWaivedUntil) {
    return 0;
  }

  // e.g. ₦10,000 = 1,000,000 kobo × 150 / 10,000 = 15,000 kobo = ₦150.
  // Math.round because kobo must be a whole number.
  const fee = Math.round((totalKobo * rates.percentBasisPoints) / 10_000);

  if (fee > rates.capKobo) {
    return rates.capKobo;
  }
  return fee;
}

/**
 * ESTIMATE of Paystack's fee for a local Nigerian payment, used only for display and by
 * the fake Paystack. The real fee comes back from Paystack after payment and is stored
 * on the payment. Check https://paystack.com/pricing; update these if Paystack changes.
 *
 * Rule: 1.5% + ₦100, the ₦100 is waived under ₦2,500, and the total is capped at ₦2,000.
 */
export function estimatePaystackFee(totalKobo: number): number {
  let fee = Math.round((totalKobo * 150) / 10_000);
  if (totalKobo >= 250_000) {
    fee = fee + 10_000;
  }
  if (fee > 200_000) {
    fee = 200_000;
  }
  return fee;
}

/**
 * When a seller's money reaches their bank. Paystack, not gbam, pays sellers out, on its own
 * schedule (for Nigerian accounts: the next working day). Shown wherever a seller sees a
 * payment, so "paid" never looks like "missing money".
 */
export const PAYOUT_TIMING =
  "Paystack sends your share to your bank account the next working day after the customer pays.";
