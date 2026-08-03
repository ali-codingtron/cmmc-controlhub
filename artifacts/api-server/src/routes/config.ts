import { Router } from "express";

const router = Router();

/**
 * Public endpoint — returns safe, non-sensitive runtime configuration
 * that the frontend needs before authentication (e.g. the environment badge).
 *
 * Reads APP_ENV first; falls back to NODE_ENV.
 * Never exposes secrets, tenant IDs, client IDs, or internal values.
 */
router.get("/config", (_req, res) => {
  const raw = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  let env: "development" | "staging" | "production";
  if (raw === "production") env = "production";
  else if (raw === "staging") env = "staging";
  else env = "development";

  res.json({ env });
});

export default router;
