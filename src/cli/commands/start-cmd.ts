/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { createLogger } from '../../core/utils/logger.js'
import { openStoreOrFail } from '../open-store.js'
import { selectNextTaskSmart, readTunedAcoAlpha } from '../../core/planner/aco-select.js'
import { buildTaskContext } from '../../core/context/compact-context.js'
import { buildFlowAwareContext } from '../shared/flow-aware-context.js'
import type { TaskContext } from '../../core/context/compact-context-types.js'
import { createCliOutput } from '../shared/cli-output.js'
import { getColonySignals } from '../../core/colony/colony-signals.js'
import { verifySessionManifest, listSessionManifests } from '../../core/hooks/session-manifest.js'
import { checkEpicEntryGate, type EpicEntryGateResult } from '../../core/gaps/entry-gate.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { extractTaskFeatures, resolveTierModel } from '../../core/model-hub/tier-router.js'
import {
  resolveAutoGear,
  escalateGear,
  tierForGear,
  shouldEscalateFromCheapFailures,
  type AutoGearResult,
  type CheapArmEvidence,
} from '../../core/model-hub/gearshift.js'
import { setGear } from '../../core/model-hub/claude-settings-writer.js'
import { armStatsForTaskType } from '../../core/model-hub/arm-stats-store.js'
import { buildTaskType } from '../../core/store/episodic-outcomes-store.js'
import { needsHtnDecomposeGuard } from '../../core/planner/decompose.js'
import { getNodeAcTexts } from '../../core/utils/ac-helpers.js'
import { buildL0Identity } from '../../core/economy/wake-up-l0.js'
import { buildL1Essential } from '../../core/economy/wake-up-l1.js'
import type { MemoryItem } from '../../core/economy/wake-up.js'
import { getBuiltinConstitution, KARPATHY_BASELINE_NAME } from '../../core/constitution/built-in-constitutions.js'
import { getHarnessPreflightWarning } from '../../core/harness/harness-preflight.js'
import type { GraphNode } from '../../core/graph/graph-types.js'

const log = createLogger({ layer: 'cli', source: 'start.ts' })

export interface StartSuggestion {
  cmd: string
  reason: string
}

export interface StartDeps {
  wakeUp: () => string
  countInProgress: () => number
  findNext: () => { id: string; title: string; reason: string; xpSize?: string; acCount?: number } | null
  getSuggestions?: () => StartSuggestion[]
  loadContext: (id: string) => string
  markInProgress: (id: string) => string
  out: (msg: string) => void
  /** Auto-mode gearshift hook (writes ~/.claude/settings.json). Absent ⇒ auto=off, no-op. */
  applyGear?: (id: string) => void
  /** Gate de entrada (node_dd0aaabbed5c): gaps required no subtree do épico da task. Absent ⇒ legado, sem gate. */
  entryGate?: (taskId: string) => EpicEntryGateResult
}

export interface StartResult {
  taskId: string | null
  title: string | null
  context: string
  code?: string
  suggestions?: StartSuggestion[]
  /** Comandos que fecham os gaps quando code=GAPS_REQUIRED_OPEN. */
  applyVia?: string[]
}

export interface StartPipelineOptions {
  /** --force: pula o gate de entrada com warning GAPS_FORCED (escape consciente). */
  forceGaps?: boolean
}

export function startTaskPipeline(deps: StartDeps, baseDir?: string, options: StartPipelineOptions = {}): StartResult {
  const wakeUpPack = deps.wakeUp()
  log.debug(`Wake-up: ${wakeUpPack.length} chars`)

  // Validate previous session manifest integrity (M6)
  if (baseDir) {
    try {
      const manifests = listSessionManifests(baseDir)
      if (manifests.length > 0) {
        const latest = manifests[0]!
        const result = verifySessionManifest(baseDir, latest.sessionId)
        if (!result.valid) {
          deps.out(`MANIFEST_TAMPERED: Session ${latest.sessionId} integrity check failed: ${result.error}`)
          log.warn('Session manifest tampered', { sessionId: latest.sessionId, error: result.error })
        }
      }
    } catch {
      // Manifest validation is best-effort — never block execution
    }
  }

  const wipCount = deps.countInProgress()
  if (wipCount >= 1) {
    deps.out(`WIP_EXCEEDED: ${wipCount} task(s) already in_progress.`)
    deps.out('Run: agf done <id> or agf node status <id> backlog')
    return { taskId: null, title: null, context: wakeUpPack, code: 'WIP_EXCEEDED' }
  }

  const nextTask = deps.findNext()
  if (!nextTask) {
    const suggestions = deps.getSuggestions?.() ?? []
    deps.out('No next task found.')
    return { taskId: null, title: null, context: wakeUpPack, suggestions }
  }

  // Gate de entrada (node_dd0aaabbed5c): subtree do épico com gap required
  // aberto ⇒ recusa dura com applyVia; --force pull com warning (poka-yoke
  // com escape consciente). Só o subtree — dívida global nunca trava o pull.
  if (deps.entryGate) {
    const gate = deps.entryGate(nextTask.id)
    if (gate.blocked) {
      if (options.forceGaps) {
        deps.out(`GAPS_FORCED: pulando gate de entrada — ${gate.gaps.length} gap(s) required no épico ${gate.epicId}`)
      } else {
        deps.out(
          `GAPS_REQUIRED_OPEN: ${gate.gaps.length} gap(s) required no subtree do épico ${gate.epicId} — feche-os antes do 1º pull (ou --force).`,
        )
        for (const cmd of gate.applyVia.slice(0, 10)) deps.out(`  applyVia: ${cmd}`)
        return {
          taskId: null,
          title: null,
          context: wakeUpPack,
          code: 'GAPS_REQUIRED_OPEN',
          applyVia: gate.applyVia,
        }
      }
    }
  }

  if (needsHtnDecomposeGuard(nextTask.xpSize, nextTask.acCount ?? 0)) {
    deps.out(`NEEDS_DECOMPOSE: ${nextTask.title} is XS with no acceptance criteria.`)
    deps.out(`Run: agf decompose ${nextTask.id}`)
    return {
      taskId: null,
      title: null,
      context: wakeUpPack,
      code: 'NEEDS_DECOMPOSE',
      suggestions: [
        { cmd: `agf decompose ${nextTask.id}`, reason: 'XS task with no acceptance criteria — likely under-specified' },
      ],
    }
  }

  deps.out(`Starting: ${nextTask.title}`)
  deps.out(`Reason: ${nextTask.reason}`)

  const context = deps.loadContext(nextTask.id)
  deps.markInProgress(nextTask.id)
  deps.applyGear?.(nextTask.id)

  deps.out(`Context loaded (${context.length} chars)`)
  deps.out(`Task ${nextTask.id} marked in_progress`)

  return {
    taskId: nextTask.id,
    title: nextTask.title,
    context: `${wakeUpPack}\n\n${context}`,
  }
}

export function buildStartSuggestions(store: SqliteStore): StartSuggestion[] {
  const stats = store.getStats()
  if (stats.totalNodes === 0) {
    return [
      { cmd: 'agf import-prd <file>', reason: 'Importe um PRD para criar tasks automaticamente' },
      { cmd: 'agf generate-prd "<ideia>"', reason: 'Gere um PRD a partir de uma ideia em texto livre' },
    ]
  }
  const blockedCount = stats.byStatus['blocked'] ?? 0
  const backlogCount = stats.byStatus['backlog'] ?? 0
  if (blockedCount > 0 && backlogCount === 0) {
    return [
      {
        cmd: 'agf gaps --severity required',
        reason: `${blockedCount} task(s) bloqueada(s) — execute para ver os blockers e como resolvê-los`,
      },
    ]
  }
  return [
    { cmd: 'agf decompose', reason: 'Detecta tasks grandes e sugere subtasks atômicas' },
    { cmd: 'agf gaps', reason: 'Verifica lacunas de completude no grafo' },
  ]
}

/**
 * Resolve the gear for a task's context, escalating one rung above the
 * heuristic when the heuristic tier is `cheap` AND the cheap arm has a
 * history of failure (see `shouldEscalateFromCheapFailures`). Pure — no
 * store/I-O access, so it is directly testable without a real SqliteStore.
 */
export function resolveGearForTask(ctx: TaskContext, cheapArmEvidence: CheapArmEvidence | undefined): AutoGearResult {
  const features = extractTaskFeatures(ctx)
  const heuristic = resolveAutoGear(features, true)
  if (heuristic.tier !== 'cheap' || !cheapArmEvidence || !shouldEscalateFromCheapFailures(cheapArmEvidence)) {
    return heuristic
  }
  const gear = escalateGear(heuristic.gear)
  const tier = tierForGear(gear)
  return {
    ...heuristic,
    gear,
    tier,
    model: resolveTierModel(tier),
    rationale: `${heuristic.rationale} -> escalated +1 gear: cheap-arm failure history (${cheapArmEvidence.successes}/${cheapArmEvidence.pulls} success)`,
  }
}

/** Real (store-backed) gearshift hook for `buildStartDeps` — resolves the gear and writes it. */
function applyGearToExecutor(store: SqliteStore, taskId: string): void {
  const ctx = buildTaskContext(store, taskId)
  if (!ctx) return
  const taskType = buildTaskType(ctx.task.tags)
  const stats = armStatsForTaskType(store.getDb(), taskType)
  const cheapArm = stats.find((s) => s.tier === 'cheap')
  const result = resolveGearForTask(ctx, cheapArm)
  setGear(result.gear)
}

const RECENT_WORK_LIMIT = 10

/**
 * Maps recently-done graph nodes into MemoryItem shape for L1 essential recall
 * (node_wire_a3471c706441 — wires buildL1Essential into the wake-up pack).
 * Priority (1=highest..5=lowest) becomes the retention-input score; only
 * priority 1-2 work survives the L1 hot-tier threshold (>=0.7).
 */
export function buildRecentWorkMemoryItems(doneNodes: GraphNode[], limit = RECENT_WORK_LIMIT): MemoryItem[] {
  return doneNodes
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit)
    .map((node, idx) => ({
      id: node.id,
      content: node.title,
      score: (6 - node.priority) / 5,
      ageDays: Math.max(0, (Date.now() - new Date(node.updatedAt).getTime()) / (1000 * 60 * 60 * 24)),
      bm25Rank: idx + 1,
      vectorRank: idx + 1,
      graphRank: idx + 1,
    }))
}

export function buildStartDeps(store: SqliteStore, out: (msg: string) => void, autoMode = true): StartDeps {
  return {
    wakeUp: () => {
      const s = store.getStats()
      const byStatus = Object.entries(s.byStatus)
        .map(([k, v]) => `${k}:${v}`)
        .join(' ')
      const project = store.getProject()
      const constitution = getBuiltinConstitution(KARPATHY_BASELINE_NAME)
      const l0 = buildL0Identity({
        projectName: project?.name ?? 'workspace',
        identity: 'agent-graph-flow — graph-driven task execution',
        coreRules: (constitution?.principles ?? []).slice(0, 3).map((p) => p.title),
        knowledgeAnchors: [],
      })
      const preflight = getHarnessPreflightWarning(store.getDb())
      const preflightLine = preflight ? `\n\n⚠️ ${preflight.message}` : ''
      const recentMemoryItems = buildRecentWorkMemoryItems(store.getNodesByStatus('done'))
      const l1 = buildL1Essential(recentMemoryItems)
      const l1Block = l1.content ? `\n\n${l1.content}` : ''
      return `${l0.content}\n\n## Wake-Up\n${s.totalNodes} nodes, ${s.totalEdges} edges — ${byStatus}${l1Block}${preflightLine}`
    },
    countInProgress: () => {
      const s = store.getStats()
      return s.byStatus.in_progress || 0
    },
    findNext: () => {
      // ACO smart-default (mode auto): pull via pheromone roulette when the field is
      // informative, deterministic on a cold field. Same selector as `agf next` (DRY).
      const next = selectNextTaskSmart(store.toGraphDocument(), {
        getDb: () => store.getDb(),
        getProjectId: () => store.getProject()?.id ?? '',
        mode: 'auto',
        rng: Math.random,
        alpha: () => readTunedAcoAlpha(store), // GA-tuned α when the autotune lever has learned one (T6c)
      })
      if (!next) return null
      const acCount = getNodeAcTexts(store.toGraphDocument(), next.node.id).length
      return { id: next.node.id, title: next.node.title, reason: next.reason, xpSize: next.node.xpSize, acCount }
    },
    getSuggestions: () => buildStartSuggestions(store),
    loadContext: (id: string) => {
      // node_5e91af9e646d: reusa o MESMO caminho flow do `agf context`. Flow OFF
      // (default) ⇒ sem bloco `flow`, byte-idêntico ao comportamento anterior.
      const { context, flow } = buildFlowAwareContext(store, id)
      if (!context) return ''
      return JSON.stringify(flow ? { ...(context as Record<string, unknown>), flow } : context)
    },
    markInProgress: (id: string) => {
      store.updateNodeStatus(id, 'in_progress')
      return id
    },
    applyGear: autoMode ? (id: string) => applyGearToExecutor(store, id) : undefined,
    entryGate: (taskId: string) => checkEpicEntryGate(store.toGraphDocument(), taskId),
    out,
  }
}

/** Builds the `agf start` CLI command (Commander definition). */
export function startCommand(): Command {
  const cmd = new Command('start')
  cmd.description('Start next task: wake-up + next + context + mark in_progress')
  cmd.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
  cmd.option('--no-auto-gear', 'Desliga o gearshift automático (não grava ~/.claude/settings.json)')
  cmd.option('--force', 'Pula o gate de gaps required do épico (warning GAPS_FORCED)', false)
  cmd.action((opts: { dir: string; autoGear: boolean; force: boolean }) => {
    const out = createCliOutput('start')
    log.debug('agf start invoked')
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      const result = startTaskPipeline(
        buildStartDeps(store, (msg) => log.debug(msg), opts.autoGear),
        opts.dir,
        {
          forceGaps: opts.force,
        },
      )
      if (!result.taskId) {
        if (result.code === 'GAPS_REQUIRED_OPEN') {
          out.fail(
            'GAPS_REQUIRED_OPEN',
            'Gaps required abertos no subtree do épico — feche-os antes do 1º pull (ou use --force).',
            { applyVia: result.applyVia ?? [] },
          )
          return
        }
        if (result.code === 'WIP_EXCEEDED') {
          out.err('WIP_EXCEEDED', 'A task is already in_progress. Run agf done <id> or agf node status <id> backlog.')
          return
        }
        if (result.code === 'NEEDS_DECOMPOSE') {
          out.fail('NEEDS_DECOMPOSE', 'Next task is XS with no acceptance criteria — likely under-specified.', {
            suggestions: result.suggestions ?? [],
          })
          return
        }
        out.fail('NO_TASKS', 'No next task found.', { suggestions: result.suggestions ?? [] })
        return
      }
      const signals = getColonySignals(store.getStats())
      out.ok({ taskId: result.taskId, title: result.title, context: result.context, colony_signals: signals })
      // §ECONOMY-HOOK: display economy reminder on task start
      log.info('economy', {
        hint: 'Use --select, --compressed, and agf exec to save tokens. See _shared.md in .agents/skills/.',
      })
    } finally {
      store.close()
    }
  })
  return cmd
}
