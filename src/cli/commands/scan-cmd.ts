/*!
 * WHY: `agf scan` aggregates findings from multiple quality sources (harness
 * violations, LSP diagnostics, lint) into a single findings envelope so agents
 * can query all issues without knowing each source's API.
 *
 * Composes with: harness-scan-runner (violations), lsp-diagnostics (LSP),
 *                cli-output (JSON envelope), open-store (dir resolution).
 * Contract: { findings: ScanFinding[] } — each finding has file/line/severity/message/source.
 */

import { execSync } from 'node:child_process'
import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { openStoreOrFail } from '../open-store.js'
import { runHarnessScan } from '../../core/harness/harness-scan-runner.js'
import type { ViolationDetail } from '../../core/harness/violation-detail.js'
import { parseTscOutput } from '../../core/scan/typecheck-source.js'
import { scanConfigSecurity } from '../../core/scan/security-source.js'
import { scanTaint } from '../../core/scan/taint-source.js'
import { applyFindings, type ApplyFindingsResult } from '../../core/scan/apply-findings.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
// Single source of truth lives in core/ (scanners can't import from cli/).
// Re-exported here so existing `cli/commands/scan-cmd` importers keep working.
export type { ScanSeverity, ScanFinding, ScanResult } from '../../core/scan/scan-types.js'
import type { ScanSeverity, ScanFinding, ScanResult } from '../../core/scan/scan-types.js'

export interface ScanOptions {
  dir?: string
  sources?: string[]
  fileFilter?: string
}

function violationSeverity(v: ViolationDetail): ScanSeverity {
  if (v.confidence >= 0.9) return 'error'
  if (v.confidence >= 0.7) return 'warning'
  return 'info'
}

function filterByFile(findings: ScanFinding[], fileFilter?: string): ScanFinding[] {
  if (!fileFilter) return findings
  return findings.filter((f) => f.file.includes(fileFilter))
}

export async function runScan(opts: ScanOptions = {}): Promise<ScanResult> {
  const dir = opts.dir ?? process.cwd()
  const sources = opts.sources ?? ['harness']
  const findings: ScanFinding[] = []

  if (sources.includes('harness')) {
    const harness = runHarnessScan(dir, undefined, undefined, { collectViolations: true, maxViolations: 500 })
    for (const v of harness.violations ?? []) {
      findings.push({
        source: 'harness',
        file: v.file,
        line: v.line,
        severity: violationSeverity(v),
        message: `[${v.dimension}/${v.violationType}] ${v.evidence}`,
      })
    }
  }

  if (sources.includes('typecheck')) {
    try {
      execSync('npx tsc --noEmit --pretty false', { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err: unknown) {
      const output =
        err instanceof Error && 'stdout' in err
          ? String((err as NodeJS.ErrnoException & { stdout: Buffer }).stdout ?? '')
          : ''
      findings.push(...parseTscOutput(output))
    }
  }

  if (sources.includes('security')) {
    findings.push(...scanConfigSecurity(dir))
  }

  if (sources.includes('taint')) {
    findings.push(...scanTaint(dir))
  }

  return { findings: filterByFile(findings, opts.fileFilter) }
}

/** Promote scan findings into real bug/risk graph nodes (idempotent, dedup by file:line). */
export function applyScanFindings(store: SqliteStore, findings: ScanFinding[]): ApplyFindingsResult {
  return applyFindings(store, findings)
}

export function scanCommand(): Command {
  return new Command('scan')
    .description('Aggregate quality findings from harness, typecheck, security, and taint sources')
    .option('-d, --dir <dir>', 'Project directory', process.cwd())
    .option('--sources <list>', 'Comma-separated source list (harness,typecheck,security,taint)', 'harness')
    .option('--json', 'Force JSON output')
    .option('--select <path>', 'Dot-path selector on data field')
    .option('--apply', 'Promove os findings em nodes bug/risk no grafo (idempotente por file:line)', false)
    .action(async (opts: { dir: string; sources: string; json?: boolean; select?: string; apply: boolean }) => {
      const out = createCliOutput('scan')
      const sources = opts.sources.split(',').map((s) => s.trim())
      const result = await runScan({ dir: opts.dir, sources })

      if (!opts.apply) {
        out.ok(result)
        return
      }

      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const applied = applyScanFindings(store, result.findings)
        out.ok({ ...result, applied })
      } finally {
        store.close()
      }
    })
}
