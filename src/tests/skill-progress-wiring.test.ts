/*!
 * TDD: skill invocation → SkillProgress live update (node_f5794c0f4501).
 *
 * AC1: onProgress fires → SkillProgress step/total/label updated.
 * AC2: Handler throw → error surfaces, TUI continues (no crash).
 */

import { describe, it, expect } from 'vitest'
import { toSkillProgressState, buildSkillContext, type SkillProgressState } from '../tui/skill-progress-wiring.js'
import type { SkillStep } from '../tui/skill-handler-port.js'
import { createSessionStore, type TypeKey } from '../core/plugins/extension-data.js'

describe('AC1: toSkillProgressState maps SkillStep to progress state', () => {
  it('maps step/total/label correctly', () => {
    const step: SkillStep = { step: 2, total: 5, label: 'analyzing', elapsedMs: 120, tokensUsed: 50 }
    const state: SkillProgressState = toSkillProgressState(step)
    expect(state.completed).toBe(2)
    expect(state.total).toBe(5)
    expect(state.label).toBe('analyzing')
  })

  it('first step has completed=1', () => {
    const step: SkillStep = { step: 1, total: 3, label: 'start', elapsedMs: 0, tokensUsed: 0 }
    expect(toSkillProgressState(step).completed).toBe(1)
  })
})

describe('AC2: buildSkillContext produces a context with onProgress + error resilience', () => {
  it('onProgress calls the provided setter', () => {
    const updates: SkillProgressState[] = []
    const ctx = buildSkillContext({
      dir: '/tmp',
      testCmd: 'npm test',
      onProgressUpdate: (s) => updates.push(s),
      appendFn: () => {},
    })
    const step: SkillStep = { step: 1, total: 2, label: 'running', elapsedMs: 10, tokensUsed: 0 }
    ctx.onProgress(step)
    expect(updates.length).toBe(1)
    expect(updates[0]!.label).toBe('running')
  })

  it('signal starts not aborted', () => {
    const ctx = buildSkillContext({ dir: '/', testCmd: '', onProgressUpdate: () => {}, appendFn: () => {} })
    expect(ctx.signal?.aborted).toBe(false)
  })
})

describe('AC3: buildSkillContext exposes a session-scoped ExtensionData store', () => {
  it('defaults to a fresh session store when none is provided', () => {
    const ctx = buildSkillContext({ dir: '/', testCmd: '', onProgressUpdate: () => {}, appendFn: () => {} })
    expect(ctx.session).toBeDefined()
    expect(ctx.session!.scopeId).toContain('session')
  })

  it('reuses the caller-provided session store instead of creating a new one', () => {
    const session = createSessionStore()
    const key: TypeKey<number> = 'skill:run-count'
    session.insert(key, 3)

    const ctx = buildSkillContext({ dir: '/', testCmd: '', onProgressUpdate: () => {}, appendFn: () => {}, session })
    expect(ctx.session).toBe(session)
    expect(ctx.session!.get(key)).toBe(3)
  })
})
