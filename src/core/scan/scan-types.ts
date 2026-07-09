/*!
 * Scan finding types — the shared contract between the core scanners
 * (typecheck-source, apply-findings) and the `agf scan` CLI surface.
 *
 * WHY here (core, not cli): scanners live in core and must NOT import from cli/
 * (layer-boundary fitness rule: core/ must not depend on cli/). This is the
 * single source of truth for the finding shape; scan-cmd re-exports it for
 * backward-compatible CLI imports.
 */

export type ScanSeverity = 'error' | 'warning' | 'info'

export interface ScanFinding {
  source: string
  file: string
  line: number
  severity: ScanSeverity
  message: string
}

export interface ScanResult {
  findings: ScanFinding[]
}
