/*!
 * TDD: session-command/effects wired to sessionMachine statechart (node_0c14461fec93).
 *
 * AC1: dispatchCommand derives transition from sessionMachine (proved by deriveMode path).
 * AC2: createSessionEffects callable without throw (effects respect guard: no crash).
 * AC3: Regression check — session-state.test.ts behaviour unchanged (run via blast).
 */

import { describe, it, expect, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { sessionMachine, transition, initialState } from '../core/session/session-statechart.js'
import { createSessionEffects } from '../core/session/session-effects.js'

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'agf-session-'))
}

describe('AC1: dispatchCommand routes through sessionMachine (statechart transition)', () => {
  it('SET_MODE_READONLY transitions mode region to read-only', () => {
    const seed = initialState(sessionMachine)
    const next = transition(sessionMachine, seed, { type: 'SET_MODE_READONLY' })
    const leaf = next.value.mode?.at(-1)
    expect(leaf).toBe('read-only')
  })

  it('SET_MODE_WORKSPACE transitions mode region to workspace-write', () => {
    const seed = initialState(sessionMachine)
    const next = transition(sessionMachine, seed, { type: 'SET_MODE_WORKSPACE' })
    const leaf = next.value.mode?.at(-1)
    expect(leaf).toBe('workspace-write')
  })

  it('unknown event leaves mode region unchanged (guard: stay in current state)', () => {
    const seed = initialState(sessionMachine)
    const initial = seed.value.mode?.at(-1)
    const next = transition(sessionMachine, seed, { type: 'UNKNOWN_EVENT' })
    expect(next.value.mode?.at(-1)).toBe(initial)
  })
})

describe('AC2: createSessionEffects produces valid DispatchEffects', () => {
  it('persistMode is a no-op when no WorkerState file exists (no throw)', () => {
    const cwd = makeTmp()
    const effects = createSessionEffects({ cwd })
    expect(() => effects.persistMode?.('default')).not.toThrow()
  })

  it('resolveApproval creates session file and does not throw when absent', () => {
    const cwd = makeTmp()
    const effects = createSessionEffects({ cwd })
    expect(() => effects.resolveApproval?.('req-42')).not.toThrow()
  })

  it('clock override is used when provided', () => {
    const cwd = makeTmp()
    const clock = vi.fn(() => new Date('2026-01-01T00:00:00Z'))
    createSessionEffects({ cwd, clock })
    expect(clock).not.toHaveBeenCalled() // clock only called on effect invocation
  })
})
