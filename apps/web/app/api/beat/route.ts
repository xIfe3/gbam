import { apiUrl, visitorIp } from "@/lib/api";

/** A beat is a few short fields; anything bigger isn't a real beat. */
const MAX_BODY = 1_000;

/**
 * The page beacon's way in. Browsers can't reach the API directly, so this passes the beat on
 * (with the visitor's IP, for the API's rate limit only). It always answers 204: a beacon
 * never shows an error, whatever happens.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length > MAX_BODY) {
    return new Response(null, { status: 204 });
  }

  const headers = new Headers({ "content-type": "application/json" });
  const userAgent = request.headers.get("user-agent");
  if (userAgent) {
    headers.set("user-agent", userAgent);
  }
  const ip = await visitorIp();
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (ip && internalSecret) {
    headers.set("x-client-ip", ip);
    headers.set("x-internal-secret", internalSecret);
  }

  try {
    await fetch(`${apiUrl()}/beat`, {
      method: "POST",
      body,
      headers,
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // The API is down or slow: the beat is lost, which is fine.
  }
  return new Response(null, { status: 204 });
}
