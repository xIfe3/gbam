import { createHash, randomBytes, randomInt } from "node:crypto";
import { Algorithm, hash, verify } from "@node-rs/argon2";

// Argon2id is the current recommended password hash: it is deliberately slow and
// memory-hungry, so guessing passwords from a stolen database is very expensive. We name
// the algorithm explicitly and keep the library's cost defaults (19 MiB memory, 2 passes,
// 1 thread, which is the OWASP minimum). The hash string embeds its own random salt and
// parameters, so verify() needs nothing else and the parameters can be raised later.
const ARGON2_OPTIONS = { algorithm: Algorithm.Argon2id };

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    // The library compares in constant time, so timing does not leak how close a guess was.
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash must read as "wrong password", never as a server error.
    return false;
  }
}

/**
 * A session token is 32 random bytes (256 bits), base64url so it is safe in a cookie.
 * Only its SHA-256 hash is stored (see hashToken), so a leaked database cannot be used to
 * log in as anyone.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 hex of a token or code. Fast hashing is fine here because the inputs are
 * random, unlike passwords, which people choose and can be guessed. Looking a token up
 * by this hash with a normal DB equality check is safe.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A 6-digit email code from a cryptographically secure source, zero-padded ("004217"). */
export function newEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
