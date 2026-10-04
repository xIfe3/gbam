/**
 * Working out the visitor's IP address from proxy headers, for per-IP rate limits.
 *
 * X-Forwarded-For is a comma-separated list. Each proxy APPENDS the address it received
 * the request from, so the list reads "what the visitor claimed, ..., what our proxy saw".
 * The visitor controls everything they send, including a fake X-Forwarded-For, so the
 * LEFT-most entries can't be trusted. Only the entries added by our own proxies can: with
 * one trusted proxy that is the right-most entry, with two it is the second from the right.
 */

type VisitorIpInput = {
  /** X-Real-IP, which a trusted proxy sets (replacing anything the visitor sent). */
  realIp: string | null;
  forwardedFor: string | null;
  /** How many trusted proxies sit in front of the web app (TRUSTED_PROXY_HOPS). */
  hops: number;
};

/** Returns the visitor's IP, or undefined when the headers don't tell us. */
export function pickVisitorIp(input: VisitorIpInput): string | undefined {
  if (input.realIp !== null) {
    const real = input.realIp.trim();
    if (real !== "") {
      return real;
    }
  }

  if (input.forwardedFor === null) {
    return undefined;
  }
  const entries: string[] = [];
  for (const part of input.forwardedFor.split(",")) {
    const entry = part.trim();
    if (entry !== "") {
      entries.push(entry);
    }
  }
  // Fewer entries than trusted proxies: the request didn't come through all of them, so
  // nothing in the list is trustworthy.
  const index = entries.length - input.hops;
  if (index < 0) {
    return undefined;
  }
  return entries[index];
}

/**
 * Reads TRUSTED_PROXY_HOPS: a whole number of at least 1, default 1. Anything else throws,
 * so a typo can't silently make us trust a visitor-supplied entry.
 */
export function trustedProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return 1;
  }
  const text = raw.trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`TRUSTED_PROXY_HOPS must be a whole number of at least 1, got "${raw}"`);
  }
  const hops = Number(text);
  if (hops < 1) {
    throw new Error(`TRUSTED_PROXY_HOPS must be a whole number of at least 1, got "${raw}"`);
  }
  return hops;
}
