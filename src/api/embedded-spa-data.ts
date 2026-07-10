/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * embedded-spa-data — base64 map of the built Vite SPA, keyed by URL path
 * (e.g. "/index.html", "/assets/index-xxhash.js"). DEFAULT EMPTY: the npm/source
 * install serves the SPA from the filesystem (dist/web/dashboard/dist), so this
 * stays `{}` and the binary stays small in dev.
 *
 * pack:bun regenerates this file (scripts/gen-embedded-spa.mjs) with the full
 * SPA right before `bun build --compile`, then restores this empty stub — so the
 * standalone binary embeds the full Graph+Economy UI instead of the lite page,
 * without committing ~2.7 MB of base64 to the repo. See app-factory.ts for the
 * serve order: filesystem dist → embedded SPA → lite fallback.
 */
export const EMBEDDED_SPA_DATA: Record<string, string> = {}
