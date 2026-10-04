import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";

/** True if `given` equals `expected`, compared in constant time so timing leaks nothing. */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual needs equal lengths; a different length is simply "no match".
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * The visitor's IP, used for rate limits.
 *
 * The browser never calls the API; apps/web does, server-side, and forwards the real
 * visitor IP in `x-client-ip`. But the API is also publicly reachable (Paystack/Meta
 * webhooks), so anyone could send that header and dodge or misdirect IP limits. So we
 * believe `x-client-ip` only when the request also carries `x-internal-secret` equal to
 * INTERNAL_API_SECRET, which only apps/web knows. Otherwise we use the socket address.
 *
 * `internalSecret` is env.INTERNAL_API_SECRET; when it is unset the header is never trusted.
 */
export function clientIp(req: Request, internalSecret: string | undefined): string {
  const header = req.headers["x-client-ip"];
  const given = req.headers["x-internal-secret"];
  const trusted =
    internalSecret !== undefined &&
    internalSecret !== "" &&
    typeof given === "string" &&
    secretMatches(given, internalSecret);
  if (trusted && typeof header === "string" && header.trim() !== "") {
    return header.trim();
  }
  const remote = req.socket?.remoteAddress;
  if (remote) {
    return remote;
  }
  return "unknown";
}
