/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Remediation Rules — 16 Deterministic Hardcoded Rules
 *
 * Each rule maps a violationType to a fix template with confidence and priority.
 * All detections are regex/condition-based (zero AI/LLM).
 * Confidence 1.0 = deterministic match, 0.8-0.99 = high confidence heuristic.
 *
 * Distribution: types(2), tests(2), naming(2), errors(3), context(1), docs(3), fitness(3)
 */

import type { HarnessDimension, RemediationCategory } from './violation-detail.js'

export interface RemediationRule {
  id: string
  dimension: HarnessDimension
  violationType: string
  fixTemplate: string
  confidence: number
  priority: number
  category: RemediationCategory
}

const RULES: RemediationRule[] = [
  // ── Types (2) ────────────────────────────────────────
  {
    id: 'R001',
    dimension: 'types',
    violationType: 'any_usage',
    fixTemplate: 'Replace any with explicit type in {file}:{line}',
    confidence: 1.0,
    priority: 90,
    category: 'replace',
  },
  {
    id: 'R002',
    dimension: 'types',
    violationType: 'as_any_cast',
    fixTemplate: 'Remove the cast in {file}:{line}, use type assertion',
    confidence: 1.0,
    priority: 85,
    category: 'replace',
  },

  // ── Tests (2) ────────────────────────────────────────
  {
    id: 'R003',
    dimension: 'tests',
    violationType: 'missing_test',
    fixTemplate: 'Create test file for {file}',
    confidence: 1.0,
    priority: 80,
    category: 'add',
  },
  {
    id: 'R004',
    dimension: 'tests',
    violationType: 'empty_test',
    fixTemplate: 'Add assertions to empty test in {file}',
    confidence: 0.9,
    priority: 70,
    category: 'add',
  },

  // ── Naming (2) ───────────────────────────────────────
  {
    id: 'R005',
    dimension: 'naming',
    violationType: 'generic_name',
    fixTemplate: 'Rename {evidence} in {file}:{line} to descriptive name',
    confidence: 1.0,
    priority: 60,
    category: 'refactor',
  },
  {
    id: 'R006',
    dimension: 'naming',
    violationType: 'single_char',
    fixTemplate: 'Rename {evidence} in {file}:{line} to descriptive name',
    confidence: 0.9,
    priority: 50,
    category: 'refactor',
  },

  // ── Errors (3) ───────────────────────────────────────
  {
    id: 'R007',
    dimension: 'errors',
    violationType: 'raw_throw',
    fixTemplate: 'Use typed error from utils/errors.ts in {file}:{line}',
    confidence: 1.0,
    priority: 85,
    category: 'replace',
  },
  {
    id: 'R008',
    dimension: 'errors',
    violationType: 'swallowed_catch',
    fixTemplate: 'Add error handling to empty catch in {file}:{line}',
    confidence: 1.0,
    priority: 80,
    category: 'add',
  },
  {
    id: 'R009',
    dimension: 'errors',
    violationType: 'console_error',
    fixTemplate: 'Replace console.error with logger.error in {file}:{line}',
    confidence: 1.0,
    priority: 75,
    category: 'replace',
  },

  // ── Context (1) ──────────────────────────────────────
  {
    id: 'R010',
    dimension: 'context',
    violationType: 'missing_jsdoc',
    fixTemplate: 'Add JSDoc to export in {file}:{line}',
    confidence: 1.0,
    priority: 40,
    category: 'add',
  },

  // ── Docs (3) ─────────────────────────────────────────
  {
    id: 'R011',
    dimension: 'docs',
    violationType: 'missing_claude_md',
    fixTemplate: 'Create CLAUDE.md',
    confidence: 1.0,
    priority: 95,
    category: 'add',
  },
  {
    id: 'R012',
    dimension: 'docs',
    violationType: 'missing_readme',
    fixTemplate: 'Create README.md',
    confidence: 1.0,
    priority: 90,
    category: 'add',
  },
  {
    id: 'R013',
    dimension: 'docs',
    violationType: 'low_rules_coverage',
    fixTemplate: 'Add .claude/rules/ for uncovered dirs',
    confidence: 0.9,
    priority: 50,
    category: 'add',
  },

  // ── Fitness (3) ──────────────────────────────────────
  {
    id: 'R014',
    dimension: 'fitness',
    violationType: 'bad_import',
    fixTemplate: 'Fix import in {file}:{line}: {evidence}',
    confidence: 1.0,
    priority: 95,
    category: 'replace',
  },
  {
    id: 'R015',
    dimension: 'fitness',
    violationType: 'circular_dep',
    fixTemplate: 'Break cycle: {evidence}',
    confidence: 0.8,
    priority: 90,
    category: 'refactor',
  },
  {
    id: 'R016',
    dimension: 'fitness',
    violationType: 'missing_barrel',
    fixTemplate: 'Add re-export in {file}',
    confidence: 1.0,
    priority: 70,
    category: 'add',
  },
]

/** Index for O(1) lookup by violationType */
const RULE_INDEX = new Map<string, RemediationRule>(RULES.map((r) => [r.violationType, r]))

/** Return all 16 hardcoded remediation rules. */
export function listRules(): RemediationRule[] {
  return [...RULES]
}

/** Find a remediation rule by violation type. */
export function findRule(violationType: string): RemediationRule | null {
  return RULE_INDEX.get(violationType) ?? null
}

/** Resolve a fix template with file/line/evidence placeholders. */
export function resolveTemplate(template: string, file: string, line: number, evidence: string): string {
  return template
    .replace(/\{file\}/g, file)
    .replace(/\{line\}/g, String(line))
    .replace(/\{evidence\}/g, evidence)
}
