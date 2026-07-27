/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_1a790e14ffc8 (F9 follow-up): dispatch-ports.ts (runReadCommand +
 * runAsyncCommand, 556 lines) had zero test coverage despite being the TUI's
 * command-dispatch critical path. Both functions take a narrow, DIP-friendly
 * port interface — trivially fakeable, no real I/O needed.
 */
import { describe, it, expect, vi } from 'vitest'
import { runReadCommand, runAsyncCommand, type CommandPort, type AsyncCommandPort } from '../tui/dispatch-ports.js'
import type { AlgorithmsPort } from '../tui/algorithms-port.js'
import type { ParsedCommand } from '../tui/dispatch-parsing.js'

function parsed(cmd: string, args = ''): ParsedCommand {
  return { cmd, args }
}

const fakeAlgorithms: AlgorithmsPort = {
  topologicalSort: () => 'topo',
  topologicalSortDfs: () => 'topo-dfs',
  criticalPath: () => 'critical-path-result',
  dijkstra: (src, target) => `dijkstra:${src}->${target}`,
  bellmanFord: (src) => `bellman:${src}`,
  floydWarshall: () => 'floyd',
  scc: () => 'scc',
  bfs: (src) => `bfs:${src}`,
  dfs: (src) => `dfs:${src}`,
  mst: () => 'mst',
  maxFlow: (src, sink) => `maxflow:${src}->${sink}`,
  hungarian: (m) => `hungarian:${m ?? 'default'}`,
  pageRank: () => 'pagerank',
  centrality: () => 'centrality',
  graphMetrics: () => 'graph-metrics',
  articulationPoints: () => 'articulation-points',
  bridges: () => 'bridges',
  knapsack: (cap) => `knapsack:${cap}`,
  lcs: (a, b) => `lcs:${a},${b}`,
  rodCutting: (len) => `rod-cutting:${len}`,
  editDistance: (a, b) => `edit-distance:${a},${b}`,
  activitySelect: () => 'activity-select',
  huffman: () => 'huffman',
  rabinKarp: (pat, text) => `rabin-karp:${pat},${text}`,
  suffixSearch: (pat, text) => `suffix-search:${pat},${text}`,
  monteCarlo: (arg) => `monte-carlo:${arg}`,
  bayesian: (p, l, e) => `bayesian:${p},${l},${e}`,
  markov: (arg) => `markov:${arg}`,
  flowEfficiency: () => 'flow-efficiency',
  queueSim: (a, s) => `queue-sim:${a},${s}`,
  kalman: (arg) => `kalman:${arg}`,
  cfd: () => 'cfd',
  cluster: (arg) => `cluster:${arg}`,
  gradientDescent: () => 'gradient-descent',
  weightedMajority: () => 'weighted-majority',
  linearProgram: () => 'linear-program',
  setCover: () => 'set-cover',
  tsp: () => 'tsp',
  vertexCover: () => 'vertex-cover',
  geneticTask: (pop, gen) => `genetic:${pop},${gen}`,
  branchBound: (arg) => `branch-bound:${arg ?? 'default'}`,
  backtrack: () => 'backtrack',
  chiSquare: (a, b) => `chi-square:${a},${b}`,
  linearRegression: (arg) => `linear-regression:${arg}`,
  entropy: () => 'entropy',
  quickselect: (arg) => `quickselect:${arg}`,
  seasonality: (arg) => `seasonality:${arg}`,
}

function makeCommandPort(overrides: Partial<CommandPort> = {}): CommandPort {
  return {
    findNext: () => ({ id: 'n1', title: 'Next task', reason: 'priority' }),
    stats: () => ({ totalNodes: 10, byStatus: { done: 7, backlog: 3 } }),
    metrics: () => ({ total: 1000, costUsd: 0.05, calls: 3 }),
    status: () => 'status-text',
    getPhase: () => 'IMPLEMENT',
    getModel: () => 'sonnet',
    listSkills: () => [],
    getSkill: (name) => (name === 'known' ? { name: 'known', body: 'skill body' } : undefined),
    principles: () => [{ title: 'T1', category: 'C1', statement: 'S1' }],
    providers: () => ['anthropic', 'openai'],
    providerCurrent: () => 'anthropic',
    providerSet: (id) => `set:${id}`,
    providerSetUrl: (url) => `url:${url}`,
    quality: () => ({ testScore: 90, logScore: 80, passed: true, totalModules: 100, darkModules: [] }),
    insights: (sub) => `insights:${sub}`,
    gate: (phase) => `gate:${phase}`,
    learning: (sub) => `learning:${sub}`,
    heal: (arg) => `heal:${arg}`,
    getGraphNodes: () => [],
    cacheStats: () => ({
      sessionHits: 8,
      sessionMisses: 2,
      sessionSize: 5,
      sessionCapacity: 20,
      sessionEvictions: 0,
      toolCacheHits: 4,
      toolCacheMisses: 1,
      toolCacheInvalidations: 0,
      tokensSavedEstimate: 500,
      costAvoidedUsd: 0.01,
    }),
    algorithms: fakeAlgorithms,
    ...overrides,
  }
}

describe('runReadCommand', () => {
  it('next: reports the next unblocked task', () => {
    const port = makeCommandPort()
    expect(runReadCommand(port, parsed('next'))).toContain('Next task')
  })

  it('next: reports no task available when null', () => {
    const port = makeCommandPort({ findNext: () => null })
    expect(runReadCommand(port, parsed('next'))).toBe('Nenhuma task disponível.')
  })

  it('next: reports blocked when everything is blocked', () => {
    const port = makeCommandPort({ findNext: () => ({ blocked: true }) })
    expect(runReadCommand(port, parsed('next'))).toBe('Todas as tasks estão bloqueadas.')
  })

  it('stats: formats totalNodes and byStatus counts', () => {
    const port = makeCommandPort()
    const result = runReadCommand(port, parsed('stats'))
    expect(result).toContain('10')
    expect(result).toContain('done=7')
  })

  it('metrics: formats tokens, cost, and call count', () => {
    const port = makeCommandPort()
    const result = runReadCommand(port, parsed('metrics'))
    expect(result).toContain('1000')
    expect(result).toContain('$0.0500')
  })

  it('status: delegates directly to port.status()', () => {
    expect(runReadCommand(makeCommandPort(), parsed('status'))).toBe('status-text')
  })

  it('phase: reports the current phase', () => {
    expect(runReadCommand(makeCommandPort(), parsed('phase'))).toContain('IMPLEMENT')
  })

  it('model: reports the current model', () => {
    expect(runReadCommand(makeCommandPort(), parsed('model'))).toContain('sonnet')
  })

  it('skill: requires an argument', () => {
    expect(runReadCommand(makeCommandPort(), parsed('skill'))).toBe('Uso: /skill <nome>')
  })

  it('skill: reports not found for an unknown skill', () => {
    expect(runReadCommand(makeCommandPort(), parsed('skill', 'unknown'))).toContain('não encontrada')
  })

  it('skill: renders the skill body when found', () => {
    expect(runReadCommand(makeCommandPort(), parsed('skill', 'known'))).toContain('skill body')
  })

  it('principles: lists each principle', () => {
    expect(runReadCommand(makeCommandPort(), parsed('principles'))).toContain('T1')
  })

  it('quality: reports pass/fail with scores', () => {
    const result = runReadCommand(makeCommandPort(), parsed('quality'))
    expect(result).toContain('90%')
    expect(result).toContain('OK')
  })

  it('insights/gate/learning/heal: pass args through to the port', () => {
    const port = makeCommandPort()
    expect(runReadCommand(port, parsed('insights', 'bottlenecks'))).toBe('insights:bottlenecks')
    expect(runReadCommand(port, parsed('gate', 'design'))).toBe('gate:design')
    expect(runReadCommand(port, parsed('learning', 'stats'))).toBe('learning:stats')
    expect(runReadCommand(port, parsed('heal', 'graph'))).toBe('heal:graph')
  })

  it('help: lists every command with usage and description', () => {
    expect(runReadCommand(makeCommandPort(), parsed('help'))).toContain('/next')
  })

  it('surface: resolves a valid intent', () => {
    const result = runReadCommand(makeCommandPort(), parsed('surface', 'doc'))
    expect(result).toContain('[surface]')
  })

  it("surface: an unrecognized intent falls back to decideOutput's conservative default, never throws", () => {
    const result = runReadCommand(makeCommandPort(), parsed('surface', 'not-a-real-intent'))
    expect(result).toContain('[surface]')
    expect(result).toContain('markdown')
  })

  it('cache-stats: computes hit rate from hits/misses', () => {
    const result = runReadCommand(makeCommandPort(), parsed('cache-stats'))
    expect(result).toContain('Hits:  8')
    expect(result).toContain('80.0%')
  })

  it('dijkstra: splits args into source/target and delegates to algorithms port', () => {
    expect(runReadCommand(makeCommandPort(), parsed('dijkstra', 'A B'))).toBe('dijkstra:A->B')
  })

  it('lcs: splits args into two strings for the algorithms port', () => {
    expect(runReadCommand(makeCommandPort(), parsed('lcs', 'ABC DEF'))).toBe('lcs:ABC,DEF')
  })

  it('edit-distance: defaults to empty strings when args are missing', () => {
    expect(runReadCommand(makeCommandPort(), parsed('edit-distance', ''))).toBe('edit-distance:,')
  })

  it('dashboard: renders a summary block with stats, phase, model, and cache', () => {
    const result = runReadCommand(makeCommandPort(), parsed('dashboard'))
    expect(result).toContain('Total nodes: 10')
    expect(result).toContain('IMPLEMENT')
  })

  it('token-budget: renders usage and cost', () => {
    const result = runReadCommand(makeCommandPort(), parsed('token-budget'))
    expect(result).toContain('Tokens used: 1,000')
  })

  it('cost-forecast: renders current cost and model', () => {
    const result = runReadCommand(makeCommandPort(), parsed('cost-forecast'))
    expect(result).toContain('$0.0500')
  })

  it('cache-heatmap: renders session/tool hit-miss counts', () => {
    const result = runReadCommand(makeCommandPort(), parsed('cache-heatmap'))
    expect(result).toContain('8H / 2M')
  })

  it('workflow-viz: renders the pipeline with current phase and done percentage', () => {
    const result = runReadCommand(makeCommandPort(), parsed('workflow-viz'))
    expect(result).toContain('IMPLEMENT')
    expect(result).toContain('70%')
  })

  it('lifecycle passthrough commands echo the equivalent agf CLI invocation', () => {
    expect(runReadCommand(makeCommandPort(), parsed('spec', 'list-templates'))).toContain('agf spec')
    expect(runReadCommand(makeCommandPort(), parsed('swarm'))).toBe('Uso: /swarm <goal> [--agents <n>]')
    expect(runReadCommand(makeCommandPort(), parsed('swarm', 'ship it'))).toContain('agf swarm')
  })

  it('empty command: prompts the user to type a command', () => {
    expect(runReadCommand(makeCommandPort(), parsed(''))).toContain('/help')
  })

  it('unknown command: reports it as unrecognized', () => {
    expect(runReadCommand(makeCommandPort(), parsed('not-a-real-command'))).toContain('Comando desconhecido')
  })
})

function makeAsyncPort(overrides: Partial<AsyncCommandPort> = {}): AsyncCommandPort {
  return {
    check: vi.fn(async (id: string) => `check:${id}`),
    decompose: vi.fn(async () => 'decompose-result'),
    importPrd: vi.fn(async (file: string) => `import-prd:${file}`),
    runDoctor: vi.fn(async () => 'doctor-result'),
    build: vi.fn(async (arg: string) => `build:${arg}`),
    generatePrd: vi.fn(async (desc: string) => `generate-prd:${desc}`),
    deliver: vi.fn(async (req: string) => `deliver:${req}`),
    gaps: vi.fn(async (severity?: string) => `gaps:${severity ?? 'all'}`),
    savings: vi.fn(async (reset?: boolean) => `savings:${reset ? 'reset' : 'show'}`),
    preflight: vi.fn(async (topic: string) => `preflight:${topic}`),
    brief: vi.fn(async (id: string) => `brief:${id}`),
    submit: vi.fn(async (id: string) => `submit:${id}`),
    providerConnect: vi.fn(async (id: string, key?: string) => `connect:${id}:${key ?? 'none'}`),
    providers: () => ['anthropic', 'openai'],
    providerCurrent: () => 'anthropic',
    providerSet: (id) => `set:${id}`,
    providerSetUrl: (url) => `url:${url}`,
    loopStart: vi.fn(async (payload: string, every: string) => `loop-start:${payload}:${every}`),
    loopStop: vi.fn(async (target: string) => `loop-stop:${target}`),
    agfStart: vi.fn(async () => 'agf-start-result'),
    feedback: vi.fn(async (msg: string) => `feedback:${msg}`),
    ...overrides,
  }
}

const noop = (): void => {}

describe('runAsyncCommand', () => {
  it('start: delegates to agfStart', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('start'), noop)).toBe('agf-start-result')
  })

  it('check: requires a nodeId argument', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('check'), noop)).toBe('Uso: /check <nodeId>')
  })

  it('check: delegates to port.check with the nodeId', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('check', 'node_1'), noop)).toBe('check:node_1')
  })

  it('decompose: delegates with no args', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('decompose'), noop)).toBe('decompose-result')
  })

  it('import-prd: requires a file path', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('import-prd'), noop)).toContain('Uso:')
  })

  it('import-prd: delegates with the file path', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('import-prd', 'prd.md'), noop)).toBe('import-prd:prd.md')
  })

  it('doctor: delegates to runDoctor', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('doctor'), noop)).toBe('doctor-result')
  })

  it('build: delegates with the raw args', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('build', 'target'), noop)).toBe('build:target')
  })

  it('generate-prd: requires a description', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('generate-prd'), noop)).toContain('Uso:')
  })

  it('generate-prd: delegates with the description', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('generate-prd', 'a CLI tool'), noop)).toBe(
      'generate-prd:a CLI tool',
    )
  })

  it('deliver: requires a request', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('deliver'), noop)).toContain('Uso:')
  })

  it('deliver: delegates with the request', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('deliver', 'crie um kanban'), noop)).toBe(
      'deliver:crie um kanban',
    )
  })

  it('gaps: passes undefined severity when no args given', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('gaps'), noop)).toBe('gaps:all')
  })

  it('savings: detects the --reset flag', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('savings', '--reset'), noop)).toBe('savings:reset')
    expect(await runAsyncCommand(makeAsyncPort(), parsed('savings'), noop)).toBe('savings:show')
  })

  it('preflight: requires a topic', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('preflight'), noop)).toContain('Uso:')
  })

  it('preflight: delegates with the topic', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('preflight', 'auth flow'), noop)).toBe('preflight:auth flow')
  })

  it('brief: requires an id', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('brief'), noop)).toContain('Uso:')
  })

  it('brief: delegates with the id', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('brief', 'node_1'), noop)).toBe('brief:node_1')
  })

  it('submit: requires an id', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('submit'), noop)).toContain('Uso:')
  })

  it('submit: delegates with the id', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('submit', 'node_1'), noop)).toBe('submit:node_1')
  })

  it('feedback: requires a message', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('feedback'), noop)).toContain('Uso:')
  })

  it('feedback: delegates with the message', async () => {
    expect(await runAsyncCommand(makeAsyncPort(), parsed('feedback', 'bug: crashes on start'), noop)).toBe(
      'feedback:bug: crashes on start',
    )
  })

  describe('provider subcommand', () => {
    it('lists providers and the active one when no subcommand is given', async () => {
      const result = await runAsyncCommand(makeAsyncPort(), parsed('provider'), noop)
      expect(result).toContain('anthropic, openai')
      expect(result).toContain('Ativo: anthropic')
    })

    it('"current" reports the active provider only', async () => {
      expect(await runAsyncCommand(makeAsyncPort(), parsed('provider', 'current'), noop)).toBe('anthropic')
    })

    it('"use <id>" sets the provider', async () => {
      expect(await runAsyncCommand(makeAsyncPort(), parsed('provider', 'use openai'), noop)).toBe('set:openai')
    })

    it('"use <id> <base-url>" also sets the base URL', async () => {
      const result = await runAsyncCommand(makeAsyncPort(), parsed('provider', 'use ollama http://x'), noop)
      expect(result).toContain('set:ollama')
      expect(result).toContain('url:http://x')
    })

    it('"set-url <url>" sets only the base URL', async () => {
      expect(await runAsyncCommand(makeAsyncPort(), parsed('provider', 'set-url http://y'), noop)).toBe('url:http://y')
    })

    it('"connect <id> <key>" connects with the API key', async () => {
      const result = await runAsyncCommand(makeAsyncPort(), parsed('provider', 'connect openai sk-123'), noop)
      expect(result).toBe('connect:openai:sk-123')
    })

    it('an invalid subcommand reports usage', async () => {
      const result = await runAsyncCommand(makeAsyncPort(), parsed('provider', 'bogus'), noop)
      expect(result).toContain('Subcomando inválido')
    })
  })

  describe('loop subcommand', () => {
    it('with no args reports usage', async () => {
      expect(await runAsyncCommand(makeAsyncPort(), parsed('loop'), noop)).toContain('Uso:')
    })

    it('"stop <id>" delegates to loopStop', async () => {
      expect(await runAsyncCommand(makeAsyncPort(), parsed('loop', 'stop node_1'), noop)).toBe('loop-stop:node_1')
    })

    it('"stop" with no id defaults to "all"', async () => {
      expect(await runAsyncCommand(makeAsyncPort(), parsed('loop', 'stop'), noop)).toBe('loop-stop:all')
    })

    it('"<payload> <every>" starts a loop, using the last token as the interval', async () => {
      const result = await runAsyncCommand(makeAsyncPort(), parsed('loop', 'agf stats 1h'), noop)
      expect(result).toBe('loop-start:agf stats:1h')
    })
  })

  it('unknown async command reports it as unrecognized', async () => {
    const result = await runAsyncCommand(makeAsyncPort(), parsed('not-a-real-command'), noop)
    expect(result).toContain('desconhecido')
  })
})
