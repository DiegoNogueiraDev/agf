/*!
 * Task node_7f5de7d335de — resolveAgentId: flag > env > uuid
 *
 * AC1: Given --agent=x, when resolved, then result is x regardless of env.
 * AC2: Given no flag and AGF_AGENT_ID=y, when resolved, then result is y.
 * AC3: Given neither flag nor env, when resolved, then returns generated uuid.
 */

import { describe, it, expect } from 'vitest'
import { resolveAgentId } from '../core/planner/resolve-agent-id.js'

describe('resolveAgentId', () => {
  it('returns flag value when flag is provided (AC1)', () => {
    expect(resolveAgentId('agent-x', 'env-y', () => 'generated')).toBe('agent-x')
  })

  it('returns env value when no flag (AC2)', () => {
    expect(resolveAgentId(undefined, 'env-y', () => 'generated')).toBe('env-y')
  })

  it('returns generated uuid when no flag and no env (AC3)', () => {
    expect(resolveAgentId(undefined, undefined, () => 'uuid-123')).toBe('uuid-123')
  })

  it('prefers flag over env (AC1)', () => {
    expect(resolveAgentId('flag', 'env', () => 'gen')).toBe('flag')
  })
})
