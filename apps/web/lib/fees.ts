import { formatNaira, PLATFORM_FEE } from "@gbam/shared";
import { getPlatformInfo } from "./platform-info";

// The DEFAULT fee text. Pages that show the fee use liveFees() below, so a change in
// Admin → Settings shows up without a deploy.
// 150 basis points = 1.5%, so divide by 100 for the percent we show.
export const platformFeePercent = PLATFORM_FEE.percentBasisPoints / 100;

// e.g. "₦1,000"
export const platformFeeCap = formatNaira(PLATFORM_FEE.capKobo);

export type LiveFees = {
  /** e.g. 1.5 */
  percent: number;
  /** e.g. "₦1,000" */
  cap: string;
  rates: { percentBasisPoints: number; capKobo: number };
};

/** Gbam's fee as set in Admin → Settings, or the defaults if the API can't be reached. */
export async function liveFees(): Promise<LiveFees> {
  const info = await getPlatformInfo();
  let rates = {
    percentBasisPoints: PLATFORM_FEE.percentBasisPoints,
    capKobo: PLATFORM_FEE.capKobo,
  };
  if (info !== null) {
    rates = { percentBasisPoints: info.feePercentBasisPoints, capKobo: info.feeCapKobo };
  }
  return { percent: rates.percentBasisPoints / 100, cap: formatNaira(rates.capKobo), rates };
}
