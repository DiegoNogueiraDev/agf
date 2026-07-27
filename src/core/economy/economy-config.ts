/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Economy lever configuration loader for `.agf/economy.toml`.
 *
 * Each lever has its own TOML section with typed thresholds. When the file is
 * absent or unparseable the loader silently returns hardcoded defaults so
 * existing setups are never broken (backward-compatible, no error).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'

export interface LeverConfig {
  ast_compress: { min_bytes: number }
  caveman: { aggressiveness: number }
  ccr: { enabled: boolean }
  rag_in: { threshold: number; k: number }
  rag_out: { threshold: number; k: number }
}

export const DEFAULT_LEVER_CONFIG: LeverConfig = {
  ast_compress: { min_bytes: 2048 },
  caveman: { aggressiveness: 0.6 },
  ccr: { enabled: true },
  rag_in: { threshold: 0.5, k: 3 },
  rag_out: { threshold: 0.5, k: 3 },
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function mergeConfig(raw: Record<string, unknown>): LeverConfig {
  const d = DEFAULT_LEVER_CONFIG
  const ast = (raw['ast_compress'] ?? {}) as Record<string, unknown>
  const cave = (raw['caveman'] ?? {}) as Record<string, unknown>
  const ccr = (raw['ccr'] ?? {}) as Record<string, unknown>
  const ri = (raw['rag_in'] ?? {}) as Record<string, unknown>
  const ro = (raw['rag_out'] ?? {}) as Record<string, unknown>
  return {
    ast_compress: { min_bytes: num(ast['min_bytes'], d.ast_compress.min_bytes) },
    caveman: { aggressiveness: num(cave['aggressiveness'], d.caveman.aggressiveness) },
    ccr: { enabled: bool(ccr['enabled'], d.ccr.enabled) },
    rag_in: { threshold: num(ri['threshold'], d.rag_in.threshold), k: num(ri['k'], d.rag_in.k) },
    rag_out: { threshold: num(ro['threshold'], d.rag_out.threshold), k: num(ro['k'], d.rag_out.k) },
  }
}

export function loadEconomyConfig(projectDir: string): LeverConfig {
  const tomlPath = join(projectDir, '.agf', 'economy.toml')
  if (!existsSync(tomlPath)) return DEFAULT_LEVER_CONFIG
  try {
    const src = readFileSync(tomlPath, 'utf8')
    const raw = parse(src) as Record<string, unknown>
    return mergeConfig(raw)
  } catch {
    return DEFAULT_LEVER_CONFIG
  }
}

export function saveEconomyConfig(projectDir: string, cfg: LeverConfig): void {
  const dir = join(projectDir, '.agf')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const toml = [
    `[ast_compress]`,
    `min_bytes = ${cfg.ast_compress.min_bytes}`,
    ``,
    `[caveman]`,
    `aggressiveness = ${cfg.caveman.aggressiveness}`,
    ``,
    `[ccr]`,
    `enabled = ${cfg.ccr.enabled}`,
    ``,
    `[rag_in]`,
    `threshold = ${cfg.rag_in.threshold}`,
    `k = ${cfg.rag_in.k}`,
    ``,
    `[rag_out]`,
    `threshold = ${cfg.rag_out.threshold}`,
    `k = ${cfg.rag_out.k}`,
    ``,
  ].join('\n')
  writeFileSync(join(dir, 'economy.toml'), toml, 'utf8')
}

/** Minimum sample size required before a calibration update is applied. */
export const CALIBRATE_MIN_SAMPLE_SIZE = 10

/** Maps ledger lever names to their config section and threshold key. */
const LEVER_TO_CONFIG: Record<string, { section: 'rag_in' | 'rag_out'; param: 'threshold' }> = {
  rag_in_reuse: { section: 'rag_in', param: 'threshold' },
  rag_out_recovery: { section: 'rag_out', param: 'threshold' },
}

export interface CalibrationApplyInput {
  lever: string
  recommended: number
  sampleSize: number
}

export interface CalibrationApplyResultEntry {
  lever: string
  applied: boolean
  old?: number
  new?: number
  reason?: string
}

export interface CalibrationApplyResult {
  results: CalibrationApplyResultEntry[]
  updatedConfig: LeverConfig
}

/**
 * Pure function: decides which calibrations to apply (sampleSize threshold gate)
 * and returns the updated config + per-lever results. No I/O side effects.
 */
export function applyCalibration(
  inputs: CalibrationApplyInput[],
  cfg: LeverConfig,
  minSampleSize = CALIBRATE_MIN_SAMPLE_SIZE,
): CalibrationApplyResult {
  let updated: LeverConfig = { ...cfg, rag_in: { ...cfg.rag_in }, rag_out: { ...cfg.rag_out } }
  const results: CalibrationApplyResultEntry[] = []

  for (const input of inputs) {
    const mapping = LEVER_TO_CONFIG[input.lever]

    if (!mapping) {
      results.push({ lever: input.lever, applied: false, reason: 'unknown_lever' })
      continue
    }

    if (input.sampleSize < minSampleSize) {
      results.push({ lever: input.lever, applied: false, reason: 'insufficient_data' })
      continue
    }

    const old = updated[mapping.section][mapping.param]
    updated = {
      ...updated,
      [mapping.section]: { ...updated[mapping.section], [mapping.param]: input.recommended },
    }
    results.push({ lever: input.lever, applied: true, old, new: input.recommended })
  }

  return { results, updatedConfig: updated }
}
