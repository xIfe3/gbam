import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The token in an announcement's unsubscribe link. It's a signature ("HMAC") of the seller's
 * id made with a secret key only the server knows, so nobody can make a working link for
 * someone else's shop, and no database lookup is needed to check it.
 */
export function unsubscribeToken(sellerId: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(`unsubscribe:${sellerId}`).digest("base64url");
}

/** True if `token` is the right one for this seller. Compared in constant time. */
export function checkUnsubscribeToken(
  sellerId: string,
  token: string,
  signingKey: string,
): boolean {
  const expected = Buffer.from(unsubscribeToken(sellerId, signingKey));
  const given = Buffer.from(token);
  if (given.length !== expected.length) {
    return false;
  }
  // timingSafeEqual takes the same time however many characters match, so the answer's
  // timing can't be used to guess the token one character at a time.
  return timingSafeEqual(given, expected);
}

/**
 * The two unsubscribe addresses an announcement carries: the page with a button (for the
 * link in the email) and the one email apps post to by themselves (List-Unsubscribe).
 */
export function unsubscribeLinks(webUrl: string, sellerId: string, signingKey: string) {
  const params = new URLSearchParams({ s: sellerId, t: unsubscribeToken(sellerId, signingKey) });
  return {
    unsubscribeUrl: `${webUrl}/unsubscribe?${params.toString()}`,
    oneClickUrl: `${webUrl}/api/unsubscribe?${params.toString()}`,
  };
}
