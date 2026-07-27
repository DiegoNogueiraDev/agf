/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

/**
 * `agf lifecycle <phase>` — wires the dormant runLifecycleFacade (fan-out of
 * analyze() modes for a lifecycle phase) to the CLI. Reuses the analyzer
 * sections already computed by buildAnalyzerReport (agf quality --analyzers)
 * instead of re-implementing per-mode checks — modes without a matching
 * analyzer section report a mode_failed warning rather than crashing.
 */

import { Command } from 'commander'
import { buildAnalyzerReport } from '../../core/analyzer/index.js'
import type { AnalyzerReport } from '../../core/analyzer/index.js'
import {
  runLifecycleFacade,
  type ModeInvoker,
  type ModeOutput,
  type LifecycleFacadeReport,
} from '../../core/planner/lifecycle-facade.js'
import type { LifecyclePhase } from '../../core/planner/lifecycle-phase.js'
import type { GraphDocument } from '../../core/graph/graph-types.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'lifecycle-cmd.ts' })

interface DocStore {
  toGraphDocument: () => GraphDocument
}

/** Maps facade mode names to the matching AnalyzerReport section. Modes with no analyzer stay unmapped on purpose. */
function modeOutputsFromReport(report: AnalyzerReport): Record<string, Record<string, unknown>> {
  return {
    prd_quality: { ...report.graph.prdQuality },
    formula_consistency: { ...report.graph.formulaConsistency },
    contract_coverage: { ...report.graph.contractCoverage },
    config_coverage: { ...report.graph.configCoverage },
    data_integrity: { ...report.graph.dataIntegrity },
    metric_coverage: { ...report.graph.metricCoverage },
    concurrency_risk: { ...report.graph.concurrencyRisk },
    scenario_coverage: { ...report.graph.scenarioCoverage },
    state_completeness: { ...report.graph.stateCompleteness },
    asset_blockers: { ...report.graph.assetBlockers },
    performance_budget: { ...report.graph.performanceBudgets },
    code_quality: { ...report.code.codeQuality },
    observability_check: { ...report.code.observability },
    security_scan: { ...report.code.securityScan },
    test_coverage: { ...report.code.testCoverage },
  }
}

/** Build a ModeInvoker backed by an already-computed AnalyzerReport (no per-mode recomputation). */
export function buildLifecycleModeInvoker(report: AnalyzerReport): ModeInvoker {
  const outputs = modeOutputsFromReport(report)
  return async (mode: string): Promise<ModeOutput> => {
    const payload = outputs[mode]
    if (!payload) return { ok: false, error: `analyzer not wired for mode "${mode}"` }
    return { ok: true, payload }
  }
}

/** Run the lifecycle facade for `phase`, sourcing mode outputs from buildAnalyzerReport(dir). */
export function runLifecycleCli(
  store: DocStore,
  phase: string,
  dir: string,
  mode?: string,
): Promise<LifecycleFacadeReport> {
  const report = buildAnalyzerReport(store.toGraphDocument(), dir)
  const invoker = buildLifecycleModeInvoker(report)
  return runLifecycleFacade(invoker, phase.toUpperCase() as LifecyclePhase, mode)
}

/** Builds the `agf lifecycle` CLI command (Commander definition). */
export function lifecycleCommand(): Command {
  log.info('lifecycle command registered')
  return new Command('lifecycle')
    .description(
      'Fan out analyze() modes for a lifecycle phase (ANALYZE/DESIGN/PLAN/IMPLEMENT/VALIDATE/REVIEW/HANDOFF/DEPLOY/LISTENING) into one report',
    )
    .argument('<phase>', 'Lifecycle phase')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--mode <mode>', 'Run only this single analyze() mode')
    .action(async (phase: string, opts: { dir: string; mode?: string }) => {
      const out = createCliOutput('lifecycle')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const report = await runLifecycleCli(store, phase, opts.dir, opts.mode)
        out.ok(report)
      } finally {
        store.close()
      }
    })
}
