/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_850e6a8d351d — nextDeliveryAction: a "skill mestre" como máquina de
 * estados determinística. Decide a próxima ação de entrega a partir do estado
 * do grafo. Pura.
 */
import { describe, it, expect } from 'vitest'
import { nextDeliveryAction, type DeliveryState } from '../core/orchestrator/orchestrator.js'

function state(over: Partial<DeliveryState> = {}): DeliveryState {
  return {
    totalNodes: 0,
    hasRequirements: false,
    oversizedCount: 0,
    readyTasks: 0,
    inProgress: 0,
    allBlocked: false,
    doneRatio: 0,
    ...over,
  }
}

describe('nextDeliveryAction — orquestração determinística (#O1)', () => {
  it('grafo vazio → import_prd', () => {
    expect(nextDeliveryAction(state({ totalNodes: 0 })).action).toBe('import_prd')
  })

  it('sem requirements (mesmo com nodes) → import_prd', () => {
    expect(nextDeliveryAction(state({ totalNodes: 3, hasRequirements: false })).action).toBe('import_prd')
  })

  it('epics oversized sem subtasks → decompose', () => {
    expect(nextDeliveryAction(state({ totalNodes: 3, hasRequirements: true, oversizedCount: 1 })).action).toBe(
      'decompose',
    )
  })

  it('tasks prontas desbloqueadas → implement', () => {
    expect(nextDeliveryAction(state({ totalNodes: 5, hasRequirements: true, readyTasks: 2 })).action).toBe('implement')
  })

  it('nada pronto mas há in_progress → implement', () => {
    expect(
      nextDeliveryAction(state({ totalNodes: 5, hasRequirements: true, readyTasks: 0, inProgress: 1 })).action,
    ).toBe('implement')
  })

  it('todas as tasks done → done', () => {
    expect(nextDeliveryAction(state({ totalNodes: 5, hasRequirements: true, doneRatio: 1 })).action).toBe('done')
  })

  it('todas bloqueadas → escalate', () => {
    expect(nextDeliveryAction(state({ totalNodes: 5, hasRequirements: true, allBlocked: true })).action).toBe(
      'escalate',
    )
  })

  it('decompose tem precedência sobre implement', () => {
    expect(
      nextDeliveryAction(state({ totalNodes: 5, hasRequirements: true, oversizedCount: 1, readyTasks: 3 })).action,
    ).toBe('decompose')
  })

  it('toda ação traz um reason não-vazio', () => {
    expect(nextDeliveryAction(state()).reason.length).toBeGreaterThan(0)
  })
})
