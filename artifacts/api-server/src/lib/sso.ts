import { randomBytes, createHash } from "crypto";

// In-memory PKCE state store keyed by opaque state string
const stateStore = new Map<string, {
  codeVerifier: string;
  orgId: string;
  configId: string;
  expiresAt: number;
}>();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Clean up expired entries every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of stateStore) {
    if (now > v.expiresAt) stateStore.delete(k);
  }
}, 5 * 60 * 1000);
if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

export function storeOauthState(state: string, codeVerifier: string, orgId: string, configId: string): void {
  stateStore.set(state, {
    codeVerifier,
    orgId,
    configId,
    expiresAt: Date.now() + STATE_TTL_MS,
  });
}

export function consumeOauthState(state: string): { codeVerifier: string; orgId: string; configId: string } | null {
  const entry = stateStore.get(state);
  if (!entry) return null;
  stateStore.delete(state);
  if (Date.now() > entry.expiresAt) return null;
  return { codeVerifier: entry.codeVerifier, orgId: entry.orgId, configId: entry.configId };
}

export function buildAuthorizationUrl(
  tenantId: string,
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ id_token: string; access_token: string }> {
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw Object.assign(new Error(`Token exchange failed (${res.status}): ${text}`), { status: res.status });
  }

  const data = (await res.json()) as {
    id_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (data.error) throw new Error(`${data.error}: ${data.error_description ?? ""}`);
  if (!data.id_token || !data.access_token) throw new Error("Missing tokens in Microsoft response");

  return { id_token: data.id_token, access_token: data.access_token };
}

export function parseIdToken(idToken: string): {
  email: string;
  name: string;
  sub: string;
  tid?: string;
  iss?: string;
  aud?: string | string[];
} {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("Invalid id_token format");

  let decoded: Record<string, unknown>;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    throw new Error("Failed to decode id_token payload");
  }

  const email = (decoded.email ?? decoded.preferred_username ?? decoded.upn) as string | undefined;
  const name = (decoded.name ?? decoded.display_name ?? email) as string | undefined;
  const sub = (decoded.sub ?? decoded.oid) as string | undefined;
  const tid = decoded.tid as string | undefined;
  const iss = decoded.iss as string | undefined;
  const aud = decoded.aud as string | string[] | undefined;

  if (!email) throw new Error("No email claim found in id_token (openid profile email scopes required)");
  if (!sub) throw new Error("No subject (sub/oid) claim found in id_token");

  return { email: email.toLowerCase().trim(), name: name ?? email, sub, tid, iss, aud };
}
