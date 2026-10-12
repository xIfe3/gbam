/** The cookie that remembers where a visitor first came from (e.g. ?ref=shop-mama-ngozi). */
export const SIGNUP_SOURCE_COOKIE = "gbam_ref";

const MAX_SOURCE_LENGTH = 60;

/**
 * Where a new seller came from, made safe to store: lowercase letters, digits and - _ . :
 * only, at most 60 characters. Anyone can type anything into a ?ref= link, so everything else
 * is dropped. null = nothing usable.
 */
export function cleanSignupSource(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const lower = raw.toLowerCase();
  let kept = "";
  for (const character of lower) {
    if (/[a-z0-9_.:-]/.test(character)) {
      kept = kept + character;
    }
  }
  if (kept === "") {
    return null;
  }
  return kept.slice(0, MAX_SOURCE_LENGTH);
}
