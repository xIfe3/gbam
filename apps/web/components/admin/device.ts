/**
 * "Chrome on Android" from a browser's user-agent text. Good enough to spot a strange
 * device; not a full parser.
 */
export function deviceName(userAgent: string | null): string {
  if (!userAgent) {
    return "Unknown device";
  }
  let browser = "Browser";
  if (userAgent.includes("Edg/")) {
    browser = "Edge";
  } else if (userAgent.includes("OPR/") || userAgent.includes("Opera")) {
    browser = "Opera";
  } else if (userAgent.includes("Chrome/")) {
    browser = "Chrome";
  } else if (userAgent.includes("Firefox/")) {
    browser = "Firefox";
  } else if (userAgent.includes("Safari/")) {
    browser = "Safari";
  }

  let system = "";
  if (userAgent.includes("Android")) {
    system = "Android";
  } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    system = "iPhone";
  } else if (userAgent.includes("Windows")) {
    system = "Windows";
  } else if (userAgent.includes("Mac OS")) {
    system = "Mac";
  } else if (userAgent.includes("Linux")) {
    system = "Linux";
  }
  if (system === "") {
    return browser;
  }
  return `${browser} on ${system}`;
}

/** "102.89.x.x": enough to tell roughly where, without showing the full address on screen. */
export function shortIp(ip: string | null): string {
  if (!ip) {
    return "—";
  }
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  // IPv6: keep the first two groups.
  const groups = ip.split(":");
  if (groups.length > 2) {
    return `${groups[0]}:${groups[1]}:…`;
  }
  return ip;
}
