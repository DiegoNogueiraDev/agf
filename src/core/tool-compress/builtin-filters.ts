/*!
 * SPDX-License-Identifier: MIT
 * Copyright © 2024-2026 decolua and contributors (9router)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from 9router (https://github.com/decolua/9router), MIT, whose
 * open-sse/rtk module is itself a port of rtk (https://github.com/rtk-ai/rtk),
 * Apache-2.0, © Patrick Szymkowiak. This file stays under its original MIT
 * terms; agent-graph-flow as a whole is Apache-2.0. See THIRD-PARTY-NOTICES.md.
 *
 * Built-in filter loader — parses the concatenated TOML at import time
 * and registers declarative filters via the registry.
 */

import { parse as parseToml } from 'smol-toml'
import { registerFilter } from './registry.js'
import { compileCustomFilter, type CustomFilterRule } from './custom-filters.js'
import type { TomlPipelineStage } from './toml-pipeline.js'
import { BUILTIN_FILTERS_TOML } from './builtin-filters.generated.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tool-compress/builtin-filters.ts' })

let loaded = false

interface TomlFilterEntry {
  name: string
  priority?: number
  detect: string[]
  keep?: string[]
  drop?: string[]
  pipeline?: TomlPipelineStage
  enabled?: boolean
}

/**
 * Load built-in TOML filters into the registry. Idempotent — only runs once.
 * Called automatically on first import (side-effect), but can also be called
 * explicitly after _resetCustomFiltersLoaded() in tests.
 */
export function loadBuiltinTomlFilters(): number {
  if (loaded) return 0
  loaded = true

  if (!BUILTIN_FILTERS_TOML || BUILTIN_FILTERS_TOML.length === 0) {
    log.debug('builtin-filters:empty')
    return 0
  }

  let parsed: Record<string, unknown>
  try {
    parsed = parseToml(BUILTIN_FILTERS_TOML) as Record<string, unknown>
  } catch (err) {
    log.warn('builtin-filters:parse-error', { error: err instanceof Error ? err.message : String(err) })
    return 0
  }

  const filtersRaw = parsed.filters
  if (!Array.isArray(filtersRaw)) return 0

  let registered = 0
  for (const entryRaw of filtersRaw) {
    const entry = entryRaw as TomlFilterEntry
    if (entry.enabled === false) continue
    if (!entry.name || !Array.isArray(entry.detect) || entry.detect.length === 0) continue

    try {
      const rule: CustomFilterRule = {
        name: entry.name,
        detect: entry.detect,
        keep: entry.keep,
        drop: entry.drop,
        pipeline: entry.pipeline,
        priority: entry.priority,
      }
      registerFilter(compileCustomFilter(rule))
      registered++
    } catch (err) {
      log.warn('builtin-filters:compile-error', {
        name: entry.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  log.info('builtin-filters:loaded', { registered, total: filtersRaw.length })
  return registered
}

/** Reset loaded state (for testing). */
export function _resetBuiltinFilters(): void {
  loaded = false
}
