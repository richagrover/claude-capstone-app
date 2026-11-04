/**
 * Express app wiring: middleware, routes, centralized error handler (mounted last).
 *
 * Cross-cutting hardening (resolves SEC-2, SEC-3):
 *  - CORS: single-origin allowlist from FRONTEND_ORIGIN, no wildcard, no credentials (no
 *    auth/cookies in scope per the design review's SEC-1 out-of-scope decision).
 *  - Payload size limit on the JSON body parser.
 *  - Rate limiting on /api, defense-in-depth, returning the same structured error shape.
 */
import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { tasksRouter } from "./routes/tasks";
import { syncHealthRouter } from "./routes/syncHealth";
import { AppError, errorHandler, notFoundHandler } from "./errorHandler";

const JSON_BODY_LIMIT = "100kb";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;

export function createApp(): Express {
  const app = express();

  const allowedOrigin = process.env.FRONTEND_ORIGIN;
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // No Origin header (e.g. server-to-server, curl) is allowed through; browsers always
        // send Origin for cross-origin fetch/XHR, so this does not weaken the browser-enforced
        // single-origin allowlist below.
        if (!requestOrigin || requestOrigin === allowedOrigin) {
          callback(null, true);
          return;
        }
        callback(new AppError(403, "cors_rejected", "Origin not allowed."));
      },
      credentials: false,
      methods: ["GET", "POST", "PATCH", "DELETE"],
    }),
  );

  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const apiRateLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: "rate_limited",
        message: "Too many requests. Please try again later.",
      });
    },
  });
  app.use("/api", apiRateLimiter);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/tasks", tasksRouter);
  app.use("/api/sync-health", syncHealthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
