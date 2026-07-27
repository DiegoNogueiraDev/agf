/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Command port interfaces and runners — CommandPort, AsyncCommandPort,
 * runReadCommand, runAsyncCommand, ALGORITHM_CMDS, ASYNC_CMDS.
 * WHY here: port/adapter boundary definitions separated from catalog data and
 * parsing. Composing: re-exported via dispatch.ts barrel.
 */

import { decideOutput } from './surface-decide.js'
import type { AlgorithmsPort } from './algorithms-port.js'
import { COMMANDS } from './dispatch-catalog.js'
import type { ParsedCommand } from './dispatch-parsing.js'
import { formatSkillsList } from './skills-view.js'
import { formatConfigView } from './config-view.js'
import { resolveLayeredConfig } from '../core/config/layered-config.js'
import type { TokenEconomyProofSnapshot } from '../core/economy/proof-snapshot.js'

/** Porta estreita para os comandos read-only (fácil de fakar em testes). */
export interface CommandPort {
  findNext(): { id: string; title: string; reason: string } | { blocked: true } | null
  stats(): { totalNodes: number; byStatus: Record<string, number> }
  metrics(): { total: number; costUsd: number; calls: number }
  /** Optional — additive so existing CommandPort fakes/mocks don't break. */
  proofSnapshot?(): TokenEconomyProofSnapshot
  status(): string
  getPhase(): string
  getModel(): string
  listSkills(phase?: string): Array<{ name: string; desc: string; category: string }>
  getSkill(name: string): { name: string; body: string } | undefined
  principles(): Array<{ title: string; category: string; statement: string }>
  providers(): string[]
  providerCurrent(): string
  providerSet(id: string): string
  providerSetUrl(url: string): string
  quality(): { testScore: number; logScore: number; passed: boolean; totalModules: number; darkModules: string[] }
  insights(sub: string): string
  gate(phase: string): string
  learning(sub: string): string
  heal(arg: string): string
  getGraphNodes(): Array<{
    id: string
    type: string
    title: string
    status: string
    parentId: string | null | undefined
    sprint: string | null | undefined
  }>
  cacheStats(): {
    sessionHits: number
    sessionMisses: number
    sessionSize: number
    sessionCapacity: number
    sessionEvictions: number
    toolCacheHits: number
    toolCacheMisses: number
    toolCacheInvalidations: number
    tokensSavedEstimate: number
    costAvoidedUsd: number
  }
  algorithms: AlgorithmsPort
}

export interface CacheStatsResult {
  sessionHits: number
  sessionMisses: number
  sessionSize: number
  sessionCapacity: number
  sessionEvictions: number
  toolCacheHits: number
  toolCacheMisses: number
  toolCacheInvalidations: number
  tokensSavedEstimate: number
  costAvoidedUsd: number
}

/** Porta para comandos assíncronos não-live (check, decompose, import-prd, doctor, build, generate-prd). */
export interface AsyncCommandPort {
  check(nodeId: string): Promise<string>
  decompose(): Promise<string>
  importPrd(file: string): Promise<string>
  runDoctor(): Promise<string>
  build(arg: string): Promise<string>
  generatePrd(description: string): Promise<string>
  deliver(request: string): Promise<string>
  gaps(severity?: string): Promise<string>
  savings(reset?: boolean): Promise<string>
  preflight(topic: string): Promise<string>
  brief(id: string): Promise<string>
  submit(id: string): Promise<string>
  providerConnect(id: string, apiKey?: string): Promise<string>
  providers(): string[]
  providerCurrent(): string
  providerSet(id: string): string
  providerSetUrl(url: string): string
  loopStart(payload: string, every: string): Promise<string>
  loopStop(target: string): Promise<string>
  agfStart(): Promise<string>
  feedback(message: string): Promise<string>
}

export const ASYNC_CMDS = [
  'start',
  'check',
  'decompose',
  'import-prd',
  'doctor',
  'build',
  'generate-prd',
  'deliver',
  'gaps',
  'savings',
  'preflight',
  'brief',
  'submit',
  'provider',
  'loop',
  'feedback',
] as const

/** Set of algorithm command names that dispatch via algorithms port. */
export const ALGORITHM_CMDS = new Set([
  'critical-path',
  'topological-sort',
  'dijkstra',
  'bellman-ford',
  'floyd-warshall',
  'scc',
  'bfs',
  'dfs',
  'mst',
  'max-flow',
  'hungarian',
  'page-rank',
  'centrality',
  'graph-metrics',
  'articulation-points',
  'bridges',
  'knapsack',
  'lcs',
  'rod-cutting',
  'edit-distance',
  'activity-select',
  'huffman',
  'rabin-karp',
  'suffix-search',
  'monte-carlo',
  'bayesian',
  'markov',
  'flow-efficiency',
  'queue-sim',
  'kalman',
  'cfd',
  'cluster',
  'gradient-descent',
  'weighted-majority',
  'linear-program',
  'set-cover',
  'tsp',
  'vertex-cover',
  'genetic',
  'branch-bound',
  'backtrack',
  'chi-square',
  'linear-regression',
  'entropy',
  'quickselect',
  'seasonality',
])

/** Executa um comando assíncrono e devolve o texto de resumo. */
export async function runAsyncCommand(
  port: AsyncCommandPort,
  parsed: ParsedCommand,
  _onLine: (line: string) => void,
): Promise<string> {
  switch (parsed.cmd) {
    case 'start':
      return port.agfStart()
    case 'check':
      if (!parsed.args) return 'Uso: /check <nodeId>'
      return port.check(parsed.args)
    case 'decompose':
      return port.decompose()
    case 'import-prd':
      if (!parsed.args) return 'Uso: /import-prd <caminho-do-arquivo>'
      return port.importPrd(parsed.args)
    case 'doctor':
      return port.runDoctor()
    case 'build':
      return port.build(parsed.args)
    case 'generate-prd':
      if (!parsed.args) return 'Uso: /generate-prd <descrição do produto>'
      return port.generatePrd(parsed.args)
    case 'deliver':
      if (!parsed.args) return 'Uso: /deliver <pedido> (ex.: /deliver crie um kanban)'
      return port.deliver(parsed.args)
    case 'gaps':
      return port.gaps(parsed.args || undefined)
    case 'savings':
      return port.savings(parsed.args === '--reset')
    case 'preflight':
      if (!parsed.args) return 'Uso: /preflight <topic>'
      return port.preflight(parsed.args)
    case 'brief':
      if (!parsed.args) return 'Uso: /brief <id>'
      return port.brief(parsed.args)
    case 'submit':
      if (!parsed.args) return 'Uso: /submit <id> (resultado via agf submit <id> --result <json> no terminal)'
      return port.submit(parsed.args)
    case 'provider': {
      const pArgs = parsed.args?.trim() ?? ''
      if (!pArgs || pArgs === 'list')
        return Promise.resolve(
          `Providers: ${port.providers().join(', ')}\nAtivo: ${port.providerCurrent()}\nUso: /provider use <id> | connect <id> [key] | set-url <url> | current`,
        )
      if (pArgs === 'current') return Promise.resolve(port.providerCurrent())
      const [pSub, ...pRest] = pArgs.split(/\s+/)
      const pValue = pRest.join(' ').trim()
      if (pSub === 'use') {
        if (!pValue) return Promise.resolve('Uso: /provider use <id> [base-url]')
        const parts = pValue.split(/\s+/)
        const msg = port.providerSet(parts[0])
        return Promise.resolve(parts[1] ? `${msg}\n${port.providerSetUrl(parts.slice(1).join(' '))}` : msg)
      }
      if (pSub === 'set-url') return Promise.resolve(port.providerSetUrl(pValue))
      if (pSub === 'connect') {
        const [id, ...keyParts] = pValue.split(/\s+/)
        if (!id) return Promise.resolve('Uso: /provider connect <id> [api-key]')
        return port.providerConnect(id, keyParts.join('') || undefined)
      }
      return Promise.resolve(
        `Subcomando inválido: ${pSub}. Uso: /provider [list|current|use <id>|connect <id> [key]|set-url <url>]`,
      )
    }
    case 'loop': {
      const lArgs = parsed.args?.trim() ?? ''
      if (!lArgs) return 'Uso: /loop <payload> <dur> | /loop stop [id|all]'
      if (lArgs.startsWith('stop')) {
        const target = lArgs.slice('stop'.length).trim() || 'all'
        return port.loopStop(target)
      }
      // "/loop <payload> <every>" — last token is the duration
      const tokens = lArgs.split(/\s+/)
      const every = tokens.length > 1 ? tokens[tokens.length - 1] : ''
      const payload = tokens.length > 1 ? tokens.slice(0, -1).join(' ') : lArgs
      return port.loopStart(payload, every)
    }
    case 'feedback':
      if (!parsed.args) return 'Uso: /feedback <type: bug|melhoria|feature> <mensagem>'
      return port.feedback(parsed.args)
    default:
      return `Comando assíncrono desconhecido: ${parsed.cmd}`
  }
}

/** Executa um comando read-only e devolve o texto a exibir no log da TUI. */
export function runReadCommand(port: CommandPort, parsed: ParsedCommand): string {
  switch (parsed.cmd) {
    case 'next': {
      const next = port.findNext()
      if (next === null) return 'Nenhuma task disponível.'
      if ('blocked' in next) return 'Todas as tasks estão bloqueadas.'
      return `Próxima: ${next.title} (${next.id}) — ${next.reason}`
    }
    case 'stats': {
      const s = port.stats()
      const byStatus = Object.entries(s.byStatus)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
      return `Nós: ${s.totalNodes} · ${byStatus}`
    }
    case 'metrics': {
      const m = port.metrics()
      return `Tokens: ${m.total} ≈ $${m.costUsd.toFixed(4)} · ${m.calls} chamada(s)`
    }
    case 'status':
      return port.status()
    case 'config':
      return formatConfigView(resolveLayeredConfig({}))
    case 'phase':
      return `Fase: ${port.getPhase()}`
    case 'model':
      return `Modelo: ${port.getModel()}`
    case 'skills': {
      const phase = parsed.args.trim() || undefined
      const skills = port.listSkills(phase)
      return formatSkillsList(skills, phase)
    }
    case 'skill': {
      if (!parsed.args) return 'Uso: /skill <nome>'
      const skill = port.getSkill(parsed.args)
      if (!skill) return `Skill não encontrada: ${parsed.args}`
      return `=== ${skill.name} ===\n${skill.body}`
    }
    case 'principles': {
      const ps = port.principles()
      return ps.map((p) => `[${p.category}] ${p.title} — ${p.statement}`).join('\n')
    }
    case 'quality': {
      const q = port.quality()
      return `Qualidade: testes ${q.testScore}% · logs ${q.logScore}% · ${q.totalModules} modulos → ${q.passed ? '✓ 95/95 OK' : '✗ reprovado'}${q.darkModules.length > 0 ? ` · ${q.darkModules.length} dark` : ''}`
    }
    case 'insights':
      return port.insights(parsed.args)
    case 'gate':
      return port.gate(parsed.args)
    case 'learning':
      return port.learning(parsed.args)
    case 'heal':
      return port.heal(parsed.args)
    case 'help':
      return COMMANDS.map((c) => `${c.usage} — ${c.desc}`).join('\n')
    case 'surface': {
      const intent = parsed.args || 'doc'
      try {
        const { format, rationale } = decideOutput(intent as Parameters<typeof decideOutput>[0])
        return `[surface] ${intent} → ${format} — ${rationale}`
      } catch {
        return `[surface] Intent inválida: "${intent}". Use: spec, code-review, report, dashboard, doc, data-extract, scratchpad`
      }
    }
    case 'cache-stats': {
      const cs = port.cacheStats()
      const total = cs.sessionHits + cs.sessionMisses
      const hitRate = total > 0 ? ((cs.sessionHits / total) * 100).toFixed(1) : '0.0'
      return [
        '═ /cache-stats ═',
        `  Session Cache:`,
        `    Hits:  ${cs.sessionHits}  Misses: ${cs.sessionMisses}  Rate: ${hitRate}%`,
        `    Size:  ${cs.sessionSize}/${cs.sessionCapacity}  Evictions: ${cs.sessionEvictions}`,
        `  Tool Cache:`,
        `    Hits:  ${cs.toolCacheHits}  Misses: ${cs.toolCacheMisses}  Invalidations: ${cs.toolCacheInvalidations}`,
        `  Token Savings:  ${cs.tokensSavedEstimate.toLocaleString()} tok ≈ $${cs.costAvoidedUsd.toFixed(4)}`,
      ].join('\n')
    }

    case 'run':
    case 'autopilot':
      return '(live: aguardando runner)'
    case 'check':
    case 'decompose':
    case 'import-prd':
    case 'doctor':
      return '(aguardando asyncPort…)'
    // ── Algorithm commands ──────────────────────────────────────────
    case 'critical-path':
      return port.algorithms.criticalPath()
    case 'topological-sort':
      return port.algorithms.topologicalSort()
    case 'dijkstra': {
      const [src, sink] = parsed.args.split(' ')
      return port.algorithms.dijkstra(src, sink)
    }
    case 'bellman-ford':
      return port.algorithms.bellmanFord(parsed.args)
    case 'floyd-warshall':
      return port.algorithms.floydWarshall()
    case 'scc':
      return port.algorithms.scc()
    case 'bfs':
      return port.algorithms.bfs(parsed.args)
    case 'dfs':
      return port.algorithms.dfs(parsed.args)
    case 'mst':
      return port.algorithms.mst()
    case 'max-flow': {
      const [src, sink] = parsed.args.split(' ')
      return port.algorithms.maxFlow(src, sink)
    }
    case 'hungarian':
      return port.algorithms.hungarian(parsed.args || undefined)
    case 'page-rank':
      return port.algorithms.pageRank()
    case 'centrality':
      return port.algorithms.centrality()
    case 'graph-metrics':
      return port.algorithms.graphMetrics()
    case 'articulation-points':
      return port.algorithms.articulationPoints()
    case 'bridges':
      return port.algorithms.bridges()
    case 'knapsack':
      return port.algorithms.knapsack(parsed.args)
    case 'lcs': {
      const [a, b] = parsed.args.split(' ')
      return port.algorithms.lcs(a || '', b || '')
    }
    case 'rod-cutting':
      return port.algorithms.rodCutting(parsed.args)
    case 'edit-distance': {
      const [a, b] = parsed.args.split(' ')
      return port.algorithms.editDistance(a || '', b || '')
    }
    case 'activity-select':
      return port.algorithms.activitySelect()
    case 'huffman':
      return port.algorithms.huffman()
    case 'rabin-karp': {
      const parts = parsed.args.match(/([^ ]+)\s+(.+)/)
      return port.algorithms.rabinKarp(parts?.[1] || '', parts?.[2] || '')
    }
    case 'suffix-search': {
      const parts = parsed.args.match(/([^ ]+)\s+(.+)/)
      return port.algorithms.suffixSearch(parts?.[1] || '', parts?.[2] || '')
    }
    case 'monte-carlo':
      return port.algorithms.monteCarlo(parsed.args)
    case 'bayesian': {
      const [p, l, e] = parsed.args.split(' ')
      return port.algorithms.bayesian(p, l, e)
    }
    case 'markov':
      return port.algorithms.markov(parsed.args)
    case 'flow-efficiency':
      return port.algorithms.flowEfficiency()
    case 'queue-sim': {
      const [a, s] = parsed.args.split(' ')
      return port.algorithms.queueSim(a, s)
    }
    case 'kalman':
      return port.algorithms.kalman(parsed.args)
    case 'cfd':
      return port.algorithms.cfd()
    case 'cluster':
      return port.algorithms.cluster(parsed.args)
    case 'gradient-descent':
      return port.algorithms.gradientDescent()
    case 'weighted-majority':
      return port.algorithms.weightedMajority()
    case 'linear-program':
      return port.algorithms.linearProgram()
    case 'set-cover':
      return port.algorithms.setCover()
    case 'tsp':
      return port.algorithms.tsp()
    case 'vertex-cover':
      return port.algorithms.vertexCover()
    case 'genetic': {
      const [pop, gen] = parsed.args.split(' ')
      return port.algorithms.geneticTask(pop, gen)
    }
    case 'branch-bound':
      return port.algorithms.branchBound(parsed.args || undefined)
    case 'backtrack':
      return port.algorithms.backtrack()
    case 'chi-square': {
      const args = parsed.args.split(' ')
      return port.algorithms.chiSquare(args[0] || '', args[1] || '')
    }
    case 'linear-regression':
      return port.algorithms.linearRegression(parsed.args)
    case 'entropy':
      return port.algorithms.entropy()
    case 'quickselect':
      return port.algorithms.quickselect(parsed.args)
    case 'seasonality':
      return port.algorithms.seasonality(parsed.args)

    // ── Dashboard / Economy commands ────────────────────────────────
    case 'dashboard': {
      const s = port.stats()
      const cs = port.cacheStats()
      return [
        '╒══ Dashboard ═══════════════════════════════╕',
        `  Total nodes: ${s.totalNodes}`,
        `  Backlog: ${s.byStatus.backlog ?? 0} · Ready: ${s.byStatus.ready ?? 0} · In Progress: ${s.byStatus.in_progress ?? 0} · Blocked: ${s.byStatus.blocked ?? 0} · Done: ${s.byStatus.done ?? 0}`,
        `  Phase: ${port.getPhase()} · Model: ${port.getModel()}`,
        `  Cache: ${cs.sessionHits + cs.sessionMisses} req · ${cs.sessionHits > 0 ? Math.round((cs.sessionHits / Math.max(1, cs.sessionHits + cs.sessionMisses)) * 100) : 0}% hit rate`,
        `  Tokens saved: ${cs.tokensSavedEstimate.toLocaleString()} ≈ $${cs.costAvoidedUsd.toFixed(4)}`,
        '╘══════════════════════════════════════════╛',
      ].join('\n')
    }
    case 'token-budget': {
      const m = port.metrics()
      const cs = port.cacheStats()
      const proof = port.proofSnapshot?.()
      const estimatedSuffix = proof?.totals.baselineExtrapolated ? ' (est.)' : ''
      return [
        '╒══ Token Budget ══════════════════════════╕',
        `  Tokens used: ${m.total.toLocaleString()}${estimatedSuffix}`,
        `  Cost: $${m.costUsd.toFixed(4)}`,
        `  Calls: ${m.calls}`,
        `  Cache savings: ${cs.tokensSavedEstimate.toLocaleString()} tok ≈ $${cs.costAvoidedUsd.toFixed(4)}`,
        '╘══════════════════════════════════════════╛',
      ].join('\n')
    }
    case 'cost-forecast': {
      const m = port.metrics()
      return [
        '╒══ Cost Forecast ═════════════════════════╕',
        `  Current cost: $${m.costUsd.toFixed(4)}`,
        `  Model: ${port.getModel()}`,
        '  Use /linear-regression velocity for trend projection',
        '╘══════════════════════════════════════════╛',
      ].join('\n')
    }
    case 'cache-heatmap': {
      const cs = port.cacheStats()
      const total = cs.sessionHits + cs.sessionMisses
      const rate = total > 0 ? ((cs.sessionHits / total) * 100).toFixed(1) : '0.0'
      return [
        '╒══ Cache Heatmap ═════════════════════════╕',
        `  Session: ${cs.sessionHits}H / ${cs.sessionMisses}M — ${rate}%`,
        `  Tool:    ${cs.toolCacheHits}H / ${cs.toolCacheMisses}M`,
        `  Size: ${cs.sessionSize}/${cs.sessionCapacity} · Evicts: ${cs.sessionEvictions}`,
        `  Savings: ${cs.tokensSavedEstimate.toLocaleString()} tok ($${cs.costAvoidedUsd.toFixed(4)})`,
        '╘══════════════════════════════════════════╛',
      ].join('\n')
    }
    case 'workflow-viz': {
      const phase = port.getPhase()
      const s = port.stats()
      const pct = s.totalNodes > 0 ? Math.round(((s.byStatus.done ?? 0) / s.totalNodes) * 100) : 0
      return [
        `Pipeline: ${phase}`,
        `  ${'─'.repeat(50)}`,
        `  ANALYZE │ DESIGN │ PLAN │ IMPLEMENT │ VALIDATE │ REVIEW │ HANDOFF │ DEPLOY │ LISTENING`,
        `  ${'─'.repeat(50)}`,
        `  Current: ${phase}  ·  Done: ${pct}%  ·  Tasks: ${s.totalNodes}`,
      ].join('\n')
    }

    // ── Lifecycle passthrough commands (node_454fbdf2fa3e) ─────────────────────
    case 'spec':
      return `agf spec ${parsed.args || 'list-templates'}  # gera/valida specs por fase`
    case 'forecast':
      return `agf forecast ${parsed.args || ''}  # previsão ETA com 95% CI`.trim()
    case 'swarm':
      return parsed.args ? `agf swarm "${parsed.args}"  # lança swarm de agentes` : 'Uso: /swarm <goal> [--agents <n>]'
    case 'snapshot':
      return `agf snapshot ${parsed.args || 'list'}  # snapshots do grafo`
    case 'template':
      return `agf template ${parsed.args || 'list'}  # templates de workflow`
    case 'plugin':
      return `agf plugin ${parsed.args || 'list'}  # plugins do agf`
    case 'hooks':
      return `agf hooks ${parsed.args || 'list'}  # hooks de lifecycle`
    case 'lint-files':
      return `agf lint-files ${parsed.args || ''}  # lint de arquivos do workspace`.trim()

    case '':
      return "Digite um comando começando com '/'. Tente /help."
    default:
      return `Comando desconhecido: /${parsed.cmd}. Tente /help.`
  }
}
