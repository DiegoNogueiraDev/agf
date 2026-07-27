import { describe, it, expect } from 'vitest'
import { buildDashboardModel, type DashboardInput } from '../tui/model.js'

const base: DashboardInput = {
  projectName: 'demo',
  stats: { totalNodes: 10, byStatus: { backlog: 3, ready: 2, in_progress: 1, done: 4 } },
  tasks: [{ id: 'n1', title: 'Soma', status: 'in_progress' }],
  tokens: { total: 180, tokensIn: 130, tokensOut: 50, costUsd: 0.0012, calls: 2 },
  modelLabel: 'claude-sonnet-4.6',
}

describe('buildDashboardModel — projeção pura do estado (M1p)', () => {
  it('calcula WIP a partir de in_progress e passa tasks/tokens adiante', () => {
    const m = buildDashboardModel(base)
    expect(m.wip).toBe(1)
    expect(m.totalTasks).toBe(10)
    expect(m.tasks).toHaveLength(1)
    expect(m.tokens.total).toBe(180)
    expect(m.modelLabel).toBe('claude-sonnet-4.6')
  })

  it('detecta uma fase canônica quando há nós', () => {
    const m = buildDashboardModel(base)
    expect(['SHAPE', 'BUILD', 'SHIP']).toContain(m.phase)
  })

  it("grafo vazio → fase '—' e WIP 0 (não quebra)", () => {
    const m = buildDashboardModel({ ...base, stats: { totalNodes: 0, byStatus: {} }, tasks: [] })
    expect(m.phase).toBe('—')
    expect(m.wip).toBe(0)
    expect(m.tasks).toEqual([])
  })
})
