/*!
 * Economy regression gate — file-based baseline + tolerance check.
 * Task node_1d9a982a3983.
 *
 * WHY: LLM cost regressions are invisible in unit tests. This gate stores a
 * committed baseline scorecard (economy-baseline.json) and fails CI when
 * cost-per-success for any model tier exceeds the baseline beyond tolerance.
 *
 * Contract: pure I/O around a JSON file; never throws (gate must always resolve).
 * Composes with: scorecard.ts (ModelAgg source), eval-cmd.ts (--gate wire).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'economy-regression-gate.ts' })
const BASELINE_FILENAME = 'economy-baseline.json'

export interface EconomyBaseline {
  createdAt: string
  costPerSuccess: Record<string, number>
}

export type EconomyGateCode = 'BASELINE_CREATED' | 'OK' | 'ECONOMY_REGRESSION'

export interface RegressionEntry {
  model: string
  baseline: number
  current: number
  deltaPct: number
}

export interface EconomyGateResult {
  code: EconomyGateCode
  passed: boolean
  /** Delta % per model (negative = improvement, positive = regression). */
  deltaByModel?: Record<string, number>
  /** Models that exceeded tolerance. */
  regressions?: RegressionEntry[]
}

export interface ScorecardModelRow {
  model: string
  costPerSuccess: number | null
}

/** Build a {model: costPerSuccess} map from scorecard rows, dropping models with no successful runs. */
export function costPerSuccessMap(rows: ScorecardModelRow[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const row of rows) {
    if (row.costPerSuccess != null) map[row.model] = row.costPerSuccess
  }
  return map
}

/** Write (or overwrite) the baseline file in `dir` with the given costPerSuccess map. */
export function writeBaseline(dir: string, costPerSuccess: Record<string, number>): void {
  const baseline: EconomyBaseline = { createdAt: new Date().toISOString(), costPerSuccess }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, BASELINE_FILENAME), JSON.stringify(baseline, null, 2), 'utf-8')
}

/** Read the baseline file from `dir`. Returns null if the file does not exist or is corrupt. */
export function readBaseline(dir: string): EconomyBaseline | null {
  const p = join(dir, BASELINE_FILENAME)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as EconomyBaseline
  } catch {
    return null
  }
}

/**
 * Compare costPerSuccess map against the committed baseline in `dir`.
 * Creates the baseline on first run (AC3). Fails with ECONOMY_REGRESSION when
 * any model regresses beyond `tolerance` (e.g. 0.1 = 10%).
 */
export function checkEconomyRegressionGate(
  dir: string,
  costPerSuccess: Record<string, number>,
  tolerance: number,
): EconomyGateResult {
  const baselinePath = join(dir, BASELINE_FILENAME)

  if (!existsSync(baselinePath)) {
    const baseline: EconomyBaseline = {
      createdAt: new Date().toISOString(),
      costPerSuccess,
    }
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf-8')
      log.info('economy:baseline-created', { path: baselinePath })
    } catch (err) {
      log.warn('economy:baseline-write-failed', { err })
    }
    return { code: 'BASELINE_CREATED', passed: true }
  }

  let baseline: EconomyBaseline
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as EconomyBaseline
  } catch {
    // Corrupt baseline → recreate it
    const fresh: EconomyBaseline = { createdAt: new Date().toISOString(), costPerSuccess }
    writeFileSync(baselinePath, JSON.stringify(fresh, null, 2), 'utf-8')
    return { code: 'BASELINE_CREATED', passed: true }
  }

  const deltaByModel: Record<string, number> = {}
  const regressions: RegressionEntry[] = []

  for (const [model, current] of Object.entries(costPerSuccess)) {
    const base = baseline.costPerSuccess[model]
    if (base === undefined || base <= 0) continue
    const deltaPct = (current - base) / base
    deltaByModel[model] = Math.round(deltaPct * 1000) / 10 // one decimal
    if (deltaPct > tolerance) {
      regressions.push({ model, baseline: base, current, deltaPct })
    }
  }

  if (regressions.length > 0) {
    return { code: 'ECONOMY_REGRESSION', passed: false, deltaByModel, regressions }
  }

  return { code: 'OK', passed: true, deltaByModel }
}
