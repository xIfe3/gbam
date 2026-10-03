import { formatNaira, PLATFORM_FEE } from "@gbam/shared";

// 150 basis points = 1.5%, so divide by 100 for the percent we show.
export const platformFeePercent = PLATFORM_FEE.percentBasisPoints / 100;

// e.g. "₦1,000"
export const platformFeeCap = formatNaira(PLATFORM_FEE.capKobo);
