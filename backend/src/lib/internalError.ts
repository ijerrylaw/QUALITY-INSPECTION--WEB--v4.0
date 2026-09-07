/**
 * @file internalError.ts
 * @description Single source of truth for how an UNEXPECTED 500 is reported to
 * the client. Raw error text (`details`) is only ever returned outside
 * production; when `NODE_ENV === 'production'` the client gets a bare generic
 * message and the real detail lives only in the server log. This is the same
 * NODE_ENV gate the `/api/dev` router mount and the wipe-password fail-closed
 * already use — see devTools.routes.ts and server.ts.
 *
 * Curated 4xx domain errors (e.g. the 409 config-conflict message, the 422
 * VerdictProfileNotFoundError messages in submissions.routes.ts) are NOT routed
 * through here — those `details` strings are app-authored and meant to reach
 * the client as-is.
 */

import type { Request, Response, NextFunction } from 'express';

function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

/**
 * Body for an unexpected-500 JSON response. In production: `{ error }` only.
 * Outside production: `{ error, details }` where `details` is the raw error
 * text, preserved for local debugging.
 *
 * @param err     the caught error (any thrown value)
 * @param message client-facing summary; defaults to a generic string
 */
export function internalErrorBody(
  err: unknown,
  message = 'Internal server error',
): { error: string; details?: string } {
  return isProduction()
    ? { error: message }
    : { error: message, details: String(err) };
}

/**
 * Global Express error-handling middleware. Mount LAST in server.ts, after
 * every route and after the 404 fallback. Express only recognises a middleware
 * as an error handler if it declares all four parameters.
 *
 * Catches synchronous throws inside route handlers and anything a handler
 * forwards via `next(err)`. Logs the full error (message + stack via
 * `console.error`) server-side, then responds with `internalErrorBody()`. If a
 * response was already partly sent, it delegates to Express's built-in handler
 * to close the connection rather than trying to write a second time.
 */
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.error(`[unhandled] ${req.method} ${req.originalUrl}`, err);

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json(internalErrorBody(err));
}
