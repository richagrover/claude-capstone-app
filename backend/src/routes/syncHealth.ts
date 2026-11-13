/** GET /api/sync-health — optional `provider` query filter, validated against SyncProvider. */
import { Router, type Request, type Response, type NextFunction } from "express";
import type { SyncProvider } from "@prisma/client";
import { getSyncHealth } from "../services/syncHealthService";
import { sendValidationError } from "../errorHandler";

export const syncHealthRouter = Router();

const VALID_PROVIDERS: SyncProvider[] = ["github", "jira"];

syncHealthRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawProvider = req.query.provider;
      let provider: SyncProvider | undefined;

      if (rawProvider !== undefined) {
        if (
          typeof rawProvider !== "string" ||
          !VALID_PROVIDERS.includes(rawProvider as SyncProvider)
        ) {
          return sendValidationError(res, {
            code: "invalid_provider",
            message: `provider must be one of: ${VALID_PROVIDERS.join(", ")}`,
          });
        }
        provider = rawProvider as SyncProvider;
      }

      const result = await getSyncHealth(provider);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);
