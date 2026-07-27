/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { existsSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join, relative } from 'node:path'
import { getSharedHookBus } from './shared-hook-bus.js'
import type { HookDedupStore } from './dedup-store.js'
import type { AgentSource } from './config-loader.js'
import { createLogger } from '../utils/logger.js'
import { shouldIgnorePath, DEFAULT_IGNORE_PATTERNS } from './fs-watcher-hardening.js'

const log = createLogger({ layer: 'core', source: 'fs-watcher.ts' })

/**
 * Sprint M4 (Multi-CLI PRD) — minimal fs-watcher using node:fs.watch.
 *
 * Emits `tool:post-call` with `payload.toolName ∈ {Write, Edit, Delete}`,
 * `payload.filePath` (relative to basePath), and `payload.agentSource`
 * (resolved via inferAgentSource if provided, else 'unknown').
 *
 * Design choices:
 *  - Uses node:fs.watch with `recursive: true` — works on macOS, Windows,
 *    and Linux 6.5+. Avoids adding chokidar as a dep.
 *  - Default ignorePatterns suppress node_modules/.git/dist/.cache.
 *  - Debounce within `debounceMs` per (filePath, eventType).
 *  - Consults dedupStore.shouldEmit before emitting; the MCP path is
 *    expected to call dedupStore.recordEmission first when it handles
 *    an Edit/Write/Delete tool call (Sprint 1.2 + S5.1 wiring extends
 *    here separately).
 */

export interface FsWatcherOptions {
  basePath: string
  ignorePatterns?: RegExp[]
  debounceMs?: number
  dedupStore?: HookDedupStore
  /** Resolve agentSource at emit time (e.g. cursor). Default `unknown`. */
  inferAgentSource?: (filePath: string) => AgentSource
}

/** installFsWatcher —  */
export function installFsWatcher(opts: FsWatcherOptions): () => void {
  if (!existsSync(opts.basePath)) {
    log.warn('hooks:fs-watcher:basepath_missing', { basePath: opts.basePath })
    return () => {
      /* no-op */
    }
  }

  const ignorePatterns = [...(opts.ignorePatterns ?? []), ...DEFAULT_IGNORE_PATTERNS]
  const debounceMs = opts.debounceMs ?? 200
  const inferAgentSource = opts.inferAgentSource ?? (() => 'unknown' as AgentSource)

  const debounceTimers = new Map<string, NodeJS.Timeout>()
  let watcher: FSWatcher | null = null

  try {
    watcher = watch(opts.basePath, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      const rel = filename
      if (shouldIgnorePath(rel, ignorePatterns)) return
      const key = `${eventType}:${rel}`
      const existingTimer = debounceTimers.get(key)
      if (existingTimer) clearTimeout(existingTimer)
      debounceTimers.set(
        key,
        setTimeout(() => {
          debounceTimers.delete(key)
          dispatchChange(opts.basePath, rel, eventType, inferAgentSource, opts.dedupStore)
        }, debounceMs),
      )
    })
  } catch (err) {
    log.warn('hooks:fs-watcher:start_failed', { basePath: opts.basePath, error: String(err) })
    return () => {
      /* no-op */
    }
  }

  log.info('hooks:fs-watcher:installed', { basePath: opts.basePath, ignorePatterns: ignorePatterns.length })

  return () => {
    for (const timer of debounceTimers.values()) clearTimeout(timer)
    debounceTimers.clear()
    watcher?.close()
  }
}

function dispatchChange(
  basePath: string,
  filename: string,
  _eventType: 'rename' | 'change',
  inferAgentSource: (filePath: string) => AgentSource,
  dedupStore: HookDedupStore | undefined,
): void {
  const fullPath = join(basePath, filename)
  let toolName: 'Write' | 'Edit' | 'Delete'
  if (!existsSync(fullPath)) {
    toolName = 'Delete'
  } else {
    try {
      const stat = statSync(fullPath)
      if (!stat.isFile()) return
      // node:fs.watch doesn't reliably distinguish create vs change. Heuristic:
      // if file's birthtime is within last 2 * debounceMs, treat as Write; else Edit.
      const age = Date.now() - stat.birthtimeMs
      toolName = age < 500 ? 'Write' : 'Edit'
    } catch {
      return
    }
  }
  const filePath = relative(basePath, fullPath)
  const agentSource = inferAgentSource(filePath)
  const dedupKey = `${agentSource}:${filePath}:${toolName}`
  if (dedupStore && !dedupStore.shouldEmit(dedupKey)) {
    log.debug('hooks:fs-watcher:dedup_suppressed', { key: dedupKey })
    return
  }
  void getSharedHookBus().emit({
    channel: 'tool:post-call',
    timestamp: new Date().toISOString(),
    payload: {
      toolName,
      filePath,
      agentSource,
      _fromFsWatcher: true,
    },
  })
}
