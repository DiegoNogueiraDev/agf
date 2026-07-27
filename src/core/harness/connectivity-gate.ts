/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * connectivity-gate — deterministic enforcement: connectivity below a floor,
 * or regressed vs the last recorded scan, fails the gate and names the
 * newly-dormant modules. Pure function over an already-computed
 * ConnectivityScanResult (connectivity-scanner.ts) — no I/O, so it composes
 * cleanly with `agf gate` the same way the other phase-readiness checks do.
 */

import type { ConnectivityScanResult } from './connectivity-scanner.js'

export interface ConnectivityGateOptions {
  /** Minimum connectivity percentage required to pass. Default: 80. */
  threshold?: number
  /** Prior scan's connectivity score, if any (from harness_history). */
  baseline?: number
}

/** Same shape as gate-cmd.ts's GateReport (cli/commands) — core never imports from cli, so this is defined locally. */
export interface ConnectivityGateReport {
  checks: Array<{ name: string; passed: boolean; details: string; severity: string }>
  ready: boolean
  score: number
  grade: string
  summary: string
}

const MAX_DORMANT_IN_SUMMARY = 10

export function checkConnectivityGate(
  result: ConnectivityScanResult,
  opts: ConnectivityGateOptions = {},
): ConnectivityGateReport {
  const threshold = opts.threshold ?? 80
  const checks: ConnectivityGateReport['checks'] = []

  const meetsThreshold = result.connectivityScore >= threshold
  checks.push({
    name: 'connectivity_threshold',
    passed: meetsThreshold,
    details: `${result.connectivityScore}% (threshold: ${threshold}%)`,
    severity: 'required',
  })

  let regressed = false
  if (opts.baseline !== undefined && result.connectivityScore < opts.baseline) {
    regressed = true
    checks.push({
      name: 'connectivity_no_regression',
      passed: false,
      details: `regrediu de ${opts.baseline}% para ${result.connectivityScore}%`,
      severity: 'required',
    })
  }

  const ready = meetsThreshold && !regressed
  const dormantSample = result.dormantFiles.slice(0, MAX_DORMANT_IN_SUMMARY).join(', ')

  return {
    checks,
    ready,
    score: result.connectivityScore,
    grade: ready ? 'A' : 'F',
    summary: ready
      ? `Connectivity ${result.connectivityScore}% — OK`
      : `Connectivity gate failed (${result.connectivityScore}%): módulos no-surface — ${dormantSample || 'nenhum listado'}`,
  }
}
