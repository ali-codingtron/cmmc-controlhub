# ControlHUB — CMMC Compliance Platform

A full-stack web application for managing CMMC (Cybersecurity Maturity Model Certification) compliance across organizations. Built as a pnpm monorepo with a React frontend and a Node.js/Express API.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Local Development](#local-development)
5. [Environment Variables](#environment-variables)
6. [Database Migrations](#database-migrations)
7. [Deploying to Azure Web App (Linux · Node.js 24 LTS)](#deploying-to-azure-web-app-linux--nodejs-24-lts)
   - [One-time Azure Setup](#1-one-time-azure-setup)
   - [Configure the Web App](#2-configure-the-web-app)
   - [Serve the Frontend from the API](#3-serve-the-frontend-from-the-api)
   - [Build & Deploy Manually (Zip Deploy)](#4-build--deploy-manually-zip-deploy)
   - [CI/CD with GitHub Actions](#5-cicd-with-github-actions)
   - [Post-Deployment Checklist](#6-post-deployment-checklist)
8. [Useful Scripts](#useful-scripts)

---

## Project Structure

```
/
├── artifacts/
│   ├── api-server/          # Express API (Node.js ESM, built with esbuild)
│   └── cmmc-app/            # React 19 + Vite 7 SPA
├── lib/
│   ├── db/                  # Drizzle ORM schema, migrations, client
│   └── api-zod/             # Shared Zod schemas between API and frontend
├── scripts/                 # One-off generation scripts (role guides, etc.)
├── .env.example             # Annotated environment variable template
├── pnpm-workspace.yaml
└── package.json
```

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Frontend    | React 19, Vite 7, Tailwind CSS 4, shadcn/ui     |
| API         | Node.js 24, Express 5, ESM (esbuild bundle)     |
| Database    | PostgreSQL (Drizzle ORM)                        |
| Auth        | Session-based + Microsoft Entra ID (SSO), TOTP MFA |
| File Storage| Azure Blob Storage (managed identity supported) |
| Email       | Resend or SMTP (runtime switch via `EMAIL_PROVIDER`) |
| Package Mgr | pnpm 10 (workspaces)                            |

---

## Prerequisites

| Tool          | Minimum version | Notes                                   |
|---------------|-----------------|-----------------------------------------|
| Node.js       | 24 LTS          | `node --version` to verify              |
| pnpm          | 10              | `npm install -g pnpm`                   |
| PostgreSQL    | 15+             | Local instance or connection string     |
| Azure CLI     | Latest          | Required for Azure deployment only      |

---

## Local Development

### 1. Clone and install

```bash
git clone <repo-url>
cd <repo-root>
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in DATABASE_URL, SESSION_SECRET, and other required values
```

See [Environment Variables](#environment-variables) for a full reference.

### 3. Set up the database

```bash
# Push the Drizzle schema to your local PostgreSQL instance
pnpm --filter @workspace/db run db:push
```

### 4. Start both services

Open two terminals:

```bash
# Terminal 1 — API server (http://localhost:5000)
PORT=5000 pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend dev server (http://localhost:5173)
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/cmmc-app run dev
```

The frontend proxies `/api` requests to the API server during development via Vite's proxy config.

---

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable                      | Required | Description                                              |
|-------------------------------|----------|----------------------------------------------------------|
| `DATABASE_URL`                | ✅       | PostgreSQL connection string                             |
| `SESSION_SECRET`              | ✅       | Min 32-char random string for Express sessions           |
| `MFA_ENCRYPTION_KEY`          | ✅       | 64-char hex string for AES-256 TOTP secret encryption    |
| `APP_BASE_URL`                | ✅       | Full public URL of the deployed app (no trailing slash)  |
| `PORT`                        | ✅       | Set automatically by Azure; required locally             |
| `EMAIL_PROVIDER`              | ✅       | `resend` or `smtp`                                       |
| `RESEND_API_KEY`              | ⚠️       | Required when `EMAIL_PROVIDER=resend`                    |
| `MICROSOFT_SSO_CLIENT_ID`     | ⚠️       | Required for Microsoft Entra ID login                    |
| `MICROSOFT_SSO_CLIENT_SECRET` | ⚠️       | Required for Microsoft Entra ID login                    |
| `MICROSOFT_SSO_AUTHORITY`     | ⚠️       | Entra ID authority URL                                   |
| `MICROSOFT_SSO_REDIRECT_URI`  | ⚠️       | Must match App Registration redirect URI                 |

See `.env.example` for the complete annotated list.

---

## Database Migrations

```bash
# Generate a new migration after schema changes
pnpm --filter @workspace/db run db:generate

# Apply pending migrations (production-safe)
pnpm --filter @workspace/db run db:migrate

# Push schema directly (development only — skips migration history)
pnpm --filter @workspace/db run db:push
```

---

## Azure Blob Storage

ControlHUB stores evidence, generated documents, SSP files, and other uploads in
a single **private Azure Blob Storage container**. The API reads its configuration
from Azure App Service App Settings; no credentials are baked into the container.

### Recommended production setup: managed identity

1. Create a Storage Account and a private Blob container, for example
   `controlhub`.
2. In the Azure Web App, enable **System assigned** managed identity.
3. Grant that identity the **Storage Blob Data Contributor** role on the storage
   account. Account scope is required because the API generates short-lived
   user-delegation SAS URLs for direct browser uploads.
4. Add these App Settings:

   ```text
   AZURE_STORAGE_ACCOUNT_URL=https://<storage-account>.blob.core.windows.net
   AZURE_STORAGE_CONTAINER=controlhub
   AZURE_STORAGE_PRIVATE_PREFIX=private
   AZURE_STORAGE_PUBLIC_PREFIXES=public
   ```

The managed identity receives credentials automatically from Azure at runtime.
It also generates short-lived SAS URLs for any direct browser upload flow.

### Alternative: connection string

For local development or where managed identity is not available, set
`AZURE_STORAGE_CONNECTION_STRING` instead of `AZURE_STORAGE_ACCOUNT_URL`. Do
not set both. Store the connection string in an Azure Key Vault reference in
production.

```text
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=<storage-account>;AccountKey=<account-key>;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=controlhub
AZURE_STORAGE_PRIVATE_PREFIX=private
AZURE_STORAGE_PUBLIC_PREFIXES=public
```

`AZURE_STORAGE_ACCOUNT_NAME` and `AZURE_STORAGE_ACCOUNT_KEY` are also supported
as a legacy key-based alternative. The complete variable template is in
`.env.example`.

---

## Deploying to Azure Web App (Linux · Node.js 24 LTS)

The API server (`artifacts/api-server`) is the single deployable unit. It already
serves the compiled React frontend as static files, so both the SPA and API run
from the same container.

### 1. One-time Azure Setup

```bash
# Log in
az login

# Create a resource group (adjust location as needed)
az group create \
  --name rg-controlhub \
  --location eastus

# Create an App Service Plan — P1v3 (Linux) recommended for production
# Use B2 or B3 for staging/testing
az appservice plan create \
  --name asp-controlhub \
  --resource-group rg-controlhub \
  --sku P1v3 \
  --is-linux

# Create the Web App with Node.js 24 LTS runtime
az webapp create \
  --name controlhub \
  --resource-group rg-controlhub \
  --plan asp-controlhub \
  --runtime "NODE:24-lts"
```

> **Database**: Provision an **Azure Database for PostgreSQL — Flexible Server** in the same resource group, or use your existing PostgreSQL instance. Copy the connection string into `DATABASE_URL`.

---

### 2. Configure the Web App

#### App Settings (environment variables)

Set all required environment variables as App Settings. Azure injects these as `process.env` at runtime. The `PORT` variable is set **automatically** by Azure — do not override it.

```bash
az webapp config appsettings set \
  --name controlhub \
  --resource-group rg-controlhub \
  --settings \
    NODE_ENV="production" \
    APP_ENV="production" \
    APP_BASE_URL="https://controlhub.azurewebsites.net" \
    DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require" \
    SESSION_SECRET="<min-32-char-random-string>" \
    MFA_ENCRYPTION_KEY="<64-char-hex-string>" \
    EMAIL_PROVIDER="resend" \
    RESEND_API_KEY="<your-resend-key>" \
    EMAIL_FROM="ControlHUB <noreply@your-domain.com>" \
    MICROSOFT_SSO_CLIENT_ID="<guid>" \
    MICROSOFT_SSO_CLIENT_SECRET="<secret>" \
    MICROSOFT_SSO_AUTHORITY="https://login.microsoftonline.com/organizations/v2.0" \
    MICROSOFT_SSO_REDIRECT_URI="https://controlhub.azurewebsites.net/api/auth/microsoft/callback" \
    LOG_LEVEL="info" \
    ENABLE_PUBLIC_DEMO="false"
```

> 💡 Use **Azure Key Vault references** for secrets in production:
> `@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/SESSION_SECRET/)`.

#### Startup command

```bash
az webapp config set \
  --name controlhub \
  --resource-group rg-controlhub \
  --startup-file "node --enable-source-maps artifacts/api-server/dist/index.mjs"
```

---

### 3. Serve the Frontend from the API

Azure Web App runs a **single process**. This repository already configures the
Express API to serve the compiled React SPA after the `/api` router. The
production setup is equivalent to:

```typescript
import path from "path";
import { fileURLToPath } from "url";

// Resolve the Vite build output relative to this file at runtime.
// After building, the structure is:
//   artifacts/api-server/dist/index.mjs   ← running file
//   artifacts/cmmc-app/dist/public/       ← Vite build output
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../cmmc-app/dist/public");

// Serve static assets (JS, CSS, images)
app.use(express.static(frontendDist));

// SPA fallback — Express 5 requires a named wildcard parameter
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});
```

> This must be placed **after** `app.use("/api", router)` so API routes take priority.

After this change, rebuild locally and verify:
```bash
pnpm --filter @workspace/cmmc-app run build   # outputs to artifacts/cmmc-app/dist/public
pnpm --filter @workspace/api-server run build  # bundles API to artifacts/api-server/dist
PORT=5000 node --enable-source-maps artifacts/api-server/dist/index.mjs
# Visit http://localhost:5000 — should serve the React app
```

---

### 4. Build & Deploy Manually (Zip Deploy)

Use this for one-off deployments or testing.

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Build the frontend
pnpm --filter @workspace/cmmc-app run build

# 3. Build the API (includes copying data files)
pnpm --filter @workspace/api-server run build

# 4. Package everything for deployment
#    Include: package files, pnpm lockfile, and both dist directories
zip -r deploy.zip \
  package.json \
  pnpm-workspace.yaml \
  pnpm-lock.yaml \
  artifacts/api-server/dist \
  artifacts/cmmc-app/dist \
  --exclude "*/node_modules/*"

# 5. Deploy via Kudu zip deploy
az webapp deployment source config-zip \
  --name controlhub \
  --resource-group rg-controlhub \
  --src deploy.zip
```

---

### 5. CI/CD with GitHub Actions and ACR

This repository includes `.github/workflows/azure-container-deploy.yml`. It
deploys each environment independently:

- Pushes to `staging` deploy the `staging` GitHub Environment.
- Pushes to `main` deploy the `production` GitHub Environment.
- Pushes to `dev` remain in the Replit development environment and do not
  trigger an Azure deployment.
- There is no manual environment selector: the target branch determines the
  Azure environment automatically.

For the selected environment, it:

1. Builds the production image from the root `Dockerfile`.
2. Pushes it to Azure Container Registry (ACR) with both
   `<environment>-sha-<commit>` and `<environment>-latest` tags.
3. Resolves the pushed image's registry digest, configures the matching Azure
   App Service to run that immutable digest, and restarts the app so it pulls
   the new image.

The SHA tag remains useful for identifying the source commit, but the
deployment itself never relies on a mutable image tag.

Environment-prefixed tags prevent staging and production from overwriting each
other's traceability tags accidentally. They are not an authorization boundary.

#### GitHub Environment secrets

Create two protected GitHub Environments named `production` and `staging`.
Add the same secret names to each Environment, but use values for that
environment's Azure subscription, resource group, Web App, registry, and
federated identity. Use a separate ACR for each environment and a separate
Microsoft Entra deployment identity for each ACR. Repository secrets are not
recommended because they cannot separate staging access from production access.

Do not give the staging identity `AcrPush` access to the production registry,
or vice versa. A shared registry with broad `AcrPush` permissions allows one
environment to replace another environment's tags before its digest is resolved.
If a shared registry is unavoidable, use Azure Container Registry ABAC
repository permissions with separate repositories and writer identities; simple
tag prefixes do not provide the required security boundary.

In the Environment settings, restrict `production` deployments to the
protected `main` branch and `staging` deployments to the protected `staging`
branch. Add required reviewers to `production` when appropriate.

| Secret | Value |
|--------|-------|
| `AZURE_CLIENT_ID` | Azure app registration / service principal client ID |
| `AZURE_TENANT_ID` | Microsoft Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | Resource group that contains the Web App |
| `AZURE_WEBAPP_NAME` | Azure App Service Web App name |
| `ACR_NAME` | ACR resource name, without `.azurecr.io` |
| `ACR_LOGIN_SERVER` | ACR login server, for example `controlhub.azurecr.io` |
| `ACR_REPOSITORY` | Repository name inside ACR, for example `controlhub` |

The workflow uses GitHub Actions OIDC federation, so it does not need an Azure
client secret or `AZURE_CREDENTIALS` JSON secret. Create a Microsoft Entra app
registration and its corresponding service principal for each environment, add
a federated credential for each protected GitHub Environment, and save each
identity's client ID, tenant ID, and subscription ID in that Environment's
secrets.

The federated credentials must use:

- Issuer: `https://token.actions.githubusercontent.com`
- Production subject: `repo:<github-owner>/<github-repository>:environment:production`
- Staging subject: `repo:<github-owner>/<github-repository>:environment:staging`
- Audience: `api://AzureADTokenExchange`

Grant each identity only on resources for its own environment:

- **AcrPush** on its environment's ACR resource, so it can publish images.
- **Website Contributor** on its environment's Web App, so it can update the
  image reference and restart the app.

The workflow pins third-party actions to full commit SHAs. Keep those pins
current through Dependabot or a deliberate action-version review; do not
replace them with moving major-version tags in a production deployment job.

```bash
DEPLOY_ENV="<staging-or-production>"
AZURE_CLIENT_ID="<application-client-id>"
ACR_ID=$(az acr show --name <acr-name> --resource-group <resource-group> --query id --output tsv)
WEBAPP_ID=$(az webapp show --name <webapp-name> --resource-group <resource-group> --query id --output tsv)

az role assignment create \
  --assignee "$AZURE_CLIENT_ID" \
  --role "AcrPush" \
  --scope "$ACR_ID"

az role assignment create \
  --assignee "$AZURE_CLIENT_ID" \
  --role "Website Contributor" \
  --scope "$WEBAPP_ID"
```

Create one GitHub federated credential per app registration in the Azure
portal, or use the Azure CLI command below once for each environment after
replacing the owner and repository:

```bash
cat > "github-${DEPLOY_ENV}-federated-credential.json" <<JSON
{
  "name": "github-${DEPLOY_ENV}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<github-owner>/<github-repository>:environment:${DEPLOY_ENV}",
  "description": "GitHub Actions production deployment",
  "audiences": [
    "api://AzureADTokenExchange"
  ]
}
JSON

az ad app federated-credential create \
  --id "$AZURE_CLIENT_ID" \
  --parameters "github-${DEPLOY_ENV}-federated-credential.json"
rm "github-${DEPLOY_ENV}-federated-credential.json"
```

#### Allow each Web App to pull its private ACR images

The workflow uses each Web App's system-assigned managed identity to pull
images from its own ACR. Run this once for both Web Apps before their first
deployment, using the matching registry and resource group each time:

```bash
az webapp identity assign \
  --name <webapp-name> \
  --resource-group <resource-group>

WEBAPP_PRINCIPAL_ID=$(az webapp identity show \
  --name <webapp-name> \
  --resource-group <resource-group> \
  --query principalId \
  --output tsv)

ACR_ID=$(az acr show \
  --name <acr-name> \
  --resource-group <resource-group> \
  --query id \
  --output tsv)

az role assignment create \
  --assignee-object-id "$WEBAPP_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPull \
  --scope "$ACR_ID"
```

The workflow sets `WEBSITES_PORT=8080` for the custom container. Keep all
application configuration—including database credentials, Microsoft SSO,
Resend, and Azure Blob storage—in Azure App Service App Settings or Key Vault
references. Do not copy those runtime secrets into GitHub.

---

### 6. Post-Deployment Checklist

| # | Check | How |
|---|-------|-----|
| 1 | App starts without errors | Azure Portal → Web App → **Log stream** |
| 2 | `/api/health` returns 200 | `curl https://controlhub.azurewebsites.net/api/health` |
| 3 | Database connected | Check startup logs for "Server listening" without DB errors |
| 4 | Startup seed ran | Visit `/api/health` or check logs for seed completion |
| 5 | Microsoft SSO redirect works | Test login flow; verify redirect URI matches App Registration |
| 6 | Email delivery works | Trigger a password-reset or invite email |
| 7 | Custom domain + SSL | Azure Portal → Web App → **Custom domains** → Add → Enable HTTPS |
| 8 | Always-on enabled | Portal → **Configuration** → General settings → **Always on: On** |
| 9 | HTTPS-only enforced | Portal → **TLS/SSL settings** → **HTTPS Only: On** |

---

## Useful Scripts

```bash
# Type-check the entire monorepo
pnpm run typecheck

# Full production build (type-check + all packages)
pnpm run build

# Generate PDF role guides (run one at a time — 120s timeout each)
pnpm run generate:role-guides

# Generate the user guide
pnpm run generate:user-guide

# Generate the assessor guide
pnpm run generate:assessor-guide
```
