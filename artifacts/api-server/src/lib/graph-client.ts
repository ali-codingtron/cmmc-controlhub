interface GraphToken {
  access_token: string;
  expires_at: number;
}

const tokenCache = new Map<string, GraphToken>();

export async function getGraphToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const cacheKey = `${tenantId}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expires_at - 60_000) {
    return cached.access_token;
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw Object.assign(new Error(`Token request failed (${res.status}): ${err}`), {
      code: "TOKEN_FAILED",
      status: res.status,
    });
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const token: GraphToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  tokenCache.set(cacheKey, token);
  return token.access_token;
}

export class GraphPermissionError extends Error {
  code = "PERMISSION_DENIED";
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

export class GraphUnavailableError extends Error {
  code = "UNAVAILABLE";
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

async function sleepMs(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function graphGet<T>(
  token: string,
  path: string,
  params?: Record<string, string>,
  retries = 2
): Promise<T> {
  const baseUrl = path.startsWith("https://")
    ? path
    : `https://graph.microsoft.com/v1.0${path}`;
  const url = params
    ? `${baseUrl}?${new URLSearchParams(params).toString()}`
    : baseUrl;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? 5);
      if (attempt < retries) {
        await sleepMs(retryAfter * 1000);
        continue;
      }
      throw new GraphUnavailableError("Graph API throttled", 429);
    }

    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
      throw new GraphPermissionError(
        body?.error?.message ?? `Permission denied (${res.status})`,
        res.status
      );
    }

    if (res.status === 404) {
      throw new GraphUnavailableError("Resource not found", 404);
    }

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      if (attempt < retries) {
        await sleepMs(2000 * (attempt + 1));
        continue;
      }
      throw new GraphUnavailableError(`Graph API error ${res.status}: ${err}`, res.status);
    }

    return res.json() as Promise<T>;
  }
  throw new GraphUnavailableError("Max retries exceeded", 500);
}

export async function graphGetAll<T>(
  token: string,
  path: string,
  params?: Record<string, string>,
  maxPages = 20
): Promise<T[]> {
  const results: T[] = [];
  let nextLink: string | undefined;
  let page = 0;

  do {
    const data = await graphGet<{ value?: T[]; "@odata.nextLink"?: string }>(
      token,
      nextLink ?? path,
      nextLink ? undefined : params
    );
    if (Array.isArray(data.value)) results.push(...data.value);
    nextLink = data["@odata.nextLink"];
    page++;
  } while (nextLink && page < maxPages);

  return results;
}

export function invalidateTokenCache(tenantId: string, clientId: string) {
  tokenCache.delete(`${tenantId}:${clientId}`);
}
