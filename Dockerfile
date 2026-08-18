# ──────────────────────────────────────────────────────────────────────────────
#  ControlHUB — Multi-stage Docker build
#
#  Stage 1 (builder): installs all deps, compiles the React SPA and the
#                     Express API, then uses `pnpm deploy` to produce a
#                     flat, production-only node_modules tree.
#
#  Stage 2 (runner):  copies only the compiled output and the production
#                     node_modules — no source, no devDeps, no build tools.
#
#  Azure App Service (Linux, Node 24 LTS) injects PORT automatically (8080).
#  All other env vars must be set as App Settings in the portal or via CLI;
#  no .env file is read inside the container.
# ──────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

# Build tools required to compile any native add-ons during `pnpm install`.
# (bcryptjs is pure-JS so these are rarely needed, but kept as a safety net.)
RUN apk add --no-cache python3 make g++

# Activate pnpm through corepack (ships with Node ≥ 16, no extra install)
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /build

# ── Copy manifests before source so Docker can cache the install layer ────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Library packages
COPY lib/db/package.json                 lib/db/
COPY lib/api-zod/package.json            lib/api-zod/
COPY lib/api-spec/package.json           lib/api-spec/
COPY lib/api-client-react/package.json   lib/api-client-react/

# Artifact packages
COPY artifacts/api-server/package.json   artifacts/api-server/
COPY artifacts/cmmc-app/package.json     artifacts/cmmc-app/

# Install everything (dev + prod) — required to build TypeScript & run Vite
RUN pnpm install --frozen-lockfile

# ── Copy full source now that deps are installed ───────────────────────────────
COPY . .

# Build the React SPA → artifacts/cmmc-app/dist/public/
# BASE_PATH is required by vite.config.ts; "/" is correct for a root-mounted app
ENV BASE_PATH=/
RUN pnpm --filter @workspace/cmmc-app run build

# Build the Express API → artifacts/api-server/dist/ (via esbuild)
RUN pnpm --filter @workspace/api-server run build

# ── Produce a flat, production-only node_modules for the API ──────────────────
# `pnpm deploy` resolves all "dependencies" (not devDeps) for the target
# package and copies them — including any workspace packages — into a clean
# directory. Workspace packages bundled by esbuild are included but never
# loaded at runtime (the bundle is self-contained for those).
RUN pnpm --filter @workspace/api-server deploy /deploy

# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

# Production node_modules (nodemailer, pdfkit, @google-cloud/storage, etc.)
# Placed at /app/node_modules so Node's module resolver finds them when
# running /app/artifacts/api-server/dist/index.mjs
COPY --from=builder /deploy/node_modules            ./node_modules

# Express API bundle + data files (cmmc-controls.json, templates/)
COPY --from=builder /build/artifacts/api-server/dist  ./artifacts/api-server/dist

# Compiled React SPA — served as static files by Express in production
# (see artifacts/api-server/src/app.ts — existsSync guard activates this path)
COPY --from=builder /build/artifacts/cmmc-app/dist/public  ./artifacts/cmmc-app/dist/public

# ── Runtime environment ────────────────────────────────────────────────────────
# NODE_ENV signals production mode to Express and the app.
# PORT is set automatically by Azure App Service (default 8080).
# Every other variable (DATABASE_URL, SESSION_SECRET, MICROSOFT_SSO_*, etc.)
# must be configured as App Settings in Azure — they are passed in as plain
# environment variables and read directly via process.env at startup.
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# --enable-source-maps gives readable stack traces from esbuild linked maps
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
