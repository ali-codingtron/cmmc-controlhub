export type MicrosoftConfig =
  | {
      ok: true;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      authority: string;
      appBaseUrl: string;
      graphScope: string;
    }
  | { ok: false; missing: string[] };

const REQUIRED_VARS = ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"] as const;
const OPTIONAL_VARS = ["MICROSOFT_REDIRECT_URI", "MICROSOFT_AUTHORITY", "APP_BASE_URL"] as const;

export function getMicrosoftConfig(): MicrosoftConfig {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const authority =
    process.env.MICROSOFT_AUTHORITY ?? "https://login.microsoftonline.com/organizations";
  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ??
    `${appBaseUrl}/api/pre-assessment/microsoft/callback`;

  const graphScope =
    process.env.MICROSOFT_GRAPH_SCOPE ?? "https://graph.microsoft.com/.default";

  return {
    ok: true,
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    redirectUri,
    authority,
    appBaseUrl,
    graphScope,
  };
}

export function getMicrosoftConfigStatus(): { configured: boolean; missingVars: string[] } {
  const cfg = getMicrosoftConfig();
  if (cfg.ok) {
    return { configured: true, missingVars: [] };
  }
  const optionalMissing = OPTIONAL_VARS.filter((v) => !process.env[v]);
  return { configured: false, missingVars: [...cfg.missing, ...optionalMissing] };
}
