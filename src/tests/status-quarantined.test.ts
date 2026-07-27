/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_2b3df0f3d72c — E4.1: quarantined status in status_flow
 *
 * AC: quarantined valid from backlog, in_progress, blocked;
 *     quarantined nodes DON'T appear in agf next;
 *     agf stats includes quarantined in byStatus
 */

import { describe, it, expect } from 'vitest'
import { VALID_STATUS_TRANSITIONS, validateStatusTransition } from '../cli/commands/node-cmd.js'

describe('VALID_STATUS_TRANSITIONS for quarantined', () => {
  it('allows backlog → quarantined', () => {
    expect(VALID_STATUS_TRANSITIONS['backlog']).toContain('quarantined')
  })

  it('allows in_progress → quarantined', () => {
    expect(VALID_STATUS_TRANSITIONS['in_progress']).toContain('quarantined')
  })

  it('allows blocked → quarantined', () => {
    expect(VALID_STATUS_TRANSITIONS['blocked']).toContain('quarantined')
  })

  it('does NOT allow done → quarantined', () => {
    const err = validateStatusTransition('done', 'quarantined')
    expect(err).not.toBeNull()
  })

  it('allows quarantined → backlog (recovery path)', () => {
    expect(VALID_STATUS_TRANSITIONS['quarantined']).toContain('backlog')
  })

  it('validateStatusTransition returns null for backlog → quarantined', () => {
    const err = validateStatusTransition('backlog', 'quarantined')
    expect(err).toBeNull()
  })

  it('validateStatusTransition returns error for done → quarantined', () => {
    const err = validateStatusTransition('done', 'quarantined')
    expect(err).not.toBeNull()
    expect(err).toContain('inválida')
  })
})
