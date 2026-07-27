/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { validateStatusTransition, VALID_STATUS_TRANSITIONS } from '../../cli/commands/node-cmd.js'

describe('node-cmd — validateStatusTransition', () => {
  it('mesmo estado retorna null', () => {
    expect(validateStatusTransition('backlog', 'backlog')).toBeNull()
    expect(validateStatusTransition('done', 'done')).toBeNull()
  })

  it('backlog → ready é válido', () => {
    expect(validateStatusTransition('backlog', 'ready')).toBeNull()
  })

  it('backlog → in_progress é válido', () => {
    expect(validateStatusTransition('backlog', 'in_progress')).toBeNull()
  })

  it('backlog → blocked é válido', () => {
    expect(validateStatusTransition('backlog', 'blocked')).toBeNull()
  })

  it('ready → in_progress é válido', () => {
    expect(validateStatusTransition('ready', 'in_progress')).toBeNull()
  })

  it('in_progress → done é válido', () => {
    expect(validateStatusTransition('in_progress', 'done')).toBeNull()
  })

  it('done → in_progress (reabertura) é válido', () => {
    expect(validateStatusTransition('done', 'in_progress')).toBeNull()
  })

  it('done → backlog é inválido', () => {
    const err = validateStatusTransition('done', 'backlog')
    expect(err).toContain('Transição inválida')
    expect(err).toContain('done')
    expect(err).toContain('backlog')
  })

  it('blocked → ready é válido', () => {
    expect(validateStatusTransition('blocked', 'ready')).toBeNull()
  })

  it('quarantined → backlog é válido', () => {
    expect(validateStatusTransition('quarantined', 'backlog')).toBeNull()
  })

  it('status inválido retorna erro', () => {
    const result = validateStatusTransition('nonexistent' as never, 'done')
    expect(result).toContain('Transição inválida')
  })
})

describe('node-cmd — VALID_STATUS_TRANSITIONS', () => {
  it('cobre todos os status esperados', () => {
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('backlog')
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('ready')
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('in_progress')
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('blocked')
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('done')
    expect(VALID_STATUS_TRANSITIONS).toHaveProperty('quarantined')
  })
})
