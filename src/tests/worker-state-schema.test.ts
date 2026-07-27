import { describe, it, expect } from 'vitest'
import { PermissionModeSchema, WorkerStateSchema } from '../core/worker-state/worker-state-schema.js'

describe('PermissionModeSchema', () => {
  it('accepts all three permission modes', () => {
    for (const m of ['read-only', 'workspace-write', 'danger-full-access']) {
      expect(PermissionModeSchema.safeParse(m).success).toBe(true)
    }
  })

  it('rejects unknown mode', () => {
    expect(PermissionModeSchema.safeParse('admin').success).toBe(false)
    expect(PermissionModeSchema.safeParse('').success).toBe(false)
  })
})

describe('WorkerStateSchema', () => {
  const VALID: Record<string, unknown> = {
    worker_id: 'worker-abc123',
    session_ref: 'session-xyz',
    model: 'claude-sonnet-4-6',
    permission_mode: 'workspace-write',
    started_at: '2026-06-22T00:00:00.000Z',
    last_turn_at: '2026-06-22T00:01:00.000Z',
    cwd: '/workspace/project',
  }

  it('accepts a valid worker state', () => {
    expect(WorkerStateSchema.safeParse(VALID).success).toBe(true)
  })

  it('rejects empty worker_id', () => {
    expect(WorkerStateSchema.safeParse({ ...VALID, worker_id: '' }).success).toBe(false)
  })

  it('rejects invalid permission_mode', () => {
    expect(WorkerStateSchema.safeParse({ ...VALID, permission_mode: 'sudo' }).success).toBe(false)
  })

  it('rejects non-ISO datetime for started_at', () => {
    expect(WorkerStateSchema.safeParse({ ...VALID, started_at: 'not-a-date' }).success).toBe(false)
  })

  it('rejects empty cwd', () => {
    expect(WorkerStateSchema.safeParse({ ...VALID, cwd: '' }).success).toBe(false)
  })
})
