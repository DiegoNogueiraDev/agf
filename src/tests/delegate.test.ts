/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_fc2613ada953 — delegateSubtasks: orquestração de sub-agentes sequencial
 * (WIP=1) com teto de budget de tokens (cost-runaway guard) e cancelamento.
 * Frugal por design — o guard impede estouro. Inspirado no thread-forking do
 * Codex, mas budget-gated. Puro: testável sem SDK/modelo.
 */
import { describe, it, expect } from 'vitest'
import { delegateSubtasks, type DelegateDeps } from '../core/autonomy/delegate.js'

const subtasks = [
  { id: 's1', title: 'A' },
  { id: 's2', title: 'B' },
  { id: 's3', title: 'C' },
]

/** Deps fake: cada subagente "gasta" `cost` tokens e sucede salvo em `failIds`. */
function fakeDeps(cost: number, failIds: string[] = [], calls: string[] = []): DelegateDeps {
  return {
    runSubagent: async (subtask) => {
      calls.push(subtask.id)
      return { success: !failIds.includes(subtask.id), tokensUsed: cost }
    },
  }
}

describe('delegateSubtasks — orquestração gated por budget (#F6)', () => {
  it('todos passam dentro do budget → all_done, completed=N, tokensUsed soma', async () => {
    const r = await delegateSubtasks(subtasks, fakeDeps(100), { totalBudget: 1000 })
    expect(r.stopped).toBe('all_done')
    expect(r.completed).toBe(3)
    expect(r.failed).toBe(0)
    expect(r.tokensUsed).toBe(300)
  })

  it('budget esgota no meio → budget_exhausted e NÃO roda os restantes', async () => {
    const calls: string[] = []
    // reserva de 100/subagente: s1 (rem 150≥100) roda e gasta 100 → rem 50 < 100 → para.
    const r = await delegateSubtasks(subtasks, fakeDeps(100, [], calls), {
      totalBudget: 150,
      minBudgetPerSubagent: 100,
    })
    expect(r.stopped).toBe('budget_exhausted')
    expect(calls).toEqual(['s1'])
  })

  it('signal abortado antes de um subagente → aborted', async () => {
    const calls: string[] = []
    const signal = { aborted: true }
    const r = await delegateSubtasks(subtasks, fakeDeps(10, [], calls), { totalBudget: 1000, signal })
    expect(r.stopped).toBe('aborted')
    expect(calls).toEqual([])
  })

  it('stopOnFailure=true → para no primeiro fracasso (failure)', async () => {
    const calls: string[] = []
    const r = await delegateSubtasks(subtasks, fakeDeps(10, ['s2'], calls), {
      totalBudget: 1000,
      stopOnFailure: true,
    })
    expect(r.stopped).toBe('failure')
    expect(r.failed).toBe(1)
    expect(calls).toEqual(['s1', 's2']) // s3 não roda
  })

  it('sem totalBudget (undefined) → roda todos (não-regressão)', async () => {
    const calls: string[] = []
    const r = await delegateSubtasks(subtasks, fakeDeps(99999, [], calls), {})
    expect(r.stopped).toBe('all_done')
    expect(calls).toEqual(['s1', 's2', 's3'])
  })

  it('runSubagent recebe budgetRemaining decrescente', async () => {
    const seen: number[] = []
    const deps: DelegateDeps = {
      runSubagent: async (_s, budgetRemaining) => {
        seen.push(budgetRemaining)
        return { success: true, tokensUsed: 100 }
      },
    }
    await delegateSubtasks(subtasks, deps, { totalBudget: 1000, minBudgetPerSubagent: 1 })
    expect(seen).toEqual([1000, 900, 800])
  })
})
