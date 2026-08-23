import crypto from "crypto";

const SCRYPT_OPTS: crypto.ScryptOptions = { N: 16384, r: 8, p: 1 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_OPTS);
  return `s1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [version, saltHex, hashHex] = stored.split("$");
  if (version !== "s1" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, SCRYPT_OPTS);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
