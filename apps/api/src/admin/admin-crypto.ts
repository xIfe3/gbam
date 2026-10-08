/**
 * The cryptography behind admin sign-in, using only Node's built-in `crypto`.
 *
 * TOTP ("time-based one-time password", RFC 6238) is what authenticator apps like Google
 * Authenticator do: the app and the server share a secret, and every 30 seconds both turn
 * "secret + current time" into the same 6-digit code. A stolen password alone isn't enough.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
/** Base32: the alphabet authenticator apps use for secrets (A–Z and 2–7). */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits = bits + 8;
    while (bits >= 5) {
      output = output + BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits = bits - 5;
    }
  }
  if (bits > 0) {
    output = output + BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(text: string): Buffer {
  const cleaned = text.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error("Not a base32 secret");
    }
    value = (value << 5) | index;
    bits = bits + 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits = bits - 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random secret for an authenticator app (20 bytes, base32). */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Which 30-second window a moment falls in. */
export function currentStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/** The 6-digit code for one 30-second window (RFC 6238 with SHA-1, as the apps use). */
export function totpCode(secret: string, step: number): string {
  // The step number as 8 bytes, big-endian.
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  // "Dynamic truncation" from the RFC: the last 4 bits pick where to read 4 bytes from.
  const lastByte = hash[hash.length - 1];
  if (lastByte === undefined) {
    throw new Error("Empty hash");
  }
  const offset = lastByte & 15;
  const number = hash.readUInt32BE(offset) & 0x7fffffff;
  const code = number % 10 ** DIGITS;
  return String(code).padStart(DIGITS, "0");
}

/**
 * Checks a code against the current window and one either side (phones' clocks drift a
 * little). Returns the window it matched, or null. `lastUsedStep` is the window of the last
 * code that worked: that code, or an older one, is refused so it can't be used twice.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): number | null {
  const step = currentStep(nowMs);
  for (const candidate of [step - 1, step, step + 1]) {
    if (lastUsedStep !== null && candidate <= lastUsedStep) {
      continue;
    }
    if (totpCode(secret, candidate) === code) {
      return candidate;
    }
  }
  return null;
}

/** The link inside the QR code that authenticator apps scan. */
export function otpauthUrl(secret: string, email: string): string {
  const label = encodeURIComponent(`Gbam Admin:${email}`).replace("%3A", ":");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("Gbam Admin")}`;
}

/**
 * Encrypts an authenticator secret before it's stored, with AES-256-GCM and a key that lives
 * only in the environment (ADMIN_TOTP_KEY). A copy of the database alone can't make codes.
 * GCM also detects tampering: decrypting with the wrong key, or altered data, throws.
 * The result is "iv.tag.ciphertext", each part base64url.
 */
export function encryptSecret(plain: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(encrypted: string, keyBase64: string): string {
  const parts = encrypted.split(".");
  const [ivText, tagText, dataText] = parts;
  if (parts.length !== 3 || !ivText || !tagText || !dataText) {
    throw new Error("Not an encrypted secret");
  }
  const key = Buffer.from(keyBase64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataText, "base64url")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

/** 10 one-time backup codes like "a1b2-c3d4", for when an admin loses their phone. */
export function newBackupCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < 10) {
    const hex = randomBytes(4).toString("hex");
    codes.add(`${hex.slice(0, 4)}-${hex.slice(4)}`);
  }
  return Array.from(codes);
}
