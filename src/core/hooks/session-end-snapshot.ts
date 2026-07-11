/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T10 — Session-end snapshot.
 * Pure: dado session metrics + node counts + harness score, monta o
 * payload do snapshot serializável e calcula a política de rotação
 * (keep last N, delete older). Caller (hook session:end) persiste em
 * workflow-graph/snapshots/.
 */

export const SNAPSHOT_RETENTION = 30
export const SNAPSHOT_FILENAME_PREFIX = 'session-'

export interface SessionMetricsInput {
  sessionId: string
  startedAtMs: number
  endedAtMs: number
  costUsd: number
  tasksStarted: number
  tasksDone: number
  nodeCountsByStatus: Record<string, number>
  harness: { score: number; grade: string }
}

export interface SessionSnapshotPayload {
  schemaVersion: 1
  sessionId: string
  startedAt: string
  endedAt: string
  durationMs: number
  costUsd: number
  tasksStarted: number
  tasksDone: number
  nodeCountsByStatus: Record<string, number>
  harness: { score: number; grade: string }
}

/** isSessionSnapshotDisabled —  */
export function isSessionSnapshotDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MCP_GRAPH_SESSION_SNAPSHOT === 'off'
}

/** buildSnapshotPayload —  */
export function buildSnapshotPayload(input: SessionMetricsInput): SessionSnapshotPayload {
  return {
    schemaVersion: 1,
    sessionId: input.sessionId,
    startedAt: new Date(input.startedAtMs).toISOString(),
    endedAt: new Date(input.endedAtMs).toISOString(),
    durationMs: Math.max(0, input.endedAtMs - input.startedAtMs),
    costUsd: input.costUsd,
    tasksStarted: input.tasksStarted,
    tasksDone: input.tasksDone,
    nodeCountsByStatus: { ...input.nodeCountsByStatus },
    harness: { ...input.harness },
  }
}

/** snapshotFilename —  */
export function snapshotFilename(sessionId: string, endedAtMs: number): string {
  const ts = new Date(endedAtMs).toISOString().replace(/[:.]/g, '-')
  return `${SNAPSHOT_FILENAME_PREFIX}${ts}-${sessionId}.json`
}

/**
 * Decide which existing snapshot files to delete keeping only the most recent
 * `keep` (default SNAPSHOT_RETENTION). Files are sorted by name ASC; oldest
 * surplus entries are returned. Caller does the unlinking.
 */
export function selectSnapshotsToPrune(files: string[], keep: number = SNAPSHOT_RETENTION): string[] {
  const snapshots = files.filter((f) => f.startsWith(SNAPSHOT_FILENAME_PREFIX) && f.endsWith('.json')).sort()
  if (snapshots.length <= keep) return []
  return snapshots.slice(0, snapshots.length - keep)
}
