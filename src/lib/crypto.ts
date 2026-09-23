import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Password and token hashing.
 *
 * Two different problems, two different tools:
 *
 *   • Passwords must be *slow* to verify so a stolen hash is expensive to
 *     crack. bcrypt with a tuned cost factor.
 *   • Session tokens are already high-entropy random values, so they only need
 *     a cheap one-way function. Fast hashing keeps every authenticated request
 *     from paying a 100ms bcrypt cost.
 */

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // A malformed stored hash must read as "wrong password", never as a crash.
    return false;
  }
}

/** 256 bits of entropy, URL-safe. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison for values that are not already hashed. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * A password policy that is meaningful without being hostile.
 *
 * Length is the dominant factor in password strength, so the rule is a
 * minimum length plus a check against the obvious cases. Composition rules
 * ("one symbol, one digit") push users toward predictable patterns like
 * `Password1!` while making good passphrases fail — so they are not used.
 */
export type PasswordCheck = { ok: true } | { ok: false; message: string };

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789",
  "qwerty123", "iloveyou", "admin123", "letmein", "welcome1",
  "password1234", "qwertyuiop", "1q2w3e4r", "abcd1234",
]);

export function checkPasswordStrength(password: string): PasswordCheck {
  if (password.length < 10) {
    return { ok: false, message: "Kata sandi minimal 10 karakter." };
  }
  if (password.length > 200) {
    return { ok: false, message: "Kata sandi maksimal 200 karakter." };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, message: "Kata sandi ini terlalu umum. Pilih yang lain." };
  }
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, message: "Kata sandi tidak boleh satu karakter yang diulang." };
  }
  return { ok: true };
}
