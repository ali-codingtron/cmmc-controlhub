import crypto from "crypto";

export const RESET_TOKEN_EXPIRY_MINUTES = 30;
export const RESET_TOKEN_RATE_LIMIT = 5;
export const RESET_TOKEN_RATE_WINDOW_MS = 60 * 60 * 1000;

export function generateResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipAttempts = new Map<string, RateLimitEntry>();
const emailAttempts = new Map<string, RateLimitEntry>();

export function checkForgotPasswordRateLimit(ip: string, email: string): boolean {
  const now = Date.now();

  const ipEntry = ipAttempts.get(ip);
  if (ipEntry && ipEntry.resetAt > now && ipEntry.count >= RESET_TOKEN_RATE_LIMIT) {
    return false;
  }

  const emailEntry = emailAttempts.get(email);
  if (emailEntry && emailEntry.resetAt > now && emailEntry.count >= RESET_TOKEN_RATE_LIMIT) {
    return false;
  }

  if (!ipEntry || ipEntry.resetAt <= now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + RESET_TOKEN_RATE_WINDOW_MS });
  } else {
    ipEntry.count++;
  }

  if (!emailEntry || emailEntry.resetAt <= now) {
    emailAttempts.set(email, { count: 1, resetAt: now + RESET_TOKEN_RATE_WINDOW_MS });
  } else {
    emailEntry.count++;
  }

  return true;
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one digit";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character";
  return null;
}
