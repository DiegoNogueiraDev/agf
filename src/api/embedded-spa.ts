/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * embedded-spa — serves the React SPA from an in-memory base64 map for the
 * standalone bun binary, which has no filesystem `dist/web/dashboard/dist`.
 *
 * WHY: `bun build --compile` bundles only the CLI entry, so the compiled binary
 * cannot `express.static` a dist that isn't there → it used to fall back to the
 * lite page and the visual Graph+Economy UI was invisible to binary users. This
 * router serves the SPA bytes compiled into the binary (see embedded-spa-data.ts),
 * including the client-side-route fallback to index.html.
 *
 * Composes with: app-factory.ts (chooses filesystem dist → this → lite fallback),
 *               embedded-spa-data.ts (the generated payload).
 */
import express, { type Router } from 'express'
import path from 'node:path'
import { EMBEDDED_SPA_DATA } from './embedded-spa-data.js'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

/** Content type for a URL path by extension; octet-stream when unknown. */
export function contentTypeFor(urlPath: string): string {
  return CONTENT_TYPES[path.extname(urlPath).toLowerCase()] ?? 'application/octet-stream'
}

/** True when the SPA is embedded (compiled binary), false for the empty stub. */
export function hasEmbeddedSpa(data: Record<string, string> = EMBEDDED_SPA_DATA): boolean {
  return Object.keys(data).length > 0
}

/**
 * Express router that serves the embedded SPA. Non-API GET requests resolve to:
 *   1. the exact embedded asset (e.g. /assets/index-xxhash.js), or
 *   2. index.html when the path has no file extension (a client-side route), or
 *   3. next() — so unknown assets surface as a real 404, not a silent index.
 */
export function createEmbeddedSpaRouter(data: Record<string, string> = EMBEDDED_SPA_DATA): Router {
  const router = express.Router()
  router.get(/^(?!\/api\/).*/, (req, res, next) => {
    let key = decodeURIComponent(req.path)
    if (key === '/') key = '/index.html'

    let served = key
    if (data[served] === undefined && path.extname(key) === '') {
      served = '/index.html' // SPA deep-link → shell
    }

    const b64 = data[served]
    if (b64 === undefined) {
      next()
      return
    }
    res.type(contentTypeFor(served)).send(Buffer.from(b64, 'base64'))
  })
  return router
}
