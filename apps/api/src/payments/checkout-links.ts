/**
 * Paystack's checkout link looks like https://checkout.paystack.com/<access code>. The
 * pop-up on our /pay page needs just that access code ("resume this transaction"), so we
 * read it from the link we already saved, instead of storing it twice. Anything that isn't
 * a Paystack checkout link (the test fakes, a future format) gives null, and the page then
 * falls back to opening the link itself.
 */
export function accessCodeFrom(checkoutUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(checkoutUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com") {
    return null;
  }
  // "/0peioxfhpn" → ["", "0peioxfhpn"]: exactly one non-empty part after the slash.
  const parts = url.pathname.split("/");
  if (parts.length !== 2) {
    return null;
  }
  const code = parts[1];
  if (code === undefined || code === "") {
    return null;
  }
  return code;
}

/**
 * The link we send customers to pay: our own "review & pay" page, which shows the order
 * before opening Paystack. The private key never goes to Paystack, only to the customer.
 */
export function payPageUrl(webUrl: string, code: string, trackingKey: string): string {
  return `${webUrl}/pay/${code}?k=${trackingKey}`;
}
