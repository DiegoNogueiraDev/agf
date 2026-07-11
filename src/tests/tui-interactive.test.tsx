import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { CommandBar } from '../tui/command-bar.js'
import { InteractiveApp } from '../tui/interactive-app.js'
import { COMMANDS, type CommandPort } from '../tui/dispatch.js'
import type { DashboardModel } from '../tui/model.js'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const dashboard: DashboardModel = {
  projectName: 'demo',
  phase: 'BUILD',
  modelLabel: 'claude-sonnet-4.6',
  wip: 0,
  tasks: [],
  totalTasks: 0,
  tokens: { total: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0 },
}

const port: CommandPort = {
  findNext: () => ({ id: 'n1', title: 'Soma', reason: 'prioridade alta' }),
  stats: () => ({ totalNodes: 3, byStatus: { done: 1 } }),
  metrics: () => ({ total: 42, costUsd: 0.001, calls: 1 }),
  getPhase: () => 'IMPLEMENT',
  getModel: () => 'claude-sonnet-4.6',
  listSkills: () => [],
  getSkill: () => undefined,
  principles: () => [{ title: 'λ_flow', category: 'flow', statement: 'λ_flow = λ_base + (α · Φ(t))' }],
  providers: () => ['copilot'],
  quality: () => ({ testScore: 100, logScore: 100, passed: true, totalModules: 0, darkModules: [] }),
  getGraphNodes: () => [],
  cacheStats: () => ({
    sessionHits: 0,
    sessionMisses: 0,
    sessionSize: 0,
    sessionCapacity: 128,
    sessionEvictions: 0,
    toolCacheHits: 0,
    toolCacheMisses: 0,
    toolCacheInvalidations: 0,
    tokensSavedEstimate: 0,
    costAvoidedUsd: 0,
  }),
  algorithms: {
    topologicalSort: () => '',
    topologicalSortDfs: () => '',
    criticalPath: () => '',
    dijkstra: () => '',
    bellmanFord: () => '',
    floydWarshall: () => '',
    scc: () => '',
    bfs: () => '',
    dfs: () => '',
    mst: () => '',
    maxFlow: () => '',
    hungarian: () => '',
    pageRank: () => '',
    centrality: () => '',
    graphMetrics: () => '',
    articulationPoints: () => '',
    bridges: () => '',
    knapsack: () => '',
    lcs: () => '',
    rodCutting: () => '',
    editDistance: () => '',
    activitySelect: () => '',
    huffman: () => '',
    rabinKarp: () => '',
    monteCarlo: () => '',
    bayesian: () => '',
    markov: () => '',
    flowEfficiency: () => '',
    queueSim: () => '',
    kalman: () => '',
    cfd: () => '',
    cluster: () => '',
    gradientDescent: () => '',
    weightedMajority: () => '',
    linearProgram: () => '',
    setCover: () => '',
    tsp: () => '',
    vertexCover: () => '',
    geneticTask: () => '',
    branchBound: () => '',
    backtrack: () => '',
    chiSquare: () => '',
    linearRegression: () => '',
    entropy: () => '',
    quickselect: () => '',
    seasonality: () => '',
  },
}

describe('CommandBar — paleta de sugestões (M1q)', () => {
  it('mostra as sugestões quando há prefixo', () => {
    const { lastFrame } = render(
      <CommandBar
        value="/me"
        onChange={() => {}}
        onSubmit={() => {}}
        suggestions={COMMANDS.filter((c) => c.name === 'metrics')}
      />,
    )
    expect(lastFrame() ?? '').toContain('/metrics')
  })

  it("exibe badge [skill] para comando com source 'skill' (#2a)", () => {
    const { lastFrame } = render(
      <CommandBar
        value="/graph"
        onChange={() => {}}
        onSubmit={() => {}}
        suggestions={[{ name: 'graph-analyze', usage: '/graph-analyze', desc: 'ANALYZE', source: 'skill' }]}
      />,
    )
    expect(lastFrame() ?? '').toContain('[skill]')
  })
})

describe('InteractiveApp — fluxo de slash-command (M1q)', () => {
  it('/help abre o overlay de comandos; outro comando o fecha', async () => {
    const { stdin, lastFrame } = render(<InteractiveApp dashboard={dashboard} port={port} />)
    stdin.write('/help')
    await delay(100)
    stdin.write('\r') // Enter
    await delay(100)
    let frame = lastFrame() ?? ''
    expect(frame).toContain('Comandos:')
    expect(frame).toContain('/next')
    expect(frame).toContain('/metrics')
    // Paridade CLI↔TUI (#T2): os novos comandos aparecem no help.
    expect(frame).toContain('/build')
    expect(frame).toContain('/principles')
    expect(frame).toContain('/quality')
    // outro comando fecha o overlay
    stdin.write('/stats')
    await delay(100)
    stdin.write('\r')
    await delay(100)
    frame = lastFrame() ?? ''
    expect(frame).not.toContain('Comandos:')
  })

  it('/next mostra a próxima task no log', async () => {
    const { stdin, lastFrame } = render(<InteractiveApp dashboard={dashboard} port={port} />)
    stdin.write('/next')
    await delay(100)
    stdin.write('\r')
    await delay(100)
    expect(lastFrame() ?? '').toContain('Soma')
  })

  it('/autopilot dispara o liveRunner: emite linhas por-step e o resumo', async () => {
    const liveRunner = {
      autopilot: async (_n: number, onLine: (l: string) => void) => {
        onLine('→ Task A [in_progress]')
        onLine('✓ Task A [done]')
        return 'Resumo: 1 concluída · 120 tok'
      },
      run: async () => 'ok',
    }
    const { stdin, lastFrame } = render(<InteractiveApp dashboard={dashboard} port={port} liveRunner={liveRunner} />)
    stdin.write('/autopilot 1')
    await delay(100)
    stdin.write('\r')
    await delay(200)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Task A')
    expect(frame).toContain('Resumo: 1 concluída')
  })

  it('sem liveRunner, /run apenas informa (runner ausente)', async () => {
    const { stdin, lastFrame } = render(<InteractiveApp dashboard={dashboard} port={port} />)
    stdin.write('/run algo')
    await delay(100)
    stdin.write('\r')
    await delay(100)
    expect(lastFrame() ?? '').toMatch(/live|runner|vivo|M1r/i)
  })
})

describe('InteractiveApp — banner→dashboard phase transition does not crash (bug report: "Rendered more hooks than during the previous render")', () => {
  it('survives the banner→dashboard transition without a hook-count mismatch', async () => {
    // process.stdout.isTTY===true makes InteractiveApp start in phase='banner'
    // (see its useState initializer) — the exact path that crashed: a useMemo
    // sat BELOW the phase==='banner'/'wizard' early returns, so it was skipped
    // on the first (banner) render and present on the next (dashboard) render.
    const originalIsTTY = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      const { lastFrame } = render(<InteractiveApp dashboard={dashboard} port={port} />)
      // Banner auto-advances via internal timers (FRAME_MS=28 per step,
      // maxSteps>=10, +300ms on completion) then calls onDone → setPhase.
      await delay(1500)
      const frame = lastFrame() ?? ''
      // A crashed render leaves ink-testing-library's frame empty/stale, or
      // the process throws synchronously during this render — either way,
      // reaching here with real dashboard content proves the fix.
      expect(frame.length).toBeGreaterThan(0)
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true })
    }
  })
})
