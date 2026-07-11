/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { runHealing, listHealingLog } from '../../core/skills/persist-healing.js'
import { lookupKnownFix, classifyFailure } from '../../core/autonomy/heal-gate.js'
import { getImmuneDashboard } from '../../core/skills/immune-dashboard.js'
import { healKnowledge } from '../../core/knowledge/heal-knowledge.js'
import { diagnoseQuarantinedNode } from '../../core/colony/quarantine-diagnosis.js'
import { autoQuarantineNodes } from '../../core/colony/auto-quarantine.js'
import { analyzeFailurePatterns } from '../../core/analyzer/failure-patterns-analyzer.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'heal-cmd.ts' })

/** Builds the `agf heal` CLI command (Commander definition). */
export function healCommand(): Command {
  log.info('heal command registered')
  return new Command('heal')
    .description('Self-healing do grafo (MAPE-K): detecta e cura, persistindo o resultado')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--apply', 'Aplica as ações curativas ao grafo (default: dry-run)', false)
    .option('--log', 'Mostra o histórico de healing persistido', false)
    .option('--dashboard', 'Mostra o immune dashboard (analytics sobre healing_log + healing_patterns)', false)
    .option('--knowledge', 'Expurga entradas inválidas e stale do knowledge store', false)
    .option('--quarantine', 'Lista nós quarantined com diagnóstico e comandos de remediação', false)
    .option(
      '--patterns',
      'Analisa failure_signals e retorna padrões de falha classificados (severidade + recência)',
      false,
    )
    .option('--window-days <n>', 'Janela em dias para --patterns', '30')
    .option(
      '--known-fix <signature>',
      'Consulta um fix conhecido (helper-record) para uma assinatura de falha, sem re-diagnosticar (T3.3)',
    )
    .option(
      '--recipe <kind>',
      'Classifica um failure-kind via o motor determinístico recovery-recipes (sem LLM, sem store)',
    )
    .action(
      (opts: {
        dir: string
        apply: boolean
        log: boolean
        dashboard: boolean
        knowledge: boolean
        quarantine: boolean
        patterns: boolean
        windowDays: string
        knownFix?: string
        recipe?: string
      }) => {
        const out = createCliOutput('heal')

        if (opts.recipe) {
          out.ok(classifyFailure(opts.recipe))
          return
        }

        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          if (opts.knownFix) {
            const resolution = lookupKnownFix(store, opts.knownFix, Date.now())
            out.ok({ signature: opts.knownFix, ...resolution })
            return
          }

          if (opts.quarantine) {
            const db = store.getDb()
            const projectId = store.getProject()?.id ?? ''
            const rows = db
              .prepare(
                `SELECT id, title, xp_size, blocked, acceptance_criteria, metadata
               FROM nodes
               WHERE status = 'quarantined'
               ${projectId ? 'AND project_id = ?' : ''}
               ORDER BY updated_at ASC`,
              )
              .all(...(projectId ? [projectId] : [])) as Array<{
              id: string
              title: string
              xp_size: string | null
              blocked: number
              acceptance_criteria: string | null
              metadata: string | null
            }>

            const diagnoses = rows.map((row) => {
              const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {}
              const ac = row.acceptance_criteria ? (JSON.parse(row.acceptance_criteria) as string[]) : []
              return diagnoseQuarantinedNode({
                id: row.id,
                title: row.title,
                acceptanceCriteria: ac,
                blocked: row.blocked === 1,
                xpSize: row.xp_size ?? undefined,
                failureCount: typeof meta['failureCount'] === 'number' ? meta['failureCount'] : undefined,
                lastError: typeof meta['lastError'] === 'string' ? meta['lastError'] : undefined,
              })
            })

            out.ok({ quarantined: diagnoses.length, diagnoses })
            return
          }

          if (opts.patterns) {
            const windowDays = Number.parseInt(opts.windowDays, 10)
            const report = analyzeFailurePatterns(store.getDb(), windowDays)
            out.ok({ ...report })
            return
          }

          if (opts.knowledge) {
            const result = healKnowledge(store.getDb(), { dryRun: !opts.apply })
            out.ok({
              mode: opts.apply ? 'apply' : 'dry-run',
              ...result,
            })
            return
          }

          if (opts.dashboard) {
            const data = getImmuneDashboard(store)
            out.ok({ dashboard: true, ...data })
            return
          }

          if (opts.log) {
            const rows = listHealingLog(store)
            out.ok({
              log: true,
              entries: rows.map((r) => ({
                applied: r.applied,
                success: r.success,
                issueType: r.issueType,
                severity: r.severity,
                actionType: r.actionType,
                nodeId: r.nodeId,
              })),
            })
            return
          }

          const { report, applied, detected } = runHealing(store, { apply: opts.apply })

          const projectId = store.getProject()?.id ?? ''
          const autoQuarantine = opts.apply
            ? autoQuarantineNodes(store.getDb(), projectId, 5)
            : { count: 0, quarantined: [] }

          out.ok({
            mode: opts.apply ? 'apply' : 'dry-run',
            detected,
            applied,
            actionCount: report.actions.length,
            issues: report.issues.map((issue) => ({
              severity: issue.severity,
              type: issue.type,
              title: issue.title,
              nodeId: issue.nodeId,
            })),
            autoQuarantine,
            hint: opts.apply
              ? `${applied} ação(ões) aplicada(s) e persistida(s) no grafo. ${autoQuarantine.count > 0 ? `${autoQuarantine.count} nó(s) auto-quarantinado(s).` : ''}`.trim()
              : detected > 0
                ? 'Dry-run: nada foi alterado. Use --apply para curar e persistir.'
                : 'Grafo saudável — nada a curar.',
          })
        } finally {
          store.close()
        }
      },
    )
}
