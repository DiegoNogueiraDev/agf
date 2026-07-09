/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tool-compress/apply-filter.ts' })

/** Apply a compression filter function safely; passes `text` through unchanged if `fn` is null, not a function, or throws. */
export function safeApply(fn: ((text: string) => string) | null | undefined, text: string): string {
  if (typeof fn !== 'function') return text
  try {
    const out = fn(text)
    if (typeof out !== 'string') return text
    return out
  } catch (err) {
    const name = ((fn as unknown as Record<string, unknown>).filterName as string) || fn.name || 'anonymous'

    log.warn(
      `[tool-compress] warning: filter '${name}' panicked — passing through raw output: ${err instanceof Error ? err.message : String(err)}`,
    )
    return text
  }
}
