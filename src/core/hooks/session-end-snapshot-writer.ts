/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * I/O wire for session-end-snapshot.ts's pure functions — registers a
 * session:end listener that gathers real session metrics (node counts via
 * SqliteStore.getStats, cost via summarizeLedger filtered by sessionId),
 * builds the snapshot payload, writes it to workflow-graph/snapshots/, and
 * prunes older files beyond SNAPSHOT_RETENTION.
 *
 * Registered directly against getSharedHookBus() rather than through
 * registerBuiltinHandlers's store-injection path — that path is never
 * actually given a store in production (getSharedHookBus's lazy init calls
 * registerBuiltinHandlers(instance) with no store), so every store-dependent
 * builtin handler is silently inert. Opening a fresh store connection here
 * at session:end fire time avoids depending on that broken injection.
 *
 * Known simplification (documented, not faked): tasksStarted/tasksDone in
 * the payload reflect current global byStatus counts, not a per-session
 * delta — no reliable "started/completed in THIS session" event log exists
 * yet (session_events only watches session:message-update/mode-changed/
 * approval:required, not task:post-start/task:post-complete). harness score
 * defaults to 0/'N/A' — running a full harness scan at process-exit time
 * would risk delaying shutdown.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { SqliteStore } from '../store/sqlite-store.js'
import { summarizeLedger } from '../observability/llm-call-ledger.js'
import { getSharedHookBus } from './shared-hook-bus.js'
import type { HookEvent } from './hook-types.js'
import {
  isSessionSnapshotDisabled,
  buildSnapshotPayload,
  snapshotFilename,
  selectSnapshotsToPrune,
} from './session-end-snapshot.js'
import { STORE_DIR } from '../utils/constants.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'session-end-snapshot-writer.ts' })

function snapshotsDir(dir: string): string {
  return join(dir, STORE_DIR, 'snapshots')
}

/**
 * Register the session:end -> snapshot-file pipeline. `startedAtMs` should be
 * captured once, right after emitSessionStart(), so duration is accurate.
 * Best-effort: any failure is logged and swallowed — a snapshot write must
 * never crash session shutdown.
 */
export function registerSessionEndSnapshot(dir: string, startedAtMs: number): () => void {
  const bus = getSharedHookBus()
  const handler = async (event: HookEvent): Promise<void> => {
    if (isSessionSnapshotDisabled()) return
    try {
      const sessionId = String(event.payload['sessionId'] ?? 'unknown')
      const endedAtMs = Date.now()
      const store = SqliteStore.open(dir)
      try {
        const db = store.getDb()
        const stats = store.getStats()
        const ledger = summarizeLedger(db, { sessionId })

        const payload = buildSnapshotPayload({
          sessionId,
          startedAtMs,
          endedAtMs,
          costUsd: ledger.totals.costUsd,
          tasksStarted: stats.byStatus['in_progress'] ?? 0,
          tasksDone: stats.byStatus['done'] ?? 0,
          nodeCountsByStatus: stats.byStatus,
          harness: { score: 0, grade: 'N/A' },
        })

        const dirPath = snapshotsDir(dir)
        if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
        const filename = snapshotFilename(sessionId, endedAtMs)
        writeFileSync(join(dirPath, filename), JSON.stringify(payload, null, 2) + '\n', 'utf-8')

        const existing = readdirSync(dirPath)
        for (const stale of selectSnapshotsToPrune(existing)) unlinkSync(join(dirPath, stale))

        log.info('session:snapshot:written', { sessionId, filename })
      } finally {
        store.close()
      }
    } catch (err) {
      log.warn('session:snapshot:failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }
  bus.on('session:end', handler)
  return () => bus.off('session:end', handler)
}
