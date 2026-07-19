/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Violation Detail Types — File-level violation reporting for harness scanners
 *
 * Part of the Deterministic Remediation Engine (Harness v4).
 * All detections are regex/condition-based (zero AI/LLM).
 * Confidence 1.0 = deterministic match, 0.8-0.99 = high confidence heuristic.
 */

/** The 7 harness dimensions measured by scanners */
export type HarnessDimension = 'types' | 'tests' | 'naming' | 'errors' | 'context' | 'docs' | 'fitness'

/** Categories of remediation actions */
export type RemediationCategory = 'remove' | 'replace' | 'add' | 'refactor'

/**
 * A single file-level violation detected by a harness scanner.
 * Scanners emit these when collectViolations=true.
 */
export interface ViolationDetail {
  /** Relative file path from project root */
  file: string
  /** 1-based line number where violation occurs */
  line: number
  /** 0-based column offset (optional) */
  column?: number
  /** Which harness dimension this violation belongs to */
  dimension: HarnessDimension
  /** Specific violation type (e.g., "any_usage", "missing_test", "raw_throw") */
  violationType: string
  /** Actual matched text or evidence of the violation */
  evidence: string
  /** Detection confidence: 1.0 = deterministic regex, 0.8+ = high confidence heuristic */
  confidence: number
  /** Optional suggested fix text (pre-template resolution) */
  suggestedFix?: string
}

/**
 * A remediation suggestion produced by the Remediation Engine.
 * Maps a violation to a concrete, actionable fix with priority.
 */
export interface RemediationSuggestion {
  /** Rule ID that generated this suggestion (e.g., "R001") */
  ruleId: string
  /** The violation this suggestion addresses */
  violation: ViolationDetail
  /** Resolved fix text with actual file/line/evidence substituted */
  suggestedFix: string
  /** Confidence inherited from the rule (filtered: >= 0.8 only) */
  confidence: number
  /** Category of remediation action */
  category: RemediationCategory
  /** Priority score (0-100, higher = more important) */
  priority: number
}

/**
 * Result of post-fix validation — compares score before/after applying a fix.
 * Used by the feedback loop to auto-suppress ineffective remediations.
 */
export interface ValidationResult {
  /** Rule ID that was applied */
  ruleId: string
  /** File where the fix was applied */
  file: string
  /** Violation type that was addressed */
  violationType: string
  /** Harness score before the fix */
  scoreBefore: number
  /** Harness score after the fix */
  scoreAfter: number
  /** True if score improved (scoreAfter > scoreBefore) */
  confirmed: boolean
  /** True if score did not improve and pair was auto-suppressed */
  autoSuppressed: boolean
}
