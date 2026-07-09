/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { openStoreOrFail } from '../open-store.js'
import { makeFileExists } from '../shared/file-exists-port.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { dispatchHookWithResult } from '../../core/hooks/register-hook.js'
import {
  detectAllGaps,
  buildGapReport,
  getGapsHistory,
  formatGapsHistory,
  GAP_KINDS,
  type GapKind,
  type GapSeverity,
} from '../../core/gaps/index.js'
import { suggestEdgeCaseStubs } from '../../core/gaps/suggest-edge-case.js'
import { suggestTraceabilityFixes } from '../../core/gaps/traceability-suggest.js'
import { applyGaps } from '../../core/gaps/gap-applier.js'
import { sortGapsByImpact } from '../../core/gaps/gap-ordering.js'

const log = createLogger({ layer: 'cli', source: 'gaps-cmd.ts' })
const SEVERITIES: GapSeverity[] = ['required', 'recommended']

/** Builds the `agf gaps` CLI command (Commander definition). */
export function gapsCommand(): Command {
  log.info('gaps command registered')
  return new Command('gaps')
    .description('Detect SHAPE completeness gaps + emit driver-agnostic enrichment requests (zero MCP, ~0 token)')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--kind <kind>', `Filtra por kind: ${GAP_KINDS.join(' | ')}`)
    .option('--severity <level>', `Mostra só: ${SEVERITIES.join(' | ')}`)
    .option('--limit <n>', 'Máx. de gaps por kind no output humano', (v) => Number.parseInt(v, 10), 15)
    .option('--history', 'Mostra a timeline de completude (snapshots passados)', false)
    .option('--json', 'Força output JSON (ok-envelope) em vez de texto formatado')
    .option('--select <path>', 'Dot-path filter no campo data do envelope (ex.: data.gaps)')
    .option('--suggest <nodeId>', 'For missing_edge_case: return stubs and applyVia for the given node')
    .option('--apply', 'Batch-apply deterministic gaps (dry-run by default; add --commit to mutate)', false)
    .option('--commit', 'Execute deterministic applyVia commands (requires --apply)', false)
    .action(
      async (opts: {
        dir: string
        kind?: string
        severity?: string
        limit: number
        history?: boolean
        json?: boolean
        select?: string
        suggest?: string
        apply?: boolean
        commit?: boolean
      }) => {
        const out = createCliOutput('gaps')
        if (opts.kind && !GAP_KINDS.includes(opts.kind as GapKind)) {
          out.err('UNKNOWN_KIND', `Kind desconhecido: ${opts.kind}. Use ${GAP_KINDS.join(' | ')}.`)
          return
        }
        if (opts.severity && !SEVERITIES.includes(opts.severity as GapSeverity)) {
          out.err('UNKNOWN_SEVERITY', `Severity desconhecida: ${opts.severity}. Use ${SEVERITIES.join(' | ')}.`)
          return
        }
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          if (opts.suggest) {
            const doc = store.toGraphDocument()
            if (opts.kind === 'traceability_break' || !opts.kind) {
              // Traceability suggest: aggregate all inferrer proposals
              if (opts.kind === 'traceability_break') {
                const result = suggestTraceabilityFixes(doc)
                if (result.ready) {
                  out.ok({ ready: true, commands: [] })
                } else {
                  out.ok(result)
                }
                return
              }
            }
            // missing_edge_case suggest: per-node stubs
            const result = suggestEdgeCaseStubs(doc, opts.suggest)
            if (result.code === 'NO_GAP') {
              out.err('NO_GAP', `Node ${opts.suggest} has no missing_edge_case gap`)
            } else if (result.code === 'NOT_FOUND') {
              out.err('NOT_FOUND', `Node ${opts.suggest} not found`)
            } else {
              out.ok(result)
            }
            return
          }
          if (opts.apply) {
            const { execSync } = await import('node:child_process')
            const doc = store.toGraphDocument()
            const allGaps = detectAllGaps(doc, undefined, { fileExists: makeFileExists(opts.dir) })
            const dryRun = !opts.commit
            const result = applyGaps(allGaps, {
              dryRun,
              execute: (cmd) => execSync(cmd, { stdio: 'inherit' }),
            })
            out.ok({ dryRun, applied: result.applied.length, skipped: result.skipped.length, details: result })
            return
          }

          if (opts.history) {
            out.ok({ history: formatGapsHistory(getGapsHistory(store.getDb())) })
            return
          }
          const doc = store.toGraphDocument()
          const kinds = opts.kind ? [opts.kind as GapKind] : undefined
          const rawGaps = detectAllGaps(doc, kinds, { fileExists: makeFileExists(opts.dir) })
          const report = buildGapReport(sortGapsByImpact(rawGaps, doc))

          // Fire gate:check hook with gap report data (deterministic, ~0 token).
          // Allows enforcement handlers to react to completeness findings.
          dispatchHookWithResult('gate:check', {
            ready: report.ready,
            gapCount: report.gaps.length,
            requiredCount: report.gaps.filter((g) => g.severity === 'required').length,
            kinds: [...new Set(report.gaps.map((g) => g.kind))],
          })

          if (!report.ready) {
            out.fail('GAPS_FOUND', 'Completeness gaps detected', report)
          } else {
            out.ok(report)
          }
        } finally {
          store.close()
        }
      },
    )
}
