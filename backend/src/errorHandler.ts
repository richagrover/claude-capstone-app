/**
 * Centralized Express error-handling middleware.
 *
 * Maps known application errors to structured 4xx bodies and anything unexpected to a generic
 * 500 — the real error is logged server-side only; no stack trace or internal detail is ever
 * included in the response body (architecture §5.2, NFR-3/NFR-4).
 */
import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";

export type ErrorBody = { error: string; message: string };

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super(404, "not_found", message);
  }
}

export class ValidationFailedError extends AppError {
  constructor(code: string, message: string) {
    super(400, code, message);
  }
}

/** Sends a structured validation error response; used by routes after calling validation.ts. */
export function sendValidationError(
  res: Response,
  error: { code: string; message: string },
): void {
  res.status(400).json({ error: error.code, message: error.message } satisfies ErrorBody);
}

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    error: "not_found",
    message: "The requested route does not exist.",
  } satisfies ErrorBody);
};

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json({ error: err.code, message: err.message } satisfies ErrorBody);
    return;
  }

  // body-parser raises a PayloadTooLargeError (type "entity.too.large") when the request body
  // exceeds express.json()'s configured limit (SEC-3) — map it to a structured 413, not a 500.
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({
      error: "payload_too_large",
      message: "Request body exceeds the maximum allowed size.",
    } satisfies ErrorBody);
    return;
  }

  // Unknown/unexpected error: log server-side only, never leak details to the client.
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "internal_error",
    message: "An unexpected error occurred.",
  } satisfies ErrorBody);
};
