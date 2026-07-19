/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { runHarnessScan } from '../../core/harness/harness-scan-runner.js'
import { checkArchitectureFitness } from '../../core/harness/harness-gate.js'
import { buildDormantReport } from '../../core/harness/dormant-report.js'
import { runContractScan } from '../../core/harness/contract-engine.js'
import { runFuzzScan } from '../../core/harness/fuzz-sec.js'
import { runSynthScan } from '../../core/harness/synthetic-data-gen.js'
import { checkJavaJointCompilation } from '../../core/harness/java-joint-compile-check.js'
import { buildAdviceEntries } from '../../core/harness/harness-advice-generator.js'
import { getEvolutionReport } from '../../core/harness/harness-evolution.js'
import { calculateParetoPriority, buildDimensionGaps } from '../../core/harness/pareto-priority.js'
import type { HarnessDimension, ViolationDetail } from '../../core/harness/violation-detail.js'
import { evaluate as evaluateRemediation } from '../../core/harness/remediation-engine.js'
import { validateRemediationDiff } from '../../core/harness/remediation-validator.js'
import { fuseSensors, type DimensionScores } from '../../core/harness/sensor-fusion.js'
import { identifyQuickWins, generateMicroPRPlan } from '../../core/harness/self-healing-planner.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'harness-cmd.ts' })

// HarnessDimension (7 values) excludes provenance/connectivity — those
// two aren't part of the ranked set.
const PARETO_DIMENSIONS: HarnessDimension[] = ['types', 'tests', 'fitness', 'docs', 'naming', 'errors', 'context']

/** Builds the `agf harness` CLI command (Commander definition). */
export function harnessCommand(): Command {
  log.info('harness command registered')
  return new Command('harness')
    .description('Scan harnessability score (type, test, docs, architecture, naming, errors, context)')
    .option('-d, --dir <dir>', 'Project root directory', process.cwd())
    .option('--violations', 'Include file-level violations in output', false)
    .option('--saturation', 'Attach deterministic dimension-saturation signal (needs prior history)', false)
    .option('--evolution', 'Attach earliest-vs-latest harness_history score delta (needs prior history)', false)
    .option('--memory', 'Attach prior-session score/grade/patterns and persist the current one', false)
    .option(
      '--remediate',
      'Attach deterministic per-violation fix suggestions (16 rule templates, confidence>=0.8, suppression-aware). Implies --violations.',
      false,
    )
    .option('--gate', 'CI gate: exit 1 when architecture fitness < --threshold', false)
    .option('--threshold <pct>', 'Minimum fitness % for --gate (default: 100)', '100')
    .option('--dormant', 'List core capabilities with no surface consumer (no-surface)', false)
    .option(
      '--self-heal',
      'MAPE-K quick-wins: rank dimensions below threshold by improvement potential and emit dry-run micro-PR plans',
      false,
    )
    .option('--contracts', 'Validate source files against architecture rules compiled from .claude/rules/*.md', false)
    .option(
      '--fuzz <module>',
      'Fuzz every single-arg exported function of <module> (relative to --dir) with adversarial inputs',
    )
    .option(
      '--synth <module>',
      'Generate minimal + edge-case fixtures for every exported Zod object schema of <module> (relative to --dir)',
    )
    .option(
      '--java-check <dir>',
      'Concatenate .java files under <dir> for joint compilation and validate the result has ≤1 public type',
    )
    .option(
      '--validate-remediation <beforeFile>',
      'Compare a prior violation snapshot (JSON file: {violations: ViolationDetail[]}) against the current scan; confirms fixed violations, auto-suppresses unchanged ones, and promotes meta-rules at 3+ confirmations',
    )
    .action(
      async (opts: {
        dir: string
        violations: boolean
        saturation: boolean
        evolution: boolean
        memory: boolean
        remediate: boolean
        gate: boolean
        threshold: string
        dormant: boolean
        selfHeal: boolean
        contracts: boolean
        fuzz?: string
        synth?: string
        javaCheck?: string
        validateRemediation?: string
      }) => {
        const out = createCliOutput('harness')
        const collectViolations = opts.violations || opts.remediate

        if (opts.contracts) {
          out.ok(runContractScan(opts.dir))
          return
        }

        if (opts.fuzz) {
          out.ok(await runFuzzScan(opts.dir, opts.fuzz))
          return
        }

        if (opts.synth) {
          out.ok(await runSynthScan(opts.dir, opts.synth))
          return
        }

        if (opts.javaCheck) {
          out.ok(checkJavaJointCompilation(opts.javaCheck))
          return
        }

        // --saturation/--evolution/--memory/--remediate/--validate-remediation
        // need a store (history / suppression / validation-ledger lookups); open
        // it so the scan can read prior breakdowns too. Stay store-less
        // otherwise → byte-identical output for existing callers.
        let store: ReturnType<typeof openStoreOrFail> | undefined
        let db: Database.Database | undefined
        if (opts.saturation || opts.evolution || opts.memory || opts.remediate || opts.validateRemediation) {
          try {
            store = openStoreOrFail(opts.dir, { requireExisting: true })
            db = store.getDb()
          } catch (err) {
            log.debug('harness:no-store', {
              reason: 'saturation/evolution/memory/remediate requested but store unavailable',
              error: String(err),
            })
          }
        }

        if (opts.dormant) {
          const report = buildDormantReport({ rootDir: opts.dir })
          out.ok(report)
          return
        }

        if (opts.selfHeal) {
          const result = runHarnessScan(opts.dir, undefined, undefined, { collectViolations: false })
          const quickWins = identifyQuickWins(
            PARETO_DIMENSIONS.map((dim) => ({
              name: dim,
              score: result.breakdown[dim].score,
              weight: result.breakdown[dim].weight,
            })),
          )
          const plans = quickWins.map((win) => generateMicroPRPlan(win, true))
          out.ok({ quickWins, plans })
          return
        }

        if (opts.gate) {
          const gateResult = checkArchitectureFitness(opts.dir, { threshold: parseInt(opts.threshold, 10) })
          // A failed gate must report ok:false — out.fail sets exitCode=1, so the
          // envelope and the shell exit agree (no {ok:true} + process.exit(1) lie).
          if (!gateResult.pass) {
            out.fail('GATE_FAILED', 'Architecture fitness below threshold', gateResult)
            return
          }
          out.ok(gateResult)
          return
        }

        if (opts.validateRemediation) {
          if (!db) {
            out.fail('STORE_NOT_FOUND', 'agf harness --validate-remediation requires an initialized graph store', null)
            store?.close()
            return
          }
          const before = JSON.parse(readFileSync(opts.validateRemediation, 'utf-8')) as {
            violations: ViolationDetail[]
          }
          const after = runHarnessScan(opts.dir, db, undefined, { collectViolations: true, maxViolations: 50 })
          out.ok(validateRemediationDiff(before.violations, after.violations ?? [], db))
          store?.close()
          return
        }

        try {
          const result = runHarnessScan(opts.dir, db, undefined, {
            collectViolations,
            maxViolations: 50,
            includeSaturation: opts.saturation,
            includeMemory: opts.memory,
          })
          const advice = opts.violations
            ? buildAdviceEntries({
                breakdown: result.breakdown,
                typeViolations: (result.violations ?? []).filter((v) => v.dimension === 'types'),
                testViolations: (result.violations ?? []).filter((v) => v.dimension === 'tests'),
              })
            : undefined
          const remediation = opts.remediate ? evaluateRemediation(result.violations ?? [], db) : undefined
          // getEvolutionReport must read the same project_id runHarnessScan wrote
          // harness_history under (its own 'proj_local' default) — the store's real
          // project UUID would look under an empty history and always return null.
          const evolution = opts.evolution && db ? getEvolutionReport(db) : undefined
          // Pareto-priority: which dimension to fix first for max score gain.
          const priority = opts.violations
            ? calculateParetoPriority(
                buildDimensionGaps(Object.fromEntries(PARETO_DIMENSIONS.map((dim) => [dim, result.breakdown[dim]]))),
              )
            : undefined
          // Sensor-fusion: groups CORRELATED weak dimensions into a semantic
          // root-cause cluster (e.g. types+errors → "code_quality") — a
          // different lens than --priority's single-dimension ranking.
          const clusters = opts.violations
            ? fuseSensors(
                PARETO_DIMENSIONS.reduce((acc, dim) => {
                  acc[dim] = result.breakdown[dim].score
                  return acc
                }, {} as DimensionScores),
              )
            : undefined
          out.ok({
            ...result,
            ...(advice && advice.length > 0 ? { advice } : {}),
            ...(evolution ? { evolution } : {}),
            ...(priority && priority.length > 0 ? { priority } : {}),
            ...(remediation && remediation.length > 0 ? { remediation } : {}),
            ...(clusters && clusters.length > 0 ? { clusters } : {}),
          })
        } finally {
          store?.close()
        }
      },
    )
}
