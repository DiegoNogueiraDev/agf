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
 * Filter override system: project-local .agf/filters.toml merges with built-in
 * compress filters. TOML entries with the same name as a built-in disable the
 * built-in and use the TOML version. New names are registered alongside.
 *
 * TOML format:
 *   [[filters]]
 *   name = "my-filter"
 *   priority = 75
 *   detect = ["^my-special-output"]
 *   keep = ["^ERROR", "^FAIL"]
 *   drop = ["^\\s*$"]
 *   enabled = true
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { registerFilter, clearCustomFilters, listFilters } from './registry.js'
import { compileCustomFilter, type CustomFilterRule } from './custom-filters.js'
import type { TomlPipelineStage } from './toml-pipeline.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tool-compress/filter-overrides.ts' })

export interface TomlFilterEntry {
  name: string
  priority?: number
  detect: string[]
  /** Legacy: simple keep/drop regex rules. */
  keep?: string[]
  drop?: string[]
  /** Advanced: 8-stage pipeline (replaces keep/drop). */
  pipeline?: TomlPipelineStage
  enabled?: boolean
}

interface ParsedToml {
  filters?: TomlFilterEntry[]
}

const FILTERS_TOML = '.agf/filters.toml'

let overrideLoaded = false

/**
 * Load project-local .agf/filters.toml, merge with built-in filters.
 * Project-local entries with the same name override built-ins.
 * New names register alongside built-ins.
 * Called once, idempotent.
 */
export function ensureFilterOverridesLoaded(dir: string = process.cwd()): number {
  if (overrideLoaded) return 0
  overrideLoaded = true

  const tomlPath = path.join(dir, FILTERS_TOML)
  if (!existsSync(tomlPath)) {
    log.debug('filter-overrides:no-file', { path: tomlPath })
    return 0
  }

  let parsed: ParsedToml
  try {
    const raw = readFileSync(tomlPath, 'utf-8')
    parsed = parseToml(raw) as ParsedToml
  } catch (err) {
    log.warn('filter-overrides:parse-error', {
      path: tomlPath,
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }

  if (!parsed.filters || !Array.isArray(parsed.filters)) {
    log.debug('filter-overrides:no-filters', { path: tomlPath })
    return 0
  }

  const active = parsed.filters.filter((f) => f.enabled !== false)

  // Collect built-in filter names so we can identify overrides vs new
  const builtInNames = new Set(listFilters().map((f) => f.name))

  let registered = 0
  let overrides = 0
  let additions = 0

  for (const entry of active) {
    if (!entry.name || !Array.isArray(entry.detect) || entry.detect.length === 0) {
      log.warn('filter-overrides:skip-invalid', { name: entry.name ?? '(unnamed)' })
      continue
    }

    try {
      const rule: CustomFilterRule = {
        name: entry.name,
        detect: entry.detect,
        keep: entry.keep,
        drop: entry.drop,
        pipeline: entry.pipeline,
        priority: entry.priority,
      }
      const filter = compileCustomFilter(rule)
      registerFilter(filter)
      registered++

      if (builtInNames.has(entry.name)) {
        overrides++
        log.debug('filter-overrides:override', { name: entry.name })
      } else {
        additions++
        log.debug('filter-overrides:addition', { name: entry.name })
      }
    } catch (err) {
      log.warn('filter-overrides:compile-error', {
        name: entry.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (registered > 0) {
    log.info('filter-overrides:loaded', {
      path: tomlPath,
      registered,
      overrides,
      additions,
    })
  }

  return registered
}

/**
 * Reset override state (for testing). Clears custom filters and resets flag.
 */
export function _resetFilterOverrides(): void {
  overrideLoaded = false
  clearCustomFilters()
}

/**
 * Load overrides from explicit path (for testing non-cwd scenarios).
 */
export function loadFilterOverridesFromFile(tomlPath: string, _dir: string): number {
  if (!existsSync(tomlPath)) return 0

  let parsed: Record<string, unknown>
  try {
    const raw = readFileSync(tomlPath, 'utf-8')
    parsed = parseToml(raw) as Record<string, unknown>
  } catch (err) {
    log.warn('filter-overrides:parse-error', {
      path: tomlPath,
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }

  const filtersRaw = parsed.filters
  if (!Array.isArray(filtersRaw) || filtersRaw.length === 0) return 0

  const active = filtersRaw.filter((f: unknown) => {
    const entry = f as TomlFilterEntry
    return entry.enabled !== false
  })

  let registered = 0
  for (const entryRaw of active) {
    const entry = entryRaw as TomlFilterEntry
    if (!entry.name || !Array.isArray(entry.detect) || entry.detect.length === 0) continue
    try {
      registerFilter(
        compileCustomFilter({
          name: entry.name,
          detect: entry.detect,
          keep: entry.keep,
          drop: entry.drop,
          pipeline: entry.pipeline,
          priority: entry.priority,
        }),
      )
      registered++
    } catch (err) {
      log.warn('filter-overrides:compile-error', {
        name: entry.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (registered > 0) {
    log.info('filter-overrides:loaded-from-file', { path: tomlPath, registered })
  }
  return registered
}
