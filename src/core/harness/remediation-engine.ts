/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Remediation Engine — Deterministic L0-L3 Pipeline
 *
 * Evaluates file-level violations against 16 hardcoded rules to produce
 * actionable remediation suggestions. Zero AI/LLM — fully deterministic.
 *
 * Pipeline:
 *   L0: Check suppression store → skip suppressed (file, violationType) pairs
 *   L1: Match violation against rules via violationType → find matching rule
 *   L2: Resolve template with actual file/line/evidence → create suggestion
 *   L3: Validate confidence >= 0.8 → filter low-confidence
 *   Sort by priority desc → return
 *
 * Part of the Zero False-Positive guarantee (5 layers).
 */

import type Database from 'better-sqlite3'
import type { ViolationDetail, RemediationSuggestion } from './violation-detail.js'
import { findRule, resolveTemplate } from './remediation-rules.js'
import { SuppressionStore } from './remediation-suppression.js'

/** Minimum confidence threshold for suggestions */
const MIN_CONFIDENCE = 0.8

/**
 * Evaluate violations and produce remediation suggestions.
 *
 * @param violations - File-level violations from harness scanners
 * @param db - Optional SQLite database for suppression checks
 * @returns Sorted array of RemediationSuggestion (priority desc)
 */
export function evaluate(violations: ViolationDetail[], db?: Database.Database): RemediationSuggestion[] {
  if (violations.length === 0) {
    return []
  }

  const suppressionStore = db ? new SuppressionStore(db) : null
  const suggestions: RemediationSuggestion[] = []

  for (const violation of violations) {
    // L0: Check suppression store
    if (suppressionStore?.isSuppressed(violation.file, violation.violationType)) {
      continue
    }

    // L1: Match against rules
    const rule = findRule(violation.violationType)
    if (!rule) {
      continue
    }

    // L3: Validate confidence threshold
    if (rule.confidence < MIN_CONFIDENCE) {
      continue
    }

    // L2: Resolve template
    const suggestedFix = resolveTemplate(rule.fixTemplate, violation.file, violation.line, violation.evidence)

    suggestions.push({
      ruleId: rule.id,
      violation,
      suggestedFix,
      confidence: rule.confidence,
      category: rule.category,
      priority: rule.priority,
    })
  }

  // Sort by priority descending (deterministic — stable sort)
  suggestions.sort((a, b) => b.priority - a.priority)

  return suggestions
}
