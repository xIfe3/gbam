/** 350000 kobo → "₦3,500". Kobo shown only when non-zero: 350050 → "₦3,500.50". */
export function formatNaira(kobo: number): string {
  const hasKobo = kobo % 100 !== 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: hasKobo ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
}

/**
 * Accepts how Nigerians actually type numbers and returns WhatsApp's format.
 * "0803 123 4567" | "+234 803 123 4567" | "2348031234567" → "2348031234567".
 * Returns null if it doesn't look like a Nigerian mobile number.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()+]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (/^0[789]\d{9}$/.test(digits)) return `234${digits.slice(1)}`;
  if (/^234[789]\d{9}$/.test(digits)) return digits;
  if (/^[789]\d{9}$/.test(digits)) return `234${digits}`;
  return null;
}
