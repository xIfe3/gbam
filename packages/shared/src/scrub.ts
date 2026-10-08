/**
 * Removes personal details from text before it leaves our servers (for example in an error
 * report sent to Sentry). Error messages sometimes contain whatever data caused them, and
 * customers' emails, phone numbers and private tracking links must never end up there.
 */

// Patterns ("regular expressions"). The "g" flag means "replace every match, not just the first".
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 10 to 15 digits in a row, optionally starting with "+": phone numbers like 2348031234567.
const PHONE = /\+?\d{10,15}/g;
// The secret key in a tracking link: ".../track/GB-7K3Q?k=abc123".
const TRACKING_KEY = /([?&]k=)[A-Za-z0-9_-]+/g;

export function scrubText(text: string): string {
  const noEmails = text.replace(EMAIL, "[email]");
  const noPhones = noEmails.replace(PHONE, "[phone]");
  // "$1" puts back the first bracketed part of the pattern (the "?k=" itself).
  const noKeys = noPhones.replace(TRACKING_KEY, "$1[key]");
  return noKeys;
}
