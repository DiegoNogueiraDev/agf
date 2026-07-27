/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_ad254eb9b9c1 — reachability/connectivity gate: fails when
 * connectivity < threshold or regresses vs the stored baseline. Pure
 * function — reuses ConnectivityScanResult (connectivity-scanner.ts) and
 * the existing harness_history breakdown (agf gate reuses, not recreates).
 */

import { describe, it, expect } from 'vitest'
import { checkConnectivityGate } from '../core/harness/connectivity-gate.js'
import type { ConnectivityScanResult } from '../core/harness/connectivity-scanner.js'

function makeResult(overrides: Partial<ConnectivityScanResult> = {}): ConnectivityScanResult {
  return {
    connectivityScore: 85,
    totalCapabilities: 100,
    connectedCapabilities: 85,
    dormantFiles: [],
    ...overrides,
  }
}

describe('checkConnectivityGate', () => {
  it('fails when connectivity is below the threshold, listing dormant modules', () => {
    const result = makeResult({ connectivityScore: 60, dormantFiles: ['src/core/a.ts', 'src/core/b.ts'] })
    const report = checkConnectivityGate(result, { threshold: 80 })
    expect(report.ready).toBe(false)
    expect(report.summary).toContain('src/core/a.ts')
  })

  it('passes when connectivity meets the threshold and no baseline regression', () => {
    const result = makeResult({ connectivityScore: 85 })
    const report = checkConnectivityGate(result, { threshold: 80 })
    expect(report.ready).toBe(true)
  })

  it('fails when connectivity regresses vs the stored baseline, even above threshold', () => {
    const result = makeResult({ connectivityScore: 82, dormantFiles: ['src/core/new-dormant.ts'] })
    const report = checkConnectivityGate(result, { threshold: 80, baseline: 90 })
    expect(report.ready).toBe(false)
  })

  it('passes when connectivity meets or exceeds the baseline', () => {
    const result = makeResult({ connectivityScore: 90 })
    const report = checkConnectivityGate(result, { threshold: 80, baseline: 90 })
    expect(report.ready).toBe(true)
  })
})
