/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import { checkDesignReadiness } from '../../core/designer/definition-of-ready.js'
import { emitTransversalHook } from '../../core/hooks/transversal-lifecycle-hooks.js'
import { checkReviewReadiness } from '../../core/reviewer/review-readiness.js'
import { checkHandoffReadiness } from '../../core/handoff/delivery-checklist.js'
import { checkDeployReadiness } from '../../core/deployer/deploy-readiness.js'
import { validateDeployOptions, type ValidatedDeployOptions } from '../../core/deployer/validation.js'
import { validateDesignInput, type ValidatedDesignInput } from '../../core/designer/validation.js'
import { validateReviewInput, type ValidatedReviewInput } from '../../core/reviewer/validation.js'
import { checkListeningReadiness } from '../../core/listener/feedback-readiness.js'
import { scanConnectivity } from '../../core/harness/connectivity-scanner.js'
import { checkConnectivityGate } from '../../core/harness/connectivity-gate.js'
import { runAdrChallengeGate, type GateMode as AdrChallengeMode } from '../../core/designer/adr-challenge-gate.js'
import { wrapDesignPhaseAdvisory, type AdvisoryWrapped } from '../../core/analyzer/out-of-phase-advisory.js'
import { InternalPhaseSchema, type InternalPhase } from '../../core/lifecycle/phase.js'
import {
  nextLifecycleAction,
  type LifecycleState,
  type LifecycleDecision,
} from '../../core/orchestrator/lifecycle-pipeline.js'
import type { GraphDocument } from '../../core/graph/graph-types.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'gate-cmd.ts' })

export interface GateReport {
  checks: Array<{ name: string; passed: boolean; details: string; severity: string }>
  ready: boolean
  score: number
  grade: string
  summary: string
}

interface DocStore {
  toGraphDocument: SqliteStore['toGraphDocument']
  getDb?: SqliteStore['getDb']
  listSnapshots?: SqliteStore['listSnapshots']
}

export const GATE_PHASES = [
  'design',
  'review',
  'handoff',
  'deploy',
  'listening',
  'connectivity',
  'adr-challenge',
  'next',
] as const
export type GatePhase = (typeof GATE_PHASES)[number]

const NEXT_TASK_TYPES = new Set(['task', 'subtask'])
const NEXT_REQUIREMENT_TYPES = new Set(['epic', 'requirement'])

/**
 * Derive the LifecyclePipeline's LifecycleState from the graph. hasValidated/
 * hasReviewed have no dedicated graph marker, so they reuse the existing
 * review/handoff readiness gates as the closest real signal (advisory only —
 * see lifecycleNextToGateReport, which never blocks on this).
 */
function deriveLifecycleState(doc: GraphDocument, currentPhase: InternalPhase): LifecycleState {
  const hasPrd = doc.nodes.some((n) => NEXT_REQUIREMENT_TYPES.has(n.type))
  const hasAdrs = doc.nodes.some((n) => n.type === 'decision')
  const tasks = doc.nodes.filter((n) => NEXT_TASK_TYPES.has(n.type))
  const hasSprintPlan = tasks.length > 0
  const tasksDoneRatio = tasks.length > 0 ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0
  return {
    currentPhase,
    hasPrd,
    hasAdrs,
    hasSprintPlan,
    tasksDoneRatio,
    hasValidated: checkReviewReadiness(doc).ready,
    hasReviewed: checkHandoffReadiness(doc).ready,
  }
}

/** Adapt LifecycleDecision to the common GateReport shape. Always ready=true: this is an
 *  advisory suggestion (what to do next), not a pass/fail readiness check. */
function lifecycleNextToGateReport(decision: LifecycleDecision, tasksDoneRatio: number): GateReport {
  const score = Math.round(tasksDoneRatio * 100)
  const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D'
  return {
    ready: true,
    score,
    grade,
    checks: [
      {
        name: 'lifecycle_next_action',
        passed: true,
        details: `${decision.action} (fase: ${decision.phase}) — ${decision.reason}`,
        severity: 'recommended',
      },
    ],
    summary: decision.reason,
  }
}

/** Read real hasSnapshots/knowledgeCount state so the deploy gate reflects the project, not defaults. */
export function readDeployOptions(store: DocStore): ValidatedDeployOptions {
  const hasSnapshots = (store.listSnapshots?.() ?? []).length > 0
  let knowledgeCount = 0
  if (store.getDb) {
    const row = store.getDb().prepare('SELECT COUNT(*) as count FROM knowledge_documents').get() as
      { count: number } | undefined
    knowledgeCount = row?.count ?? 0
  }
  return validateDeployOptions({ hasSnapshots, knowledgeCount })
}

const RUNNERS: Record<
  Exclude<GatePhase, 'connectivity' | 'adr-challenge' | 'next'>,
  (store: DocStore, opts?: ValidatedDesignInput | ValidatedReviewInput) => GateReport
> = {
  design: (s, opts) => checkDesignReadiness(s.toGraphDocument(), opts as ValidatedDesignInput | undefined),
  review: (s, opts) => checkReviewReadiness(s.toGraphDocument(), opts as ValidatedReviewInput | undefined),
  handoff: (s) => checkHandoffReadiness(s.toGraphDocument()),
  deploy: (s) => checkDeployReadiness(s.toGraphDocument(), readDeployOptions(s)),
  listening: (s) => checkListeningReadiness(s.toGraphDocument()),
}

export interface RunGateOptions {
  /** Actual current lifecycle phase of the project (e.g. from `agf phase`).
   *  Only affects the `design` gate — wraps the report as an out-of-phase
   *  advisory (non-binding) when this differs from 'DESIGN'. */
  currentPhase?: InternalPhase
  /** Project root — required for the 'connectivity' gate (scans the filesystem + reads harness_history for the baseline). */
  rootDir?: string
  /** Connectivity floor percentage for the 'connectivity' gate. Default: 80. */
  connectivityThreshold?: number
  /** Mode for the 'adr-challenge' gate: strict blocks, advisory warns, off skips. Default: advisory. */
  adrChallengeMode?: AdrChallengeMode
  /** Only affects the `design` gate — narrows which recommended checks run (see `checkDesignReadiness`). */
  designOptions?: ValidatedDesignInput
  /** Only affects the `review` gate — see `checkReviewReadiness`. */
  reviewOptions?: ValidatedReviewInput
}

/** Adapt AdrChallengeGateResult to the common GateReport shape used by every other gate. */
function adrChallengeToGateReport(result: ReturnType<typeof runAdrChallengeGate>): GateReport {
  const score =
    result.totalDecisions === 0
      ? 100
      : Math.round(((result.totalDecisions - result.failedDecisions.length) / result.totalDecisions) * 100)
  const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D'
  return {
    ready: !result.blocked,
    score,
    grade,
    checks: [
      {
        name: 'adr_challenge',
        passed: result.failedDecisions.length === 0,
        details:
          result.totalDecisions === 0
            ? 'Nenhum decision node encontrado — considere adicionar ADRs'
            : `${result.totalDecisions - result.failedDecisions.length}/${result.totalDecisions} decisão(ões) passaram o challenge`,
        severity: 'recommended',
      },
    ],
    summary: result.warnings.map((w) => w.message).join('; ') || 'Nenhum decision node para desafiar',
  }
}

/** Read the previous scan's connectivity score from harness_history, if any (reuse, no re-scan). */
function readConnectivityBaseline(store: DocStore): number | undefined {
  if (!store.getDb) return undefined
  const db = store.getDb()
  const lastRow = db.prepare('SELECT breakdown FROM harness_history ORDER BY timestamp DESC LIMIT 1').get() as
    { breakdown: string } | undefined
  if (!lastRow) return undefined
  try {
    const parsed = JSON.parse(lastRow.breakdown) as { connectivity?: { score?: number } }
    return typeof parsed.connectivity?.score === 'number' ? parsed.connectivity.score : undefined
  } catch {
    return undefined
  }
}

export function runGate(
  store: DocStore,
  phase: string,
  opts?: RunGateOptions,
): GateReport | AdvisoryWrapped<'design_ready'> | null {
  if (phase === 'connectivity') {
    if (!opts?.rootDir) return null
    const result = scanConnectivity({ rootDir: opts.rootDir })
    const baseline = readConnectivityBaseline(store)
    const report = checkConnectivityGate(result, { threshold: opts.connectivityThreshold, baseline })
    emitTransversalHook('on_gate_check', { phase, ready: report.ready, score: report.score, grade: report.grade })
    return report as GateReport
  }

  if (phase === 'adr-challenge') {
    const mode = opts?.adrChallengeMode ?? 'advisory'
    const result = runAdrChallengeGate(store as unknown as SqliteStore, mode)
    const report = adrChallengeToGateReport(result)
    emitTransversalHook('on_gate_check', { phase, ready: report.ready, score: report.score, grade: report.grade })
    return report
  }

  if (phase === 'next') {
    const doc = store.toGraphDocument()
    const state = deriveLifecycleState(doc, opts?.currentPhase ?? 'ANALYZE')
    const decision = nextLifecycleAction(state)
    const report = lifecycleNextToGateReport(decision, state.tasksDoneRatio)
    emitTransversalHook('on_gate_check', { phase, ready: report.ready, score: report.score, grade: report.grade })
    return report
  }

  const runner = RUNNERS[phase as Exclude<GatePhase, 'connectivity' | 'adr-challenge' | 'next'>]
  if (!runner) return null
  const runnerOpts = phase === 'design' ? opts?.designOptions : phase === 'review' ? opts?.reviewOptions : undefined
  const report = runner(store, runnerOpts)
  emitTransversalHook('on_gate_check', { phase, ready: report.ready, score: report.score, grade: report.grade })
  if (phase === 'design' && opts?.currentPhase) {
    return wrapDesignPhaseAdvisory(opts.currentPhase, 'design_ready', report as unknown as Record<string, unknown>)
  }
  return report
}

function isGateReport(report: GateReport | AdvisoryWrapped<'design_ready'>): report is GateReport {
  return 'ready' in report
}

/** Builds the `agf gate` CLI command (Commander definition). */
export function gateCommand(): Command {
  log.info('gate command registered')
  return new Command('gate')
    .description('Run phase-readiness gates (design, review, handoff, deploy, listening, next, all)')
    .argument('<phase>', `Fase: ${GATE_PHASES.join(' | ')} | all`)
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option(
      '--current-phase <phase>',
      `Fase interna atual do projeto (${InternalPhaseSchema.options.join(' | ')}) — envelopa o gate 'design' como advisory não-vinculante quando difere de DESIGN`,
    )
    .option(
      '--adr-challenge-mode <mode>',
      "Modo do gate 'adr-challenge': strict (bloqueia) | advisory (avisa) | off (pula)",
      'advisory',
    )
    .option('--scope <scope>', "Escopo do gate 'design': full | incremental (pula o harness scan)", 'full')
    .option('--no-include-traceability', "Pula os checks de rastreabilidade no gate 'design'")
    .option('--no-include-coupling', "Pula o check de nós isolados no gate 'design'")
    .option('--min-completion-rate <n>', "Meta de % tasks done p/ o gate 'review' (default: 80)")
    .option('--no-include-harness', "Pula o check de harness grade no gate 'review'")
    .action(
      (
        phase: string,
        opts: {
          dir: string
          currentPhase?: string
          adrChallengeMode: string
          scope: string
          includeTraceability: boolean
          includeCoupling: boolean
          minCompletionRate?: string
          includeHarness: boolean
        },
      ) => {
        const out = createCliOutput('gate')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          let currentPhase: InternalPhase | undefined
          if (opts.currentPhase) {
            const parsed = InternalPhaseSchema.safeParse(opts.currentPhase.toUpperCase())
            if (!parsed.success) {
              out.err(
                'INVALID_PHASE',
                `Fase inválida: "${opts.currentPhase}". Use uma de ${InternalPhaseSchema.options.join(', ')}.`,
              )
              return
            }
            currentPhase = parsed.data
          }
          let designOptions: ValidatedDesignInput
          try {
            designOptions = validateDesignInput({
              scope: opts.scope,
              includeTraceability: opts.includeTraceability,
              includeCoupling: opts.includeCoupling,
            })
          } catch (e) {
            out.err('INVALID_DESIGN_OPTIONS', `Opções inválidas para o gate 'design': ${(e as Error).message}`)
            return
          }
          let reviewOptions: ValidatedReviewInput
          try {
            reviewOptions = validateReviewInput({
              includeHarness: opts.includeHarness,
              minCompletionRate: opts.minCompletionRate === undefined ? undefined : Number(opts.minCompletionRate),
            })
          } catch (e) {
            out.err('INVALID_REVIEW_OPTIONS', `Opções inválidas para o gate 'review': ${(e as Error).message}`)
            return
          }
          const phases: string[] = phase === 'all' ? [...GATE_PHASES] : [phase]
          const results: Array<{ phase: string; report: GateReport | AdvisoryWrapped<'design_ready'> }> = []
          let anyFail = false
          for (const p of phases) {
            const report = runGate(store, p, {
              currentPhase,
              rootDir: opts.dir,
              adrChallengeMode: opts.adrChallengeMode as 'strict' | 'advisory' | 'off',
              designOptions,
              reviewOptions,
            })
            if (!report) {
              out.err('UNKNOWN_PHASE', `Fase desconhecida: ${p}. Use ${GATE_PHASES.join(' | ')} | all.`)
              return
            }
            results.push({ phase: p, report })
            if (isGateReport(report) && !report.ready) anyFail = true
          }
          if (anyFail && phase !== 'all') {
            out.fail('GATE_FAILED', 'One or more phase gates did not pass.', { phases: results })
          } else {
            out.ok({ phases: results, anyFail })
          }
        } finally {
          store.close()
        }
      },
    )
}
