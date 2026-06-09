import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET ?? "cmmc-dev-secret-change-in-prod";

interface MfaStatePayload {
  userId: string;
  purpose: "mfa";
}

export function signMfaStateToken(userId: string): string {
  return jwt.sign({ userId, purpose: "mfa" } satisfies MfaStatePayload, JWT_SECRET, {
    expiresIn: "10m",
  });
}

export function verifyMfaStateToken(token: string): MfaStatePayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as MfaStatePayload;
    if (payload.purpose !== "mfa") return null;
    return payload;
  } catch {
    return null;
  }
}
