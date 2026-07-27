import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { InteractiveApp } from '../tui/interactive-app.js'
import type { CommandPort, AsyncCommandPort } from '../tui/dispatch.js'
import type { DashboardModel } from '../tui/model.js'
import type { AsyncCommandPort as TAsyncCommandPort } from '../tui/dispatch.js'

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const basePort: CommandPort = {
  findNext: () => ({ id: 'n1', title: 'Soma', reason: 'prioridade alta' }),
  stats: () => ({ totalNodes: 3, byStatus: { done: 1 } }),
  metrics: () => ({ total: 42, costUsd: 0.001, calls: 1 }),
  getPhase: () => 'IMPLEMENT',
  getModel: () => 'claude-sonnet-4.6',
  status: () => 'Status: ok · tokens: 1500',
  listSkills: () => [],
  getSkill: () => undefined,
  principles: () => [{ title: 'λ_flow', category: 'flow', statement: 'λ_flow = λ_base + (α · Φ(t))' }],
  providers: () => ['openai', 'anthropic'],
  providerCurrent: () => 'openai',
  providerSet: vi.fn().mockReturnValue('Provider alterado'),
  providerSetUrl: vi.fn().mockReturnValue('URL alterada'),
  quality: () => ({ testScore: 100, logScore: 100, passed: true, totalModules: 0, darkModules: [] }),
  insights: (sub: string) => (sub ? `Insights for ${sub}` : ''),
  gate: (phase: string) => (phase ? `${phase} gate: ok` : 'gate: ok'),
  learning: (sub: string) => (sub ? `Learning: ${sub}` : ''),
  heal: (arg: string) => (arg ? `Healed: ${arg}` : 'heal: ok'),
  getGraphNodes: () => [],
  cacheStats: () => ({
    sessionHits: 10,
    sessionMisses: 2,
    sessionSize: 8,
    sessionCapacity: 128,
    sessionEvictions: 0,
    toolCacheHits: 5,
    toolCacheMisses: 1,
    toolCacheInvalidations: 0,
    tokensSavedEstimate: 3000,
    costAvoidedUsd: 0.003,
  }),
  algorithms: {
    topologicalSort: () => 'n1 -> n2 -> n3',
    topologicalSortDfs: () => '',
    criticalPath: () => 'n1 -> n3 (3d)',
    dijkstra: () => 'n1 (0) -> n2 (2)',
    bellmanFord: () => '',
    floydWarshall: () => '',
    scc: () => '',
    bfs: () => 'n1 -> n2 -> n3',
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

const dashboard: DashboardModel = {
  projectName: 'demo',
  phase: 'IMPLEMENT',
  modelLabel: 'claude-sonnet-4.6',
  wip: 0,
  tasks: [],
  totalTasks: 0,
  tokens: { total: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0 },
}

function submit(app: ReturnType<typeof render>, cmd: string): Promise<void> {
  app.stdin.write(cmd)
  return delay(100).then(() => {
    app.stdin.write('\r')
    return delay(200)
  })
}

describe('InteractiveApp — expanded commands', () => {
  it('/stats mostra contagem de nós', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/stats')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Nós: 3')
    expect(frame).toContain('done=1')
  })

  it('/metrics mostra tokens e custo', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/metrics')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Tokens: 42')
    expect(frame).toContain('$0.0010')
  })

  it('/status retorna status vivo', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/status')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Status:')
    expect(frame).toContain('tokens')
  })

  it('/phase mostra fase atual', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/phase')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Fase: IMPLEMENT')
  })

  it('/quality mostra score', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/quality')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Qualidade:')
    expect(frame).toContain('testes 100%')
    expect(frame).toContain('95/95 OK')
  })

  it('/providers lista provedores disponíveis', async () => {
    const asyncPort: TAsyncCommandPort = {
      check: async () => '',
      decompose: async () => '',
      importPrd: async () => '',
      runDoctor: async () => '',
      build: async () => '',
      generatePrd: async () => '',
      deliver: async () => '',
      gaps: async () => '',
      savings: async () => '',
      preflight: async () => '',
      brief: async () => '',
      submit: async () => '',
      providerConnect: async () => '',
      providers: () => ['openai', 'anthropic'],
      providerCurrent: () => 'openai',
      providerSet: () => '',
      providerSetUrl: () => '',
    }
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} asyncPort={asyncPort} />)
    await submit(app, '/provider list')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Providers:')
    expect(frame).toContain('openai')
    expect(frame).toContain('anthropic')
  })

  it('/skills retorna mensagem quando vazio', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/skills')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Nenhuma skill encontrada')
  })

  it('/principles lista principios do projeto', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/principles')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('flow')
    expect(frame).toContain('λ_flow')
  })

  it('/next mostra próxima task', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/next')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Soma')
    expect(frame).toContain('prioridade alta')
  })

  it('/cache-stats mostra resumo do cache', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/cache-stats')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('cache-stats')
    expect(frame).toContain('Hits:  10')
    expect(frame).toContain('Misses: 2')
    expect(frame).toContain('Token Savings')
  })
})

describe('InteractiveApp — async commands fallback', () => {
  it('/check mostra fallback sem asyncPort', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/check')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('aguardando')
  })

  it('/doctor mostra fallback sem asyncPort', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/doctor')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('aguardando')
  })

  it('/build mostra fallback sem asyncPort', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/build')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('/build')
  })
})

describe('InteractiveApp — async commands with asyncPort', () => {
  const asyncPort: TAsyncCommandPort = {
    check: async () => 'Check completo: 3 issues encontradas',
    decompose: async () => 'Decomposição: 5 tasks criadas',
    importPrd: async () => 'PRD importado: 12 nodes',
    runDoctor: async () => 'Doctor: tudo ok',
    build: async () => 'Build concluído: 0 erros',
    generatePrd: async () => 'PRD gerado',
    deliver: async () => 'Entrega realizada',
  }

  const asyncSubmit = (app: ReturnType<typeof render>, cmd: string): Promise<void> => {
    app.stdin.write(cmd)
    return delay(100).then(() => {
      app.stdin.write('\r')
      return delay(1500)
    })
  }

  it('/check <id> executa com asyncPort e mostra resultado', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} asyncPort={asyncPort} />)
    await asyncSubmit(app, '/check node_123')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Check completo')
  })

  it('/doctor executa com asyncPort e mostra resultado', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} asyncPort={asyncPort} />)
    await asyncSubmit(app, '/doctor')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Doctor:')
  })

  it('/build <arg> executa com asyncPort e mostra resultado', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} asyncPort={asyncPort} />)
    await asyncSubmit(app, '/build all')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Build concluído')
  })
})

describe('InteractiveApp — algorithm commands', () => {
  it('/topological-sort executa algoritmo', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/topological-sort')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('n1 -> n2 -> n3')
  })

  it('/critical-path executa algoritmo', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/critical-path')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('n1 -> n3')
    expect(frame).toContain('3d')
  })
})

describe('InteractiveApp — health/alive edge cases', () => {
  it('comando desconhecido mostra fallback', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '/nonexistent')
    const frame = app.lastFrame() ?? ''
    expect(frame).toContain('Comando desconhecido')
  })

  it('input vazio não causa erro', async () => {
    const app = render(<InteractiveApp dashboard={dashboard} port={basePort} />)
    await submit(app, '')
    const frame = app.lastFrame() ?? ''
    expect(frame).toBeDefined()
  })
})
