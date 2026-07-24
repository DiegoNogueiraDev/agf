/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { SessionIdentitySchema, SessionSchema, type SessionIdentity, type Session } from '../schemas/session.schema.js'

describe('SessionIdentitySchema', () => {
  const valid: SessionIdentity = {
    sessionId: 'sess_abc123',
    workerId: 'worker_1',
    agentRole: 'implementor',
    workspace: '/Users/dev/project',
  }

  it('parses a fully-populated identity', () => {
    const result = SessionIdentitySchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('accepts agentRole:null (no role assigned yet)', () => {
    const result = SessionIdentitySchema.safeParse({ ...valid, agentRole: null })
    expect(result.success).toBe(true)
  })

  it('rejects empty sessionId', () => {
    expect(SessionIdentitySchema.safeParse({ ...valid, sessionId: '' }).success).toBe(false)
  })

  it('rejects empty workerId', () => {
    expect(SessionIdentitySchema.safeParse({ ...valid, workerId: '' }).success).toBe(false)
  })

  it('rejects empty workspace', () => {
    expect(SessionIdentitySchema.safeParse({ ...valid, workspace: '' }).success).toBe(false)
  })

  it('rejects an invalid agentRole', () => {
    expect(SessionIdentitySchema.safeParse({ ...valid, agentRole: 'wizard' }).success).toBe(false)
  })

  it('exposes the three canonical roles', () => {
    for (const role of ['implementor', 'reviewer', 'validator'] as const) {
      expect(SessionIdentitySchema.safeParse({ ...valid, agentRole: role }).success).toBe(true)
    }
  })
})

describe('SessionSchema', () => {
  const session: Session = {
    identity: { sessionId: 'sess_1', workerId: 'w1', agentRole: 'implementor', workspace: '/ws' },
    thread: { id: 'thr_1', model: 'sonnet', modelProvider: 'anthropic', cwd: '/ws', agentRole: 'implementor' },
    mode: 'workspace-write',
    model: { id: 'sonnet', provider: 'anthropic', tier: 'build' },
    run: {
      runId: 'run_1',
      status: 'active',
      startedAt: 1,
      endedAt: null,
      budget: { scope: 'run', currentUsd: 0, capUsd: 5 },
    },
    grants: [],
  }

  it('parses a fully-populated session', () => {
    expect(SessionSchema.safeParse(session).success).toBe(true)
  })

  it('accepts run:null (no active run)', () => {
    expect(SessionSchema.safeParse({ ...session, run: null }).success).toBe(true)
  })

  it('rejects an invalid permission mode', () => {
    expect(SessionSchema.safeParse({ ...session, mode: 'god-mode' }).success).toBe(false)
  })

  it('fails the whole parse when nested identity is invalid', () => {
    const bad = { ...session, identity: { ...session.identity, sessionId: '' } }
    expect(SessionSchema.safeParse(bad).success).toBe(false)
  })
})
