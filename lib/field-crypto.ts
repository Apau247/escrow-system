import crypto from "crypto";
import fs from "fs";
import path from "path";
import { dataDir } from "./storage";

let keyCache: Buffer | null = null;

/**
 * Atomically create-or-load a shared hex key file.
 * Uses the exclusive 'wx' flag so concurrent processes (Next.js dev workers)
 * can never overwrite each other's key — first writer wins, everyone reads it.
 */
export function readOrCreateHexKey(file: string, byteLength: number): string {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
    const value = crypto.randomBytes(byteLength).toString("hex");
    try {
      fs.writeFileSync(file, value, { mode: 0o600, flag: "wx" });
      return value;
    } catch (e2: any) {
      if (e2.code === "EEXIST") return fs.readFileSync(file, "utf8").trim();
      throw e2;
    }
  }
}

function masterKey(): Buffer {
  if (keyCache) return keyCache;
  // Explicit env override keeps data decryptable across serverless instances.
  const envKey = process.env.FIELD_ENCRYPTION_KEY;
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    keyCache = Buffer.from(envKey, "hex");
    return keyCache;
  }
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  keyCache = Buffer.from(readOrCreateHexKey(path.join(dir, "field.key"), 32), "hex");
  return keyCache;
}

/** AES-256-GCM field-level encryption. Output: v1.iv.tag.ciphertext (base64url parts). */
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function decryptField(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1") throw new Error("Unsupported ciphertext version");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
