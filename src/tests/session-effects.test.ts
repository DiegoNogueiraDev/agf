/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkerStateStore } from '../core/worker-state/worker-state-store.js'
import { loadSession } from '../core/session/session-state.js'
import { createSessionEffects } from '../core/session/session-effects.js'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'sess-effects-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('createSessionEffects', () => {
  it('returns a DispatchEffects with persistMode and resolveApproval', () => {
    const effects = createSessionEffects({ cwd: tmp() })
    expect(typeof effects.persistMode).toBe('function')
    expect(typeof effects.resolveApproval).toBe('function')
  })

  it('persistMode updates worker-state permission_mode when present', () => {
    const cwd = tmp()
    const ws = new WorkerStateStore(cwd)
    ws.write({
      worker_id: 'w1',
      session_ref: 's1',
      model: 'sonnet',
      permission_mode: 'workspace-write',
      started_at: '2026-01-01T00:00:00.000Z',
      last_turn_at: '2026-01-01T00:00:00.000Z',
      cwd,
    })
    createSessionEffects({ cwd }).persistMode!('read-only')
    expect(ws.read()?.permission_mode).toBe('read-only')
  })

  it('persistMode is a no-op when no worker-state exists', () => {
    const cwd = tmp()
    expect(() => createSessionEffects({ cwd }).persistMode!('read-only')).not.toThrow()
    expect(new WorkerStateStore(cwd).read()).toBeNull()
  })

  it('resolveApproval clears pendingApproval and records the requestId', () => {
    const cwd = tmp()
    const sessionStatePath = join(cwd, 'session-state.json')
    createSessionEffects({ cwd, sessionStatePath }).resolveApproval!('req-1')
    const state = loadSession(sessionStatePath)
    expect(state?.approvalState.pendingApproval).toBe(false)
    expect(state?.approvalState.approvedActions.some((a) => a.path === 'req-1')).toBe(true)
  })
})
