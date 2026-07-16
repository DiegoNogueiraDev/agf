/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * errorHandler — terminal Express error middleware for /api/v1. Converts any
 * thrown/next(err) into a JSON { error } envelope so route handlers can stay
 * thin (just `next(err)`) and never leak stack traces to the client.
 */

import type { ErrorRequestHandler } from 'express'

/** Express 4-arg error middleware: serialize errors to a JSON envelope. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const message = err instanceof Error ? err.message : 'Internal error'
  if (res.headersSent) return
  res.status(500).json({ error: message })
}
