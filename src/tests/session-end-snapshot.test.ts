import { describe, it, expect } from 'vitest'
import {
  SNAPSHOT_RETENTION,
  SNAPSHOT_FILENAME_PREFIX,
  isSessionSnapshotDisabled,
  buildSnapshotPayload,
  snapshotFilename,
  selectSnapshotsToPrune,
} from '../core/hooks/session-end-snapshot.js'
import type { SessionMetricsInput } from '../core/hooks/session-end-snapshot.js'

const baseInput: SessionMetricsInput = {
  sessionId: 'sess-abc',
  startedAtMs: 1_700_000_000_000,
  endedAtMs: 1_700_000_060_000,
  costUsd: 0.05,
  tasksStarted: 3,
  tasksDone: 2,
  nodeCountsByStatus: { backlog: 5, done: 10 },
  harness: { score: 83, grade: 'B' },
}

describe('constants', () => {
  it('SNAPSHOT_RETENTION is positive', () => {
    expect(SNAPSHOT_RETENTION).toBeGreaterThan(0)
  })

  it('SNAPSHOT_FILENAME_PREFIX is a string', () => {
    expect(typeof SNAPSHOT_FILENAME_PREFIX).toBe('string')
  })
})

describe('isSessionSnapshotDisabled', () => {
  it('returns false by default', () => {
    expect(isSessionSnapshotDisabled({})).toBe(false)
  })

  it('returns true when env var is off', () => {
    expect(isSessionSnapshotDisabled({ MCP_GRAPH_SESSION_SNAPSHOT: 'off' })).toBe(true)
  })
})

describe('buildSnapshotPayload', () => {
  it('returns a payload with schemaVersion 1', () => {
    const payload = buildSnapshotPayload(baseInput)
    expect(payload.schemaVersion).toBe(1)
  })

  it('includes sessionId and ISO timestamps', () => {
    const payload = buildSnapshotPayload(baseInput)
    expect(payload.sessionId).toBe('sess-abc')
    expect(payload.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(payload.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('calculates durationMs', () => {
    const payload = buildSnapshotPayload(baseInput)
    expect(payload.durationMs).toBe(60_000)
  })

  it('preserves harness and nodeCountsByStatus', () => {
    const payload = buildSnapshotPayload(baseInput)
    expect(payload.harness.score).toBe(83)
    expect(payload.nodeCountsByStatus.done).toBe(10)
  })
})

describe('snapshotFilename', () => {
  it('starts with SNAPSHOT_FILENAME_PREFIX', () => {
    const name = snapshotFilename('abc', 1_700_000_000_000)
    expect(name.startsWith(SNAPSHOT_FILENAME_PREFIX)).toBe(true)
  })

  it('ends with .json', () => {
    expect(snapshotFilename('abc', 1_700_000_000_000)).toMatch(/\.json$/)
  })

  it('includes sessionId', () => {
    expect(snapshotFilename('my-session', 1_700_000_000_000)).toContain('my-session')
  })
})

describe('selectSnapshotsToPrune', () => {
  it('returns empty when count <= retention', () => {
    const files = ['session-a.json', 'session-b.json']
    expect(selectSnapshotsToPrune(files, 10)).toHaveLength(0)
  })

  it('returns oldest files when over retention', () => {
    const files = ['session-a.json', 'session-b.json', 'session-c.json']
    const pruned = selectSnapshotsToPrune(files, 2)
    expect(pruned).toHaveLength(1)
    expect(pruned[0]).toBe('session-a.json')
  })

  it('ignores non-snapshot files', () => {
    const files = ['other.json', 'session-a.json']
    const pruned = selectSnapshotsToPrune(files, 2)
    expect(pruned).toHaveLength(0)
  })
})
