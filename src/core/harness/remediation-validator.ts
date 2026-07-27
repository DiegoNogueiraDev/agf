/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Remediation Validator — Post-Fix Feedback Loop (Layer 4)
 *
 * Compares violation counts before and after a fix to determine if
 * the remediation was effective. Auto-suppresses ineffective pairs.
 * Extracts meta-rules from 3+ confirmed validations (Layer 5 graduation).
 */

import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ViolationDetail } from './violation-detail.js'
import { SuppressionStore } from './remediation-suppression.js'
import { findRule, listRules } from './remediation-rules.js'

export interface PostFixResult {
  confirmed: number
  autoSuppressed: number
  total: number
}

/** Key for grouping violations: file + violationType */
function violationKey(file: string, violationType: string): string {
  return `${file}::${violationType}`
}

/** Count violations per (file, violationType) pair */
function countByPair(
  violations: ViolationDetail[],
): Map<string, { file: string; violationType: string; count: number }> {
  const counts = new Map<string, { file: string; violationType: string; count: number }>()
  for (const vVar of violations) {
    const key = violationKey(vVar.file, vVar.violationType)
    const existing = counts.get(key)
    if (existing) {
      existing.count++
    } else {
      counts.set(key, { file: vVar.file, violationType: vVar.violationType, count: 1 })
    }
  }
  return counts
}

export class RemediationValidator {
  private readonly db: Database.Database
  private readonly snapshots = new Map<string, Map<string, { file: string; violationType: string; count: number }>>()

  constructor(db: Database.Database) {
    this.db = db
  }

  /** Record pre-fix violation state. Returns snapshot ID. */
  recordPreFixState(violations: ViolationDetail[]): string {
    const id = randomUUID()
    this.snapshots.set(id, countByPair(violations))
    return id
  }

  /** Compare post-fix violations against pre-fix snapshot. Auto-suppresses unchanged pairs. */
  validatePostFix(snapshotId: string, postFixViolations: ViolationDetail[]): PostFixResult {
    const before = this.snapshots.get(snapshotId)
    if (!before) {
      return { confirmed: 0, autoSuppressed: 0, total: 0 }
    }

    const after = countByPair(postFixViolations)
    const suppression = new SuppressionStore(this.db)
    const now = new Date().toISOString()

    let confirmed = 0
    let autoSuppressed = 0

    for (const [, beforeEntry] of before) {
      const afterKey = violationKey(beforeEntry.file, beforeEntry.violationType)
      const afterEntry = after.get(afterKey)
      const afterCount = afterEntry?.count ?? 0
      const ruleId = findRule(beforeEntry.violationType)?.id ?? 'unknown'

      if (afterCount < beforeEntry.count) {
        confirmed++
        this.db
          .prepare(
            `INSERT INTO remediation_validations
          (id, rule_id, file, applied, score_before, score_after, confirmed, validated_at)
          VALUES (?, ?, ?, 1, ?, ?, 1, ?)
        `,
          )
          .run(randomUUID(), ruleId, beforeEntry.file, beforeEntry.count, afterCount, now)
      } else {
        autoSuppressed++
        suppression.suppress(
          beforeEntry.file,
          beforeEntry.violationType,
          'auto',
          'auto-suppressed: count unchanged after fix',
        )
        this.db
          .prepare(
            `INSERT INTO remediation_validations
          (id, rule_id, file, applied, score_before, score_after, confirmed, validated_at)
          VALUES (?, ?, ?, 1, ?, ?, 0, ?)
        `,
          )
          .run(randomUUID(), ruleId, beforeEntry.file, beforeEntry.count, afterCount, now)
      }
    }

    this.snapshots.delete(snapshotId)
    return { confirmed, autoSuppressed, total: confirmed + autoSuppressed }
  }

  /**
   * Extract meta-rules from validated remediations.
   * Creates a meta-rule when a rule_id has 3+ confirmed validations.
   * Returns count of meta-rules created.
   */
  extractMetaRules(): number {
    const MIN_CONFIRMATIONS = 3

    const candidates = this.db
      .prepare(
        `
      SELECT rule_id, COUNT(*) as cnt
      FROM remediation_validations
      WHERE confirmed = 1
      GROUP BY rule_id
      HAVING cnt >= ?
    `,
      )
      .all(MIN_CONFIRMATIONS) as Array<{ rule_id: string; cnt: number }>

    let created = 0
    const now = new Date().toISOString()
    const allRules = listRules()

    for (const { rule_id, cnt } of candidates) {
      const matchedRule = allRules.find((r) => r.id === rule_id)
      if (!matchedRule) continue

      const existing = this.db
        .prepare('SELECT 1 FROM remediation_meta_rules WHERE violation_type = ? LIMIT 1')
        .get(matchedRule.violationType)
      if (existing) continue

      this.db
        .prepare(
          `INSERT INTO remediation_meta_rules
        (id, dimension, violation_type, pattern, fix_template, confidence, confirmations, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0.8, ?, ?, ?)
      `,
        )
        .run(
          randomUUID(),
          matchedRule.dimension,
          matchedRule.violationType,
          matchedRule.violationType,
          matchedRule.fixTemplate,
          cnt,
          now,
          now,
        )
      created++
    }

    return created
  }
}

/**
 * CLI-facing entry point (`agf harness --validate-remediation`) — collapses the
 * record → validate → extract cycle into one stateless call, since the
 * before/after violation lists both come from separate CLI invocations and
 * never share a live RemediationValidator instance.
 */
export function validateRemediationDiff(
  before: ViolationDetail[],
  after: ViolationDetail[],
  db: Database.Database,
): PostFixResult & { metaRulesCreated: number } {
  const validator = new RemediationValidator(db)
  const snapshotId = validator.recordPreFixState(before)
  const result = validator.validatePostFix(snapshotId, after)
  const metaRulesCreated = validator.extractMetaRules()
  return { ...result, metaRulesCreated }
}
