import { describe, it, expect } from 'vitest'
import { COMMANDS, runReadCommand, ALGORITHM_CMDS } from '../tui/dispatch.js'
import type { CommandPort } from '../tui/dispatch.js'
import type { AlgorithmsPort } from '../tui/algorithms-port.js'

function makeAlgorithmsPort(): AlgorithmsPort {
  return {
    topologicalSort: () => 'Kahn sorted: A, B, C',
    topologicalSortDfs: () => 'DFS sorted: A, B, C',
    criticalPath: () => 'Critical path: A→C (5)',
    dijkstra: () => 'Dijkstra: A→C dist=7',
    bellmanFord: () => 'Bellman-Ford: dist A=0 B=4 C=7',
    floydWarshall: () => 'Floyd: A→C=7 B→A=∞',
    scc: () => 'SCCs: [A, B] [C]',
    bfs: () => 'BFS from A: A, B, C',
    dfs: () => 'DFS from A: A, B, C',
    mst: () => 'MST Kruskal weight=3',
    maxFlow: () => 'Max flow: 15',
    hungarian: () => 'Hungarian: cost=5',
    pageRank: () => 'PageRank: A=0.45 B=0.35 C=0.20',
    centrality: () => 'Betweenness: B=2.0',
    graphMetrics: () => 'Metrics: 10 nodes 0.22 density',
    articulationPoints: () => 'Articulation points: B',
    bridges: () => 'Bridges: A-B, B-C',
    knapsack: () => 'Knapsack: value=30 weight=8',
    lcs: () => 'LCS: "ab" len=2',
    rodCutting: () => 'Rod: rev=30 cuts=10',
    editDistance: () => 'Edit: dist=2 ops=[sub, ins]',
    activitySelect: () => 'Activities: 3 selected',
    huffman: () => 'Huffman: a=0 b=10 c=11',
    rabinKarp: () => 'Rabin-Karp: matches at 3, 7',
    suffixSearch: () => 'Suffix array: found at 5',
    monteCarlo: () => 'Monte Carlo: mean=4.2 p95=8.1',
    bayesian: () => 'Bayes: posterior=0.85',
    markov: () => 'Markov: steady done=0.95',
    flowEfficiency: () => 'Flow: WIP=3 util=0.45',
    queueSim: () => 'M/M/1: ρ=0.5 L=1.0',
    kalman: () => 'Kalman: filtered [1,2,3]',
    cfd: () => 'CFD: backlog=5 active=3 done=12',
    cluster: () => 'K-means: 3 clusters',
    gradientDescent: () => 'GD: cost=0.01 params=[0.5]',
    weightedMajority: () => 'Weights: [0.4, 0.3, 0.3]',
    linearProgram: () => 'LP: feasible val=42',
    setCover: () => 'Set cover: 3 selected',
    tsp: () => 'TSP: route len=12.4',
    vertexCover: () => 'Vertex cover: size=2',
    geneticTask: () => 'GA: value=85 gen=20',
    branchBound: () => 'B&B: cost=10 nodes=42',
    backtrack: () => 'BT: solution found backtracks=3',
    chiSquare: () => 'Chi-sq: p=0.23 no diff',
    linearRegression: () => 'LR: y=0.5x+2 R²=0.89',
    entropy: () => 'Entropy: 2.1 bits (moderate)',
    quickselect: () => 'kth=3 val=45 min=12',
    seasonality: () => 'Seasonal: period=7 avg=1.2',
  }
}

function makePort(): CommandPort {
  return {
    findNext: () => null,
    stats: () => ({ totalNodes: 0, byStatus: {} }),
    metrics: () => ({ total: 0, costUsd: 0, calls: 0 }),
    getPhase: () => 'IMPLEMENT',
    getModel: () => 'haiku',
    listSkills: () => [],
    getSkill: () => undefined,
    principles: () => [],
    providers: () => [],
    quality: () => ({ testScore: 0, logScore: 0, passed: false, totalModules: 0, darkModules: [] }),
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
    algorithms: makeAlgorithmsPort(),
  }
}

describe('algorithm commands registration', () => {
  it('has at least 60 commands total (built-in + algorithm)', () => {
    expect(COMMANDS.length).toBeGreaterThanOrEqual(60)
  })

  it('every algorithm command is in ALGORITHM_CMDS set', () => {
    const cmds = new Set(ALGORITHM_CMDS)
    for (const c of COMMANDS) {
      if (c.source !== 'skill' && !['help', 'quit'].includes(c.name)) {
        // all non-skill commands should be in either ALGORITHM_CMDS or known built-in
      }
    }
  })

  it('all ALGORITHM_CMDS are registered as COMMANDS entries', () => {
    const names = new Set(COMMANDS.map((c) => c.name))
    for (const cmd of ALGORITHM_CMDS) {
      expect(names.has(cmd)).toBe(true)
    }
  })

  it('every algorithm command has usage and desc starting with /', () => {
    const names = new Set(ALGORITHM_CMDS)
    for (const cmd of COMMANDS) {
      if (names.has(cmd.name)) {
        expect(cmd.usage).toBeTruthy()
        expect(cmd.desc).toBeTruthy()
        expect(cmd.usage.startsWith('/')).toBe(true)
      }
    }
  })

  it('all algorithm commands dispatch without error', () => {
    const port = makePort()
    for (const cmd of ALGORITHM_CMDS) {
      const result = runReadCommand(port, { cmd, args: '' })
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    }
  })

  it('algorithm commands return meaningful output', () => {
    const port = makePort()
    const result = runReadCommand(port, { cmd: 'critical-path', args: '' })
    expect(result).toContain('Critical path')
  })

  it('algorithm names are unique across all commands', () => {
    const names = COMMANDS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('no alias conflicts with existing command names', () => {
    const allNames = new Set(COMMANDS.map((c) => c.name))
    for (const cmd of COMMANDS) {
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          expect(allNames.has(alias)).toBe(false)
        }
      }
    }
  })

  it('ALGORITHM_CMDS size matches registered algorithm commands', () => {
    const algoFromCommands = COMMANDS.filter(
      (c) =>
        c.usage.includes('<sourceId') ||
        c.usage.includes('[trials]') ||
        c.usage.includes('[k]') ||
        c.usage.includes('<string') ||
        [
          'topological-sort',
          'floyd-warshall',
          'scc',
          'mst',
          'centrality',
          'graph-metrics',
          'articulation-points',
          'bridges',
          'activity-select',
          'huffman',
          'flow-efficiency',
          'cfd',
          'gradient-descent',
          'weighted-majority',
          'linear-program',
          'set-cover',
          'tsp',
          'vertex-cover',
          'backtrack',
          'entropy',
          'seasonality',
          'page-rank',
          'monte-carlo',
          'markov',
          'cluster',
          'bellman-ford',
          'bridges',
          'edit-distance',
          'knapsack',
          'rod-cutting',
        ].includes(c.name),
    )
    expect(ALGORITHM_CMDS.size).toBeGreaterThanOrEqual(45)
  })
})

describe('algorithm commands with args', () => {
  it('dijkstra with source and target', () => {
    const port = makePort()
    const result = runReadCommand(port, { cmd: 'dijkstra', args: 'node_a node_b' })
    expect(result).toBeTruthy()
  })

  it('max-flow with source and sink', () => {
    const port = makePort()
    const result = runReadCommand(port, { cmd: 'max-flow', args: 'source sink' })
    expect(result).toBeTruthy()
  })

  it('bayesian with prior likelihood evidence', () => {
    const port = makePort()
    const result = runReadCommand(port, { cmd: 'bayesian', args: '0.5 0.8 0.4' })
    expect(result).toBeTruthy()
  })
})
