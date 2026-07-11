import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { App } from '../tui/app.js'
import type { DashboardModel } from '../tui/model.js'

const model: DashboardModel = {
  projectName: 'demo',
  phase: 'BUILD',
  modelLabel: 'claude-sonnet-4.6',
  wip: 1,
  tasks: [{ id: 'n1', title: 'Implementar soma', status: 'in_progress' }],
  totalTasks: 5,
  tokens: { total: 180, tokensIn: 130, tokensOut: 50, costUsd: 0.0012, calls: 2 },
}

describe('App (TUI) — dashboard read-only (M1p)', () => {
  it('renderiza cabeçalho, fase, modelo e WIP', () => {
    const { lastFrame } = render(<App model={model} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('agent-graph-flow')
    expect(frame).toContain('demo')
    expect(frame).toContain('BUILD')
    expect(frame).toContain('claude-sonnet-4.6')
    expect(frame).toContain('WIP')
  })

  it('lista as tasks ativas com título', () => {
    const { lastFrame } = render(<App model={model} />)
    expect(lastFrame() ?? '').toContain('Implementar soma')
  })

  it('mostra o painel de tokens com total e custo', () => {
    const { lastFrame } = render(<App model={model} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Tokens:')
    expect(frame).toContain('180')
    expect(frame).toContain('$0.0012')
  })

  it('estado vazio (sem tasks) não quebra', () => {
    const empty: DashboardModel = { ...model, tasks: [], totalTasks: 0, wip: 0, phase: '—' }
    const { lastFrame } = render(<App model={empty} />)
    expect(lastFrame() ?? '').toContain('nenhuma task ativa')
  })
})
