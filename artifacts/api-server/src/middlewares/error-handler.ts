import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.ts";

/**
 * Thrown by route/middleware code to produce a specific HTTP status with a
 * client-safe message and a machine-readable code. Anything else (unexpected
 * errors) is treated as a 500 and its details are never sent to the client.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string | undefined;
  readonly detail: unknown;

  constructor(
    statusCode: number,
    message: string,
    code?: string,
    detail?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
  }
}

function defaultCodeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "VALIDATION_ERROR";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    default:
      return "INTERNAL_ERROR";
  }
}

/** 404 handler for routes that don't match anything — must be mounted last. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
}

/**
 * Centralized error handler — must be mounted last, after all routes.
 * Express recognizes this as an error middleware because it takes 4 args.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    // A response already started streaming; nothing safe to do but log.
    logger.error(err, "Error occurred after response headers were sent");
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code ?? defaultCodeForStatus(err.statusCode),
      ...(err.detail !== undefined ? { detail: err.detail } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      issues: err.issues,
    });
    return;
  }

  // express.json() throws a SyntaxError (with a body-parser `type`) on malformed JSON.
  if (
    err instanceof SyntaxError &&
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: unknown }).type === "entity.parse.failed"
  ) {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }

  // body-parser reports oversized bodies via this `type`.
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: unknown }).type === "entity.too.large"
  ) {
    res.status(413).json({ error: "Request body too large" });
    return;
  }

  logger.error(err, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
