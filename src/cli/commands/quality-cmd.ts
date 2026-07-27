/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Command } from 'commander'
import { evaluateProjectQuality } from '../../core/harness/project-quality.js'
import type { SourceFile } from '../../core/harness/logging-coverage-scanner.js'
import { scoreKnowledgeStore } from '../../core/rag/knowledge-store-health.js'
import { buildAnalyzerReport } from '../../core/analyzer/index.js'
import { saveQualitySnapshot } from '../../core/harness/quality-snapshot.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'

const log = createLogger({ layer: 'cli', source: 'quality-cmd.ts' })

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'tools'])

/** Coarse SQALE-style remediation estimate: hours to add test+logging signal per dark module. */
const HOURS_PER_DARK_MODULE = 0.5

/** Map a 0–100 quality score to a letter grade (A≥90, B≥75, C≥60, else D). */
function qualityGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

function collectSources(root: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(full)
      else if (/\.[tj]sx?$/.test(name) && !name.endsWith('.d.ts')) {
        try {
          out.push({ path: full, content: readFileSync(full, 'utf8') })
        } catch {
          /* arquivo ilegível — ignora */
        }
      }
    }
  }
  walk(root)
  return out
}

/** Builds the `agf quality` CLI command (Commander definition). */
export function qualityCommand(): Command {
  log.info('quality command registered')
  return new Command('quality')
    .description('Gate de qualidade 95/95 (testes + logs) sobre src/ — falha (exit≠0) se abaixo do limiar')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .option('--min-tests <n>', 'Limiar de cobertura de testes (%)', '95')
    .option('--min-logs <n>', 'Limiar de cobertura de logging (%)', '95')
    .option('--knowledge-store', 'Score de saúde do RAG knowledge store')
    .option('--analyzers', 'Report-only: roda os 16 analyzer quality-checkers (coverage/integrity/security/…)')
    .option(
      '--snapshot',
      'Persiste um snapshot de qualidade (harness+testes+logs) e reporta a tendência vs. o snapshot anterior',
    )
    .action(
      (opts: {
        dir: string
        minTests: string
        minLogs: string
        knowledgeStore?: boolean
        analyzers?: boolean
        snapshot?: boolean
      }) => {
        const out = createCliOutput('quality')

        // §E2.1 — Knowledge store RAG health score.
        if (opts.knowledgeStore) {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            out.ok(scoreKnowledgeStore(store.getDb()))
          } finally {
            store.close()
          }
          return
        }

        // B3 — Weekly quality snapshot + regression trend vs. the previous one.
        if (opts.snapshot) {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            const trend = saveQualitySnapshot(opts.dir, store)
            if (!trend) {
              out.fail('SNAPSHOT_FAILED', 'Could not collect a quality snapshot (harness scan error)', {})
              return
            }
            out.ok(trend)
          } finally {
            store.close()
          }
          return
        }

        // Report-only: aggregate the analyzer quality-checkers over graph + source.
        // Diagnostic surface for previously-dormant checkers — never gates (golden rule 9).
        if (opts.analyzers) {
          const store = openStoreOrFail(opts.dir, { requireExisting: true })
          try {
            out.ok(buildAnalyzerReport(store.toGraphDocument(), opts.dir))
          } finally {
            store.close()
          }
          return
        }

        const thresholds = {
          tests: parseInt(opts.minTests, 10) || 95,
          logs: parseInt(opts.minLogs, 10) || 95,
        }
        const files = collectSources(join(opts.dir, 'src'))
        const r = evaluateProjectQuality(files, thresholds)

        // Letter grade from the weakest quality dimension (mirrors harness banding).
        const grade = qualityGrade(Math.min(r.testScore, r.logScore))
        // Hotspots = "dark" modules (no test/logging signal); debtHours = coarse
        // SQALE-style remediation estimate (documented constant per dark module).
        const hotspots = r.darkModules
        const debtHours = +(r.darkModules.length * HOURS_PER_DARK_MODULE).toFixed(1)

        if (r.gate.passed) {
          out.ok({
            totalModules: r.totalModules,
            testScore: r.testScore,
            logScore: r.logScore,
            grade,
            hotspots,
            debtHours,
            thresholds,
            gatePassed: true,
          })
        } else {
          out.fail(
            'GATE_FAILED',
            `Gate reprovado: ${r.gate.failures.map((f) => `${f.dimension} ${f.score}<${f.threshold}`).join(', ')}`,
            {
              totalModules: r.totalModules,
              testScore: r.testScore,
              logScore: r.logScore,
              grade,
              hotspots,
              debtHours,
              thresholds,
              gatePassed: false,
              failures: r.gate.failures,
              darkModules: r.darkModules.length > 0 ? r.darkModules : undefined,
            },
          )
        }
      },
    )
}
