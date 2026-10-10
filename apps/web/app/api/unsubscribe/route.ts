import { apiUrl } from "@/lib/api";

/**
 * One-click unsubscribe (RFC 8058). Gmail, Apple Mail and others show their own "Unsubscribe"
 * button for announcement emails; pressing it posts here, to the address in the email's
 * List-Unsubscribe header, with the seller and signed token in the link. No page, no cookies.
 */
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sellerId = url.searchParams.get("s");
  const token = url.searchParams.get("t");
  if (!sellerId || !token) {
    return new Response(null, { status: 400 });
  }

  try {
    const res = await fetch(`${apiUrl()}/email/unsubscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ s: sellerId, t: token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      return new Response(null, { status: 400 });
    }
  } catch {
    // The API is down: say so, so the email app can try again later.
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 200 });
}
