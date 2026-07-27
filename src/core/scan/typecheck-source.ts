/*!
 * typecheck-source — parse tsc --noEmit output into ScanFinding[].
 *
 * WHY: grep-based harness misses type-layer bugs (wrong return type, missing
 * generics, unsafe casts). Running tsc --noEmit adds a zero-runtime-overhead
 * type-layer gate to agf scan without duplicating the existing typecheck script.
 *
 * Output format from tsc: `<file>(<line>,<col>): <severity> TS<code>: <message>`
 * This module parses that format into the canonical ScanFinding envelope.
 *
 * Composes with: scan-cmd.ts (source='typecheck'), harness-scan-runner (peer source).
 */

import type { ScanFinding, ScanSeverity } from './scan-types.js'

// tsc diagnostic line: "path/to/file.ts(12,5): error TS2322: message"
const TSC_DIAG_RE = /^(.+?)\((\d+),\d+\):\s+(error|warning|message|info)\s+(TS\d+:\s*.+)$/

/**
 * Parse raw `tsc --noEmit` stdout into `ScanFinding[]`.
 * Lines that don't match the diagnostic format are silently skipped.
 * Pure — no I/O, fully testable.
 */
export function parseTscOutput(output: string): ScanFinding[] {
  const findings: ScanFinding[] = []

  for (const raw of output.split('\n')) {
    const line = raw.trim()
    const match = TSC_DIAG_RE.exec(line)
    if (!match) continue

    const [, file, lineStr, tscSeverity, message] = match
    const severity: ScanSeverity = tscSeverity === 'error' ? 'error' : tscSeverity === 'warning' ? 'warning' : 'info'

    findings.push({
      source: 'typecheck',
      file: file!,
      line: Number(lineStr),
      severity,
      message: message!.trim(),
    })
  }

  return findings
}
