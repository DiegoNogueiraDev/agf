/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Canonical node type groupings — single source of truth.
 *
 * All modules that need to filter nodes by type category
 * should import from here instead of defining local sets.
 */

/** Task-like types eligible for execution planning */
export const TASK_TYPES: ReadonlySet<string> = new Set(['task', 'subtask', 'bug'])

/** High-level requirement types */
export const REQUIREMENT_TYPES: ReadonlySet<string> = new Set(['epic', 'requirement'])

/** Design artifact types (decisions, constraints, etc.) */
export const DESIGN_TYPES: ReadonlySet<string> = new Set(['decision', 'constraint', 'risk', 'acceptance_criteria'])

/** All non-task types used in design phase analysis */
export const DESIGN_ONLY_TYPES: ReadonlySet<string> = new Set([
  'requirement',
  'epic',
  'decision',
  'constraint',
  'milestone',
  'risk',
  'acceptance_criteria',
])

/** Types relevant for feedback/listening phase */
export const FEEDBACK_TYPES: ReadonlySet<string> = new Set(['requirement', 'risk', 'constraint'])
