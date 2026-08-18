import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { existsSync } from "fs";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Static frontend serving ────────────────────────────────────────────────────
// In a Docker / Azure App Service deployment the Vite SPA is built into
// artifacts/cmmc-app/dist/public and copied into the container alongside the
// API bundle. This block serves those assets and provides the SPA fallback so
// that client-side routing (wouter) works on hard refresh.
//
// The path is relative to __dirname which esbuild's banner resolves to the
// directory of the running .mjs file at runtime:
//   container:  /app/artifacts/api-server/dist/
//   frontend:   /app/artifacts/cmmc-app/dist/public/
//
// In local development the frontend runs on its own Vite dev server, so the
// dist directory won't exist — existsSync guards against that.
const frontendDist = path.resolve(__dirname, "../../cmmc-app/dist/public");

if (existsSync(frontendDist)) {
  // Serve hashed asset files (JS, CSS, images) with long-lived caching
  app.use(
    express.static(frontendDist, {
      maxAge: "1y",
      immutable: true,
      index: false, // let the SPA fallback below handle /
    }),
  );

  // SPA fallback — every non-API request gets index.html so client-side
  // routing handles the path instead of Express returning 404
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
