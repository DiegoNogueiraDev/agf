/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import {
  runImmuneCycle,
  queryImmuneSummary,
  listImmuneCycles,
  readGlobalMemoryEntries,
  queryImmuneDashboard,
} from '../../core/immune/index.js'

const log = createLogger({ layer: 'cli', source: 'immune-cmd.ts' })

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Builds the `agf immune` CLI command (Commander definition). */
export function immuneCommand(): Command {
  log.info('immune command registered')
  return new Command('immune')
    .description('Immune System: Danger Theory error detection and recovery')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--run', 'Executa um ciclo imune completo (detect → present → gate → respond → verify → persist)', false)
    .option('--ledger', 'Mostra o histórico do immune ledger', false)
    .option('--summary', 'Mostra o resumo do immune ledger', false)
    .option('--dashboard', 'Mostra o dashboard completo com tendências e análise custo-benefício', false)
    .option('--global', 'Mostra a memória imune global (cross-project)', false)
    .option('--source <pattern>', 'Glob pattern para escanear arquivos (default: src/**/*.ts)')
    .action(
      (opts: {
        dir: string
        run: boolean
        ledger: boolean
        summary: boolean
        dashboard: boolean
        global: boolean
        source?: string
      }) => {
        const out = createCliOutput('immune')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const db = store.getDb()
          const projectId = store.getProject()?.id ?? 'default'

          if (opts.summary) {
            const summary = queryImmuneSummary(db, projectId)
            out.ok(summary)
            return
          }

          if (opts.ledger) {
            const cycles = listImmuneCycles(db, projectId, 50)
            out.ok({ cycles })
            return
          }

          if (opts.global) {
            const records = readGlobalMemoryEntries()
            out.ok({ records, count: records.length })
            return
          }

          if (opts.dashboard) {
            const stats = queryImmuneDashboard(db, projectId)
            const lines: string[] = [
              '',
              '=== Immune Dashboard ===',
              '',
              `Total Cycles:         ${stats.totalCycles}`,
              `Total Signals:         ${stats.totalSignals}`,
              `Total Antigens:        ${stats.totalAntigens}`,
              `Responses Generated:   ${stats.totalResponsesGenerated}`,
              `Responses Applied:     ${stats.totalResponsesApplied}`,
              `Responses Gated:       ${stats.totalResponsesGated}`,
              `Failed Verification:   ${stats.totalResponsesFailedVerify}`,
              '',
              '--- Rates ---',
              `Avg Recovery Rate:     ${formatPct(stats.avgRecoveryRate)}`,
              `Avg Gate Pass Rate:    ${formatPct(stats.avgGatePassRate)}`,
              `Avg Verify Pass Rate:  ${formatPct(stats.avgVerificationPassRate)}`,
              '',
              '--- Cost-Benefit (estimated tokens) ---',
              `Tokens Saved (gated):  ${stats.costBenefitSummary.estimatedTokensSaved}`,
              `Tokens Spent (applied): ${stats.costBenefitSummary.estimatedTokensSpent}`,
              `Net Token Benefit:     ${stats.costBenefitSummary.netTokenBenefit >= 0 ? '+' : ''}${stats.costBenefitSummary.netTokenBenefit}`,
              '',
            ]
            if (stats.trendByCycle.length > 0) {
              lines.push('--- Trend (last 5 cycles) ---')
              const recent = stats.trendByCycle.slice(-5)
              for (const t of recent) {
                lines.push(
                  `  ${t.cycleId}: recovery=${formatPct(t.recoveryRate)} gate=${formatPct(t.gatePassRate)} verify=${formatPct(t.verificationPassRate)} ${formatDuration(t.durationMs)}`,
                )
              }
              lines.push('')
            }
            lines.push(`Last cycle: ${stats.lastCycleAt ? new Date(stats.lastCycleAt).toISOString() : 'never'}`)
            out.ok({ dashboard: lines.join('\n'), stats })
            return
          }

          if (opts.run) {
            const pattern = opts.source ?? 'src/**/*.ts'
            const files = globSync(pattern, { cwd: opts.dir, ignore: ['**/node_modules/**', '**/*.d.ts'] })
            const sourceFiles = files.map((f) => ({
              path: f,
              content: readFileSync(f, 'utf-8'),
            }))

            const result = runImmuneCycle(db, projectId, sourceFiles, 'manual')

            const gatedCount = result.costBenefitDecisions.filter((d) => !d.passed).length
            const verifyFailCount = result.verificationResults.filter((v) => v.status === 'failed').length

            out.ok({
              cycleId: result.cycleId,
              signalsDetected: result.signals.length,
              antigensPresented: result.antigens.length,
              responsesGeneratedAll: result.responses.length,
              responsesAfterGate: result.responses.length - gatedCount,
              responsesApplied: result.responses.filter((r) => r.applied).length,
              responsesGated: gatedCount,
              responsesFailedVerify: verifyFailCount,
              recoveryRate: result.ledger.recoveryRate,
              gatePassRate: result.ledger.gatePassRate,
              verificationPassRate: result.ledger.verificationPassRate,
              estimatedTokensSaved: result.ledger.estimatedTokensSaved,
              estimatedTokensSpent: result.ledger.estimatedTokensSpent,
              durationMs: result.durationMs,
              signals: result.signals.map((s) => ({
                kind: s.kind,
                file: s.file,
                line: s.line,
                severity: s.severity,
              })),
              responses: result.responses.map((r) => ({
                id: r.id,
                antigenId: r.antigenId,
                actionKind: r.actionKind,
                targetFile: r.targetFile,
                affinity: r.affinity,
                affinityScore: r.affinityScore,
                applied: r.applied,
                description: r.description,
              })),
              gateDecisions: result.costBenefitDecisions.map((d) => ({
                responseId: d.responseId,
                passed: d.passed,
                expectedValue: d.expectedValue,
                reason: d.reason,
              })),
            })
            return
          }

          out.ok({
            hint: 'Use --run para executar um ciclo imune, --ledger para histórico, --summary para resumo, --dashboard para dashboard completo, --global para memória cross-project.',
          })
        } finally {
          store.close()
        }
      },
    )
}
