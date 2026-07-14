import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { generateSecret, generateSync, verifySync, generateURI } from "otplib";
import bcrypt from "bcryptjs";

const DEV_FALLBACK_KEY = "0".repeat(64);

function getEncryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY ?? DEV_FALLBACK_KEY;
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), enc.toString("hex"), tag.toString("hex")].join(".");
}

export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, encHex, tagHex] = ciphertext.split(".");
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final("utf8");
}

export function generateTotpSecret(): string {
  return generateSecret({ length: 20 });
}

export function generateOtpAuthUri(secret: string, email: string): string {
  return generateURI({
    issuer: "Control HUB",
    label: email,
    secret,
    strategy: "totp",
  });
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return verifySync({ secret, token, strategy: "totp" }) as unknown as boolean;
  } catch {
    return false;
  }
}

export async function generateRecoveryCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = randomBytes(5).toString("hex").toUpperCase();
    const formatted = `${code.slice(0, 5)}-${code.slice(5)}`;
    plain.push(formatted);
    hashed.push(await bcrypt.hash(formatted, 10));
  }
  return { plain, hashed };
}

export async function verifyRecoveryCode(
  code: string,
  hashes: (string | null)[]
): Promise<number> {
  for (let i = 0; i < hashes.length; i++) {
    const h = hashes[i];
    if (h === null) continue;
    if (await bcrypt.compare(code.toUpperCase(), h)) return i;
  }
  return -1;
}

export function checkMfaRequired(
  userRole: string,
  mfaRequired: boolean,
  enforcementMode: string
): boolean {
  if (mfaRequired) return true;
  if (enforcementMode === "disabled") return false;
  if (enforcementMode === "all_users") return true;
  const privilegedRoles = ["admin", "compliance_manager", "reviewer"];
  if (enforcementMode === "privileged" && privilegedRoles.includes(userRole)) return true;
  if (enforcementMode === "admins_only" && userRole === "admin") return true;
  return false;
}

export function checkStartup(): void {
  if (process.env.NODE_ENV === "production" && !process.env.MFA_ENCRYPTION_KEY) {
    process.stderr.write(
      "FATAL: MFA_ENCRYPTION_KEY environment variable is required in production.\n"
    );
    process.exit(1);
  }
}
