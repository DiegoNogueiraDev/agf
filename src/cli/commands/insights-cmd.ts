/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { calculateDoraMetrics, type DoraMetrics } from '../../core/insights/dora-metrics.js'
import { computeFlowReport } from '../../core/context/flow-report.js'
import { detectBottlenecks, type BottleneckReport } from '../../core/insights/bottleneck-detector.js'
import { calculatePhaseDistribution, type PhaseDistribution } from '../../core/insights/phase-distribution.js'
import { calculateMetrics, type MetricsReport } from '../../core/insights/metrics-calculator.js'
import { collectVelocityScorecard } from '../../core/evals/scorecard.js'
import {
  computeBehavioralMetrics,
  computeAssertiveness,
  type BehavioralMetrics,
  type AssertivenessMetrics,
} from '../../core/insights/behavioral-metrics.js'
import { analyzeNextPolicyAudit } from '../../core/planner/next-override-tracker.js'
import { getGapsHistory } from '../../core/gaps/completeness-events.js'
import { computeInsightsQuality } from '../../core/insights/insights-quality.js'
import { buildSpectraFromStore } from '../../core/insights/spectra-from-store.js'
import { computeStaleRisks, type RiskRecord } from '../../core/insights/stale-risk.js'
import {
  computeSizeCalibration,
  type SizeCalibrationReport,
} from '../../core/analyzer/estimate-calibration-analyzer.js'
import { analyzeEvolutionAudit, type EvolutionAuditReport } from '../../core/analyzer/evolution-audit.js'
import { computePrdLifecycleHealth, type LifecycleHealthReport } from '../../core/analyzer/prd-lifecycle-health.js'
import {
  recordSnapshot,
  computeSuccessRate,
  type SuccessRateReport,
} from '../../core/analyzer/lifecycle-health-snapshots.js'
import {
  analyzePolicyObservations,
  type PolicyObservationsReport,
} from '../../core/analyzer/policy-observations-analyzer.js'
import { calculateSprintProgress } from '../../core/implementer/sprint-progress.js'
import type { SprintProgressReport } from '../../schemas/implementer-schema.js'
import { captureFlowSnapshot, getCfdData, type FlowSnapshot } from '../../core/insights/flow-tracker.js'
import { analyzeAutoReady, type AutoReadyReport } from '../../core/planner/auto-ready.js'
import { analyzeSprintHealth, type SprintHealthReport } from '../../core/planner/sprint-health.js'
import { recommendBuiltInSkills, type SkillRecommendation } from '../../core/insights/skill-recommender.js'
import {
  classifyTools,
  getLayerDistribution,
  type DeterministicLayer,
  type ToolClassification,
} from '../../core/insights/deterministic-layers.js'
import { detectPhase, CANONICAL_TO_INTERNAL } from '../../core/lifecycle/phase.js'
import { readEpicKr, type KrRecord } from '../../core/evals/okr-kr-source.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'insights-cmd.ts' })

/** Compute DORA metrics (deploy frequency, lead time, CFR, MTTR) from the store. */
export function doraSummary(store: SqliteStore): DoraMetrics {
  return calculateDoraMetrics(store)
}

/** Detect flow bottlenecks (blocked, AC-less, oversized tasks) from the store. */
export function bottleneckSummary(store: SqliteStore): BottleneckReport {
  return detectBottlenecks(store.toGraphDocument())
}

/** Distribution of tasks across lifecycle phases. */
export function phaseSummary(store: SqliteStore): PhaseDistribution[] {
  return calculatePhaseDistribution(store.toGraphDocument())
}

/** Aggregate flow metrics report (cycle/lead time, throughput). */
export function metricsSummary(store: SqliteStore): MetricsReport {
  return calculateMetrics(store.toGraphDocument())
}

export interface WipSummary {
  current: number
  alert: boolean
  alertMessage: string
  trend: number[]
}

/** Current work-in-progress count with limit-violation alert. */
export function wipSummary(store: SqliteStore): WipSummary {
  const s = store.getStats()
  const current = s.byStatus.in_progress || 0
  const alert = current > 1
  const alertMessage = alert
    ? `WIP_ALERT: ${current} tasks in_progress (limit=1). Run: agf done <id> or agf node status <id> backlog`
    : 'WIP_OK: within limit'
  return { current, alert, alertMessage, trend: [current] }
}

/**
 * Behavioral fitness: autonomy (done tasks without override) + resilience MTTR.
 * Autonomy is derived from the graph + next_overrides; resilience recovery timing
 * (live failure→re-pass) is a follow-up data source (empty here → MTTR 0).
 */
export function behavioralSummary(store: SqliteStore): BehavioralMetrics {
  const doc = store.toGraphDocument()
  const done = doc.nodes.filter((n) => (n.type === 'task' || n.type === 'subtask') && n.status === 'done')
  const projectId = store.getActiveProject()?.id ?? ''
  const overrides = projectId ? analyzeNextPolicyAudit(store.getDb(), projectId).overrides : 0
  const records = done.map((_n, i) => ({ status: 'done', hadOverride: i < overrides }))
  return computeBehavioralMetrics(records, [])
}

/**
 * Assertividade: taxa de AC-pass de 1ª passada, lida de perf_records.
 * Velocidade (lead/cycle time) é coberta por `agf insights dora`.
 */
export function assertivenessSummary(store: SqliteStore): AssertivenessMetrics {
  const projectId = store.getActiveProject()?.id ?? ''
  if (!projectId) return computeAssertiveness([])
  let rows: Array<{ ac_passed: number }>
  try {
    rows = store.getDb().prepare('SELECT ac_passed FROM perf_records WHERE project_id = ?').all(projectId) as Array<{
      ac_passed: number
    }>
  } catch {
    rows = []
  }
  return computeAssertiveness(rows.map((r) => ({ acPassed: r.ac_passed === 1 })))
}

/** Estimate calibration by xpSize: avg_delta/bias_pct/confidence from done tasks' estimateDelta metadata. */
export function estimateCalibrationSummary(store: SqliteStore): SizeCalibrationReport {
  return computeSizeCalibration(store)
}

/** Which nodes were regenerated during the lifecycle, and why (`evolution_count`/`evolution_reason`). */
export function evolutionAuditSummary(store: SqliteStore): EvolutionAuditReport {
  return analyzeEvolutionAudit(store.toGraphDocument())
}

export interface LifecycleHealthSummary {
  report: LifecycleHealthReport
  successRate: SuccessRateReport
}

/**
 * Computes the 9-phase PRD lifecycle health report for an epic, persists it as a
 * rolling snapshot (one row per epic per day), and returns the report alongside
 * the success-rate trend over the epic's snapshot history. `null` when the
 * epic node does not exist — callers turn that into a NOT_FOUND envelope.
 */
export function lifecycleHealthSummary(store: SqliteStore, epicId: string): LifecycleHealthSummary | null {
  if (!store.getNodeById(epicId)) return null
  const report = computePrdLifecycleHealth(store.toGraphDocument(), epicId)
  recordSnapshot(store.getDb(), report)
  const successRate = computeSuccessRate(store.getDb(), { epicId })
  return { report, successRate }
}

/** Routing-policy divergence report (top applied rules, preferred providers) from policy_observations. */
export function policySummary(store: SqliteStore, windowDays = 30): PolicyObservationsReport {
  const projectId = store.getActiveProject()?.id
  return analyzePolicyObservations(store.getDb(), { windowDays, projectId })
}

/** Sprint burndown, velocity trend, blockers, critical path, and ETA — optionally scoped to one sprint. */
export function sprintProgressSummary(store: SqliteStore, sprint?: string): SprintProgressReport {
  return calculateSprintProgress(store.toGraphDocument(), sprint)
}

/** Capture today's flow snapshot (backlog/ready/in_progress/blocked/done counts) for the CFD. */
export function flowSnapshotSummary(store: SqliteStore, sprint?: string): FlowSnapshot | null {
  const projectId = store.getActiveProject()?.id
  if (!projectId) return null
  return captureFlowSnapshot(store, projectId, sprint)
}

/** Cumulative Flow Diagram time-series — captured snapshots between startDate/endDate, optionally by sprint. */
export function cfdSummary(
  store: SqliteStore,
  options?: { startDate?: string; endDate?: string; sprint?: string },
): FlowSnapshot[] {
  const projectId = store.getActiveProject()?.id
  if (!projectId) return []
  return getCfdData(store, projectId, options)
}

/** Backlog tasks meeting all "ready" criteria (sprint + AC + resolved deps + not blocked). */
export function autoReadySummary(store: SqliteStore): AutoReadyReport {
  return analyzeAutoReady(store.toGraphDocument())
}

/** Sprint health grade (healthy/at_risk/critical) from burndown, blocked ratio, AC coverage, harness delta. */
export function sprintHealthSummary(store: SqliteStore, sprint?: string): SprintHealthReport {
  return analyzeSprintHealth(store.toGraphDocument(), sprint)
}

/**
 * Skill recommendations for the graph's current lifecycle phase. The canonical
 * phase (SHAPE/BUILD/SHIP) collapses 3 internal phases each; the first internal
 * phase of each group is used as the representative phase for recommendations.
 */
export function skillRecommendationsSummary(store: SqliteStore): SkillRecommendation[] {
  const stats = store.getStats()
  const canonical = detectPhase({
    totalNodes: stats.totalNodes,
    backlog: stats.byStatus.backlog ?? 0,
    inProgress: stats.byStatus.in_progress ?? 0,
    done: stats.byStatus.done ?? 0,
  })
  const [phase] = CANONICAL_TO_INTERNAL[canonical]
  return recommendBuiltInSkills(store.toGraphDocument(), phase)
}

export interface LayersSummary {
  tools: ToolClassification[]
  distribution: Record<DeterministicLayer, number>
}

/** Deterministic-layer classification (L0-L4) of every MCP tool + count distribution per layer. */
export function layersSummary(): LayersSummary {
  return { tools: classifyTools(), distribution: getLayerDistribution() }
}

export interface EpicKrRecord extends KrRecord {
  epicId: string
  title: string
}

/** Structured KR attainment (target/current/unit) for every epic in the graph — wires okr-kr-source. */
export function krSummary(store: SqliteStore): EpicKrRecord[] {
  return store
    .getAllNodes()
    .filter((n) => n.type === 'epic')
    .map((n) => ({ epicId: n.id, title: n.title, ...readEpicKr(n) }))
}

/** Build the `agf insights` CLI command (dora/bottlenecks/phases/wip/behavioral/summary). */
export function insightsCommand(): Command {
  log.info('insights command registered')
  const cmd = new Command('insights').description('Analítica determinística do grafo (DORA, gargalos, fases)')
  const dirOpt = (c: Command): Command => c.option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())

  const withStore = (opts: { dir: string }, fn: (store: SqliteStore) => void): void => {
    const store = openStoreOrFail(opts.dir, { requireExisting: true })
    try {
      fn(store)
    } finally {
      store.close()
    }
  }

  dirOpt(cmd.command('dora').description('Métricas DORA')).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.dora')
      out.ok(doraSummary(store))
    }),
  )
  dirOpt(cmd.command('bottlenecks').description('Detecção de gargalos')).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.bottlenecks')
      out.ok(bottleneckSummary(store))
    }),
  )
  dirOpt(cmd.command('phases').description('Distribuição de tasks por fase')).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.phases')
      out.ok(phaseSummary(store))
    }),
  )
  dirOpt(cmd.command('wip').description('WIP count and alert')).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.wip')
      out.ok(wipSummary(store))
    }),
  )
  dirOpt(cmd.command('flow').description('Flow A/B verdict (flow_on vs flow_off token savings)')).action(
    (opts: { dir: string }) =>
      withStore(opts, (store) => {
        const out = createCliOutput('insights.flow')
        out.ok(computeFlowReport(store.getDb(), store.getActiveProject()?.id))
      }),
  )

  dirOpt(cmd.command('behavioral').description('Métricas comportamentais: autonomia + resiliência (MTTR)')).action(
    (opts: { dir: string }) =>
      withStore(opts, (store) => {
        const out = createCliOutput('insights.behavioral')
        out.ok({
          ...behavioralSummary(store),
          assertiveness: assertivenessSummary(store),
          velocity: doraSummary(store).leadTime,
        })
      }),
  )

  dirOpt(cmd.command('quality').description('Burndown de gaps por kind + delta vs snapshot anterior')).action(
    (opts: { dir: string }) =>
      withStore(opts, (store) => {
        const out = createCliOutput('insights.quality')
        const snaps = getGapsHistory(store.getDb())
        const result = computeInsightsQuality(snaps)
        out.ok(result)
      }),
  )

  dirOpt(
    cmd
      .command('risks')
      .description('Stale open risks (findings that have not been triaged)')
      .option('--stale-days <n>', 'Days before a risk is considered stale', '14'),
  ).action((opts: { dir: string; staleDays: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.risks')
      const risks: RiskRecord[] = store
        .getAllNodes()
        .filter((n) => n.type === 'risk' && n.status !== 'done')
        .map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt }))
      out.ok(computeStaleRisks(risks, { staleDays: parseInt(opts.staleDays, 10) }))
    }),
  )

  dirOpt(
    cmd.command('spectra').description('5 behaviour spectra: autonomy/precision/self_learning/self_healing/memory'),
  ).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.spectra')
      out.ok({ spectra: buildSpectraFromStore(store) })
    }),
  )

  dirOpt(
    cmd.command('calibration').description('Calibração de estimativa por xpSize (avg_delta/bias_pct/confidence)'),
  ).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.calibration')
      out.ok(estimateCalibrationSummary(store))
    }),
  )

  dirOpt(
    cmd.command('evolution').description('Nodes regenerados no ciclo de vida (evolution_count/evolution_reason)'),
  ).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.evolution')
      out.ok(evolutionAuditSummary(store))
    }),
  )

  dirOpt(
    cmd
      .command('lifecycle-health')
      .description('9-phase PRD lifecycle health for an epic — persists a rolling snapshot + success rate')
      .argument('<epicId>', 'Epic node id'),
  ).action((epicId: string, opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.lifecycle-health')
      const result = lifecycleHealthSummary(store, epicId)
      if (!result) {
        out.err('NOT_FOUND', `Epic not found: ${epicId}`)
        return
      }
      out.ok(result)
    }),
  )

  dirOpt(
    cmd
      .command('policy')
      .description('Divergência de roteamento de provider (top rules, preferred providers) via policy_observations')
      .option('--window-days <n>', 'Janela de dias a considerar', '30'),
  ).action((opts: { dir: string; windowDays: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.policy')
      out.ok(policySummary(store, parseInt(opts.windowDays, 10)))
    }),
  )

  dirOpt(
    cmd
      .command('sprint-progress')
      .description('Burndown, tendência de velocidade, blockers, caminho crítico e ETA (opcional: --sprint)')
      .option('--sprint <name>', 'Filtra por sprint'),
  ).action((opts: { dir: string; sprint?: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.sprint-progress')
      out.ok(sprintProgressSummary(store, opts.sprint))
    }),
  )

  dirOpt(
    cmd
      .command('flow-snapshot')
      .description('Captura o snapshot de fluxo de hoje (backlog/ready/in_progress/blocked/done) para o CFD')
      .option('--sprint <name>', 'Escopo por sprint'),
  ).action((opts: { dir: string; sprint?: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.flow-snapshot')
      const snap = flowSnapshotSummary(store, opts.sprint)
      if (!snap) {
        out.err('NO_ACTIVE_PROJECT', 'Nenhum projeto ativo no store')
        return
      }
      out.ok(snap)
    }),
  )

  dirOpt(
    cmd
      .command('cfd')
      .description('Série temporal do Cumulative Flow Diagram (snapshots capturados via flow-snapshot)')
      .option('--start-date <date>', 'Data inicial (YYYY-MM-DD)')
      .option('--end-date <date>', 'Data final (YYYY-MM-DD)')
      .option('--sprint <name>', 'Filtra por sprint'),
  ).action((opts: { dir: string; startDate?: string; endDate?: string; sprint?: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.cfd')
      out.ok({
        series: cfdSummary(store, { startDate: opts.startDate, endDate: opts.endDate, sprint: opts.sprint }),
      })
    }),
  )

  dirOpt(
    cmd
      .command('auto-ready')
      .description('Tasks no backlog que já satisfazem todos os critérios de "ready" (sprint + AC + deps resolvidas)'),
  ).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.auto-ready')
      out.ok(autoReadySummary(store))
    }),
  )

  dirOpt(
    cmd
      .command('sprint-health')
      .description('Grade de saúde do sprint (healthy/at_risk/critical) — burndown, blocked ratio, AC, harness delta')
      .option('--sprint <name>', 'Filtra por sprint'),
  ).action((opts: { dir: string; sprint?: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.sprint-health')
      out.ok(sprintHealthSummary(store, opts.sprint))
    }),
  )

  dirOpt(cmd.command('skills').description('Recomendação de skills com base na fase atual do ciclo de vida')).action(
    (opts: { dir: string }) =>
      withStore(opts, (store) => {
        const out = createCliOutput('insights.skills')
        out.ok({ recommendations: skillRecommendationsSummary(store) })
      }),
  )

  cmd
    .command('layers')
    .description('Classificação determinística (L0-L4) de cada tool MCP + distribuição por camada')
    .action(() => {
      const out = createCliOutput('insights.layers')
      out.ok(layersSummary())
    })

  dirOpt(
    cmd.command('kr').description('KR estruturado (target/current/unit/attainment) para cada épico do grafo'),
  ).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.kr')
      out.ok({ epics: krSummary(store) })
    }),
  )

  dirOpt(cmd.command('summary', { isDefault: true }).description('Resumo de fluxo')).action((opts: { dir: string }) =>
    withStore(opts, (store) => {
      const out = createCliOutput('insights.summary')
      const metrics = metricsSummary(store)
      const wip = wipSummary(store)
      const bottlenecks = bottleneckSummary(store)
      // Velocity dims (node_d35e86e659dc): fonte única em scorecard.ts — a MESMA
      // computação de agf eval/agf metrics; flowEfficiency mantido no topo por
      // compat (era calculado inline aqui antes da fonte única).
      const velocityScorecard = collectVelocityScorecard(store)
      out.ok({ ...metrics, wip, bottlenecks, flowEfficiency: velocityScorecard.flowEfficiency, velocityScorecard })
    }),
  )

  return cmd
}
