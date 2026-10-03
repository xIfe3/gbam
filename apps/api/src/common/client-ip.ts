import type { Request } from "express";

/**
 * The visitor's IP. The API only talks to the Next.js server, so the socket address is
 * always that server; apps/web/lib/api.ts forwards the real visitor IP in `x-client-ip`.
 * Accepted risk (controller ruling R9): the API is publicly reachable (Paystack/Meta
 * webhooks), so a direct caller could spoof this header and dodge or misdirect IP limits.
 */
export function clientIp(req: Request): string {
  const header = req.headers["x-client-ip"];
  if (typeof header === "string" && header.trim() !== "") {
    return header.trim();
  }
  const remote = req.socket?.remoteAddress;
  if (remote) {
    return remote;
  }
  return "unknown";
}
