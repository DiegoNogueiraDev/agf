/*!
 * dormant-report — lists core capabilities with no surface consumer.
 *
 * WHY: connectivity-scanner measures the score; this module produces the
 * actionable report — which specific files are dormant and why — so the
 * developer knows exactly what to wire or prune.
 *
 * Reuses scanConnectivity (no-surface detection) and exposes a typed
 * {dormant:[{module,reason}]} envelope ready for CLI --dormant output.
 *
 * Composes with: connectivity-scanner.ts (source), harness-cmd.ts (consumer).
 */

import { scanConnectivity } from './connectivity-scanner.js'

export interface DormantEntry {
  /** Relative path from rootDir (e.g. "src/core/utils/foo.ts"). */
  module: string
  /** Why it is dormant: "no-surface" = not imported by any surface dir. */
  reason: 'no-surface'
}

export interface DormantReport {
  dormant: DormantEntry[]
  totalCapabilities: number
  connectedCapabilities: number
}

export interface DormantReportOptions {
  rootDir: string
  /** Path prefixes (relative to rootDir) to exclude — e.g. shared types, infra. */
  allowlist?: string[]
}

/**
 * Build a dormant-capability report by delegating to scanConnectivity.
 * Returns an empty dormant array when all core files have a surface consumer.
 */
export function buildDormantReport(opts: DormantReportOptions): DormantReport {
  const result = scanConnectivity({ rootDir: opts.rootDir, allowlist: opts.allowlist })

  const dormant: DormantEntry[] = result.dormantFiles.map((f) => ({
    module: f,
    reason: 'no-surface',
  }))

  return {
    dormant,
    totalCapabilities: result.totalCapabilities,
    connectedCapabilities: result.connectedCapabilities,
  }
}
