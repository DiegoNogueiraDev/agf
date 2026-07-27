/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Antigen Presenter — classifies raw danger signals into structured antigens.
 *
 * Groups related signals by file and pattern, computes a composite signature,
 * and assigns an antigen kind that the T-Cell responder can act upon.
 */

import type { DangerSignal, Antigen, AntigenKind, Severity } from './immune-types.js'
import { createHash } from 'node:crypto'

let antigenCounter = 0

function nextAntigenId(): string {
  antigenCounter++
  return `ag_${Date.now()}_${antigenCounter}`
}

const KIND_MAP: Record<string, AntigenKind> = {
  raw_throw: 'bare_error',
  swallowed_catch: 'swallowed_exception',
  console_error: 'log_leak',
  repeated_failure: 'cyclic_failure',
  regression_hotspot: 'regression_cluster',
}

function fileSignature(signals: DangerSignal[]): string {
  const joined = signals
    .map((s) => `${s.file}:${s.kind}`)
    .sort()
    .join('|')
  return createHash('sha256').update(joined).digest('hex').slice(0, 16)
}

function computeCompositeSeverity(signals: DangerSignal[]): Severity {
  const weight: Record<Severity, number> = { low: 1, medium: 3, high: 8, critical: 20 }
  const maxSig = signals.reduce((best, s) => (weight[s.severity] > weight[best] ? s.severity : best), 'low' as Severity)
  return maxSig
}

function computeConfidence(signals: DangerSignal[]): number {
  if (signals.length === 0) return 0
  const avg = signals.reduce((a, s) => a + s.confidence, 0) / signals.length
  const countBonus = Math.min(0.1, signals.length * 0.02)
  return Math.min(1.0, avg + countBonus)
}

export function presentAntigens(signals: DangerSignal[]): Antigen[] {
  const antigens: Antigen[] = []

  const byFileAndKind = new Map<string, DangerSignal[]>()
  for (const signal of signals) {
    const key = `${signal.file}::${signal.kind}`
    if (!byFileAndKind.has(key)) byFileAndKind.set(key, [])
    byFileAndKind.get(key)!.push(signal)
  }

  for (const [, group] of byFileAndKind) {
    const first = group[0]
    const kind = KIND_MAP[first.kind]
    if (!kind) continue

    antigens.push({
      id: nextAntigenId(),
      kind,
      sourceSignals: group.map((s) => s.id),
      file: first.file,
      line: first.line,
      signature: fileSignature(group),
      severity: computeCompositeSeverity(group),
      confidence: computeConfidence(group),
    })
  }

  return antigens
}

export function deduplicateAntigens(antigens: Antigen[], priorSignatures: Set<string>): Antigen[] {
  return antigens.filter((a) => !priorSignatures.has(a.signature))
}
