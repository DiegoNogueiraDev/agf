/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { GrantSchema } from '../schemas/session.schema.js'
import { assembleGrant } from '../core/session/grants.js'

describe('assembleGrant', () => {
  it('denies a write capability under read-only mode with the enforcer reason', () => {
    const grant = assembleGrant(
      'read-only',
      { capability: 'write', cwd: '/ws', targetPath: '/ws/a.ts' },
      { tool: 'edit' },
    )
    expect(grant.verdict).toBe('deny')
    expect(grant.reason).toMatch(/read-only/i)
    expect(GrantSchema.safeParse(grant).success).toBe(true)
  })

  it('flags a sensitive bash command as requiring approval', () => {
    const grant = assembleGrant(
      'danger-full-access',
      { capability: 'shell', toolName: 'bash' },
      { tool: 'bash', input: { command: 'rm -rf /' } },
    )
    expect(grant.approval.requires_approval).toBe(true)
    expect(['high', 'critical']).toContain(grant.approval.severity)
  })

  it('allows a benign read with no approval required', () => {
    const grant = assembleGrant('read-only', { capability: 'read' }, { tool: 'read', input: { file: 'x.ts' } })
    expect(grant.verdict).toBe('allow')
    expect(grant.approval.requires_approval).toBe(false)
  })
})

describe('GrantSchema', () => {
  it('rejects an unknown capability', () => {
    const bad = {
      capability: 'teleport',
      verdict: 'allow',
      reason: '',
      approval: { requires_approval: false, severity: 'low', reason: 'none', matchedPatterns: [] },
    }
    expect(GrantSchema.safeParse(bad).success).toBe(false)
  })
})
