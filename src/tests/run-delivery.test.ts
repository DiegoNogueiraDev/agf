/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_fd76d454494c — runDelivery: loop de orquestração end-to-end. Repete
 * nextDeliveryAction → despacha o handler até done/escalate, com budget e
 * cancelamento. Puro por injeção (handlers fakes = 0 token de LLM).
 */
import { describe, it, expect } from 'vitest'
import { runDelivery, type DeliveryHandlers } from '../core/orchestrator/run-delivery.js'
import type { DeliveryState } from '../core/orchestrator/orchestrator.js'

function st(over: Partial<DeliveryState> = {}): DeliveryState {
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

describe('runDelivery — loop end-to-end (#O2)', () => {
  it("vazio → prontas → done: chama importPrd e implement na ordem, stopped='done'", async () => {
    const calls: string[] = []
    // sequência de estados: 1º vazio, depois prontas, depois done
    const states = [
      st(),
      st({ totalNodes: 3, hasRequirements: true, readyTasks: 1 }),
      st({ totalNodes: 3, hasRequirements: true, doneRatio: 1 }),
    ]
    let i = 0
    const handlers: DeliveryHandlers = {
      importPrd: async () => {
        calls.push('import')
      },
      decompose: async () => {
        calls.push('decompose')
      },
      implement: async () => {
        calls.push('implement')
      },
    }
    const report = await runDelivery(() => states[Math.min(i++, states.length - 1)], handlers, { maxSteps: 10 })
    expect(calls).toEqual(['import', 'implement'])
    expect(report.stopped).toBe('done')
  })

  it("estado idêntico repetido (sem progresso) → stopped='stalled'", async () => {
    const handlers: DeliveryHandlers = {
      importPrd: async () => {},
      decompose: async () => {},
      implement: async () => {},
    }
    // estado sempre o mesmo (implement) e nada muda → estagnação detectada (não queima budget)
    const report = await runDelivery(() => st({ totalNodes: 1, hasRequirements: true, readyTasks: 1 }), handlers, {
      maxSteps: 20,
    })
    expect(report.stopped).toBe('stalled')
    expect(report.steps).toBe(1) // parou no 1º repeat, não em 20
  })

  it("estado muda a cada passo mas nunca conclui → stopped='budget'", async () => {
    const handlers: DeliveryHandlers = {
      importPrd: async () => {},
      decompose: async () => {},
      implement: async () => {},
    }
    // readyTasks decresce a cada passo (estado distinto) mas nunca atinge done
    let n = 100
    const report = await runDelivery(() => st({ totalNodes: 1, hasRequirements: true, readyTasks: n-- }), handlers, {
      maxSteps: 3,
    })
    expect(report.stopped).toBe('budget')
    expect(report.steps).toBe(3)
  })

  it("signal abortado → stopped='aborted'", async () => {
    const handlers: DeliveryHandlers = {
      importPrd: async () => {},
      decompose: async () => {},
      implement: async () => {},
    }
    const report = await runDelivery(() => st({ totalNodes: 1, hasRequirements: true, readyTasks: 1 }), handlers, {
      maxSteps: 10,
      signal: { aborted: true },
    })
    expect(report.stopped).toBe('aborted')
  })

  it("action='escalate' → stopped='escalation'", async () => {
    const handlers: DeliveryHandlers = {
      importPrd: async () => {},
      decompose: async () => {},
      implement: async () => {},
    }
    const report = await runDelivery(() => st({ totalNodes: 5, hasRequirements: true, allBlocked: true }), handlers, {
      maxSteps: 10,
    })
    expect(report.stopped).toBe('escalation')
  })
})
