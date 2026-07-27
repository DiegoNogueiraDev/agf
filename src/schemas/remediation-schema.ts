/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Remediation Schemas — Zod v4 validation for the Deterministic Remediation Engine
 *
 * Follows the pattern of healing.schema.ts and knowledge.schema.ts.
 * Types derived via z.infer<> — no manual type duplication.
 */
import { z } from 'zod/v4'

// ── Enums ──────────────────────────────────────────────

/** The 7 harness dimensions measured by scanners */
export const HarnessDimensionSchema = z.enum(['types', 'tests', 'naming', 'errors', 'context', 'docs', 'fitness'])

/** Categories of remediation actions */
export const RemediationCategorySchema = z.enum(['remove', 'replace', 'add', 'refactor'])

// ── Objects ────────────────────────────────────────────

/** A single file-level violation detected by a harness scanner */
export const ViolationDetailSchema = z.object({
  /** Relative file path from project root */
  file: z.string().min(1),
  /** 1-based line number where violation occurs */
  line: z.number().int().min(1),
  /** 0-based column offset (optional) */
  column: z.number().int().min(0).optional(),
  /** Which harness dimension this violation belongs to */
  dimension: HarnessDimensionSchema,
  /** Specific violation type (e.g., "any_usage", "missing_test") */
  violationType: z.string().min(1),
  /** Actual matched text or evidence of the violation */
  evidence: z.string(),
  /** Detection confidence: 1.0 = deterministic, 0.8+ = high confidence */
  confidence: z.number().min(0).max(1),
  /** Optional suggested fix text */
  suggestedFix: z.string().optional(),
})

/** A remediation suggestion produced by the engine */
export const RemediationSuggestionSchema = z.object({
  /** Rule ID that generated this suggestion (e.g., "R001") */
  ruleId: z.string().min(1),
  /** The violation this suggestion addresses */
  violation: ViolationDetailSchema,
  /** Resolved fix text with actual file/line/evidence substituted */
  suggestedFix: z.string().min(1),
  /** Confidence inherited from the rule (filtered: >= 0.8 only) */
  confidence: z.number().min(0).max(1),
  /** Category of remediation action */
  category: RemediationCategorySchema,
  /** Priority score (0-100, higher = more important) */
  priority: z.number().int().min(0).max(100),
})

/** Result of post-fix validation */
export const ValidationResultSchema = z.object({
  /** Rule ID that was applied */
  ruleId: z.string().min(1),
  /** File where the fix was applied */
  file: z.string().min(1),
  /** Violation type that was addressed */
  violationType: z.string().min(1),
  /** Harness score before the fix */
  scoreBefore: z.number().min(0).max(100),
  /** Harness score after the fix */
  scoreAfter: z.number().min(0).max(100),
  /** True if score improved */
  confirmed: z.boolean(),
  /** True if score did not improve and pair was auto-suppressed */
  autoSuppressed: z.boolean(),
})

// ── Inferred Types ─────────────────────────────────────

export type ViolationDetailZ = z.infer<typeof ViolationDetailSchema>
export type RemediationSuggestionZ = z.infer<typeof RemediationSuggestionSchema>
export type ValidationResultZ = z.infer<typeof ValidationResultSchema>
export type HarnessDimensionZ = z.infer<typeof HarnessDimensionSchema>
export type RemediationCategoryZ = z.infer<typeof RemediationCategorySchema>
