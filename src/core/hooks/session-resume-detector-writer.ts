/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * I/O wire for session-resume-detector.ts's pure computeResumeDelta — reads
 * last_session_ts from project_settings, queries nodes modified since then
 * (SqliteStore) and git commits since then (git log), computes the resume
 * delta, and (when resume:true) logs it. Always writes last_session_ts =
 * now at the end, for the NEXT session's comparison.
 *
 * Registered directly against getSharedHookBus() rather than through
 * registerBuiltinHandlers's store-injection path — that path is never given
 * a store in production (see session-end-snapshot-writer.ts's docblock for
 * the full finding), so this opens its own fresh store connection instead.
 */

import { execSync } from 'node:child_process'
import { SqliteStore } from '../store/sqlite-store.js'
import { getSharedHookBus } from './shared-hook-bus.js'
import type { HookEvent } from './hook-types.js'
import { isSessionResumeDisabled, computeResumeDelta, type NodeRef, type CommitRef } from './session-resume-detector.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'session-resume-detector-writer.ts' })

const LAST_SESSION_SETTING_KEY = 'last_session_ts'

export function queryNodesUpdatedSince(store: SqliteStore, sinceMs: number): NodeRef[] {
  const rows = store
    .getDb()
    .prepare('SELECT id, title, updated_at FROM nodes WHERE updated_at > ? AND archived = 0')
    .all(sinceMs) as Array<{ id: string; title: string; updated_at: number }>
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAtMs: r.updated_at }))
}

/** Commits since `sinceMs` in `dir`'s git repo. Fail-open: [] on any git error. */
export function queryCommitsSince(dir: string, sinceMs: number): CommitRef[] {
  try {
    const sinceIso = new Date(sinceMs).toISOString()
    const out = execSync(`git log --since="${sinceIso}" --format=%H%x1f%s%x1f%at`, {
      cwd: dir,
      encoding: 'utf-8',
    })
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, message, epochSec] = line.split('\x1f')
        return { sha, message, timestampMs: Number(epochSec) * 1000 }
      })
  } catch {
    return []
  }
}

/**
 * Register the session:start -> resume-delta detection pipeline. Best-effort:
 * any failure is logged and swallowed — never breaks CLI startup.
 */
export function registerSessionResumeDetector(dir: string): () => void {
  const bus = getSharedHookBus()
  const handler = async (_event: HookEvent): Promise<void> => {
    if (isSessionResumeDisabled()) return
    try {
      const store = SqliteStore.open(dir)
      try {
        const lastSessionRaw = store.getProjectSetting(LAST_SESSION_SETTING_KEY)
        const lastSessionMs = lastSessionRaw ? Number(lastSessionRaw) : undefined
        const nowMs = Date.now()

        const delta = computeResumeDelta({
          lastSessionMs,
          nowMs,
          nodes: lastSessionMs === undefined ? [] : queryNodesUpdatedSince(store, lastSessionMs),
          commits: lastSessionMs === undefined ? [] : queryCommitsSince(dir, lastSessionMs),
        })

        if (delta.resume) {
          log.info('session:resume-delta', {
            gapMs: delta.gapMs,
            nodesModified: delta.nodesModified.length,
            commits: delta.commits.length,
          })
        }

        store.setProjectSetting(LAST_SESSION_SETTING_KEY, String(nowMs))
      } finally {
        store.close()
      }
    } catch (err) {
      log.warn('session:resume-delta:failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  bus.on('session:start', handler)
  return () => bus.off('session:start', handler)
}
