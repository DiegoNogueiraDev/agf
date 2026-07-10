/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { RemediationValidator, validateRemediationDiff } from '../core/harness/remediation-validator.js'
import type { ViolationDetail } from '../core/harness/violation-detail.js'

describe('RemediationValidator', () => {
  let db: Database.Database
  let validator: RemediationValidator

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS remediation_suppressions (
        id TEXT PRIMARY KEY, file TEXT NOT NULL, violation_type TEXT NOT NULL,
        dimension TEXT NOT NULL, reason TEXT, suppressed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS remediation_validations (
        id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, file TEXT NOT NULL,
        applied INTEGER NOT NULL, score_before INTEGER NOT NULL, score_after INTEGER NOT NULL,
        confirmed INTEGER NOT NULL, validated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS remediation_meta_rules (
        id TEXT PRIMARY KEY, dimension TEXT NOT NULL, violation_type TEXT NOT NULL,
        pattern TEXT, fix_template TEXT, confidence REAL, confirmations INTEGER,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `)
    validator = new RemediationValidator(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('recordPreFixState', () => {
    it('should return a snapshot ID', () => {
      const violations: ViolationDetail[] = [
        {
          file: 'src/foo.ts',
          line: 10,
          dimension: 'types',
          violationType: 'any_usage',
          evidence: 'any',
          confidence: 1.0,
        },
      ]
      const id = validator.recordPreFixState(violations)
      expect(id).toBeTruthy()
      expect(typeof id).toBe('string')
    })
  })

  describe('validatePostFix', () => {
    it('should return zeros for unknown snapshot', () => {
      const result = validator.validatePostFix('nonexistent', [])
      expect(result).toEqual({ confirmed: 0, autoSuppressed: 0, total: 0 })
    })

    it('should confirm fixed violations', () => {
      const violations: ViolationDetail[] = [
        {
          file: 'src/foo.ts',
          line: 10,
          dimension: 'types',
          violationType: 'any_usage',
          evidence: 'any',
          confidence: 1.0,
        },
        {
          file: 'src/foo.ts',
          line: 15,
          dimension: 'types',
          violationType: 'any_usage',
          evidence: 'any',
          confidence: 1.0,
        },
      ]
      const snapshotId = validator.recordPreFixState(violations)

      const result = validator.validatePostFix(snapshotId, [
        {
          file: 'src/foo.ts',
          line: 10,
          dimension: 'types',
          violationType: 'any_usage',
          evidence: 'any',
          confidence: 1.0,
        },
      ])
      expect(result.confirmed).toBe(1)
      expect(result.autoSuppressed).toBe(0)
      expect(result.total).toBe(1)
    })

    it('should auto-suppress unchanged violations', () => {
      const violations: ViolationDetail[] = [
        {
          file: 'src/foo.ts',
          line: 10,
          dimension: 'types',
          violationType: 'any_usage',
          evidence: 'any',
          confidence: 1.0,
        },
      ]
      const snapshotId = validator.recordPreFixState(violations)

      const result = validator.validatePostFix(snapshotId, [
        {
          file: 'src/foo.ts',
          line: 10,
          dimension: 'types',
          violationType: 'any_usage',
          evidence: 'any',
          confidence: 1.0,
        },
      ])
      expect(result.confirmed).toBe(0)
      expect(result.autoSuppressed).toBe(1)
      expect(result.total).toBe(1)

      const suppressions = db.prepare('SELECT * FROM remediation_suppressions').all() as Array<Record<string, unknown>>
      expect(suppressions).toHaveLength(1)
    })
  })

  describe('extractMetaRules', () => {
    it('should return 0 when no validations exist', () => {
      expect(validator.extractMetaRules()).toBe(0)
    })

    it('should create meta-rules for rules with 3+ confirmations', () => {
      const now = new Date().toISOString()
      for (let i = 0; i < 3; i++) {
        db.prepare(
          `INSERT INTO remediation_validations (id, rule_id, file, applied, score_before, score_after, confirmed, validated_at)
           VALUES (?, 'R001', 'src/foo.ts', 1, 3, 1, 1, ?)`,
        ).run(`v${i}`, now)
      }

      const created = validator.extractMetaRules()
      expect(created).toBe(1)

      const metaRules = db.prepare('SELECT * FROM remediation_meta_rules').all()
      expect(metaRules).toHaveLength(1)
    })

    it('should not create duplicate meta-rules', () => {
      const now = new Date().toISOString()
      for (let i = 0; i < 6; i++) {
        db.prepare(
          `INSERT INTO remediation_validations (id, rule_id, file, applied, score_before, score_after, confirmed, validated_at)
           VALUES (?, 'R001', 'src/foo.ts', 1, 3, 1, 1, ?)`,
        ).run(`v${i}`, now)
      }

      expect(validator.extractMetaRules()).toBe(1)
      expect(validator.extractMetaRules()).toBe(0)
    })
  })
})

describe('validateRemediationDiff (node_wire_077325d6c2e0)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS remediation_suppressions (
        id TEXT PRIMARY KEY, file TEXT NOT NULL, violation_type TEXT NOT NULL,
        dimension TEXT NOT NULL, reason TEXT, suppressed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS remediation_validations (
        id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, file TEXT NOT NULL,
        applied INTEGER NOT NULL, score_before INTEGER NOT NULL, score_after INTEGER NOT NULL,
        confirmed INTEGER NOT NULL, validated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS remediation_meta_rules (
        id TEXT PRIMARY KEY, dimension TEXT NOT NULL, violation_type TEXT NOT NULL,
        pattern TEXT, fix_template TEXT, confidence REAL, confirmations INTEGER,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('records the before-snapshot and validates the after-violations in one call', () => {
    const before: ViolationDetail[] = [
      {
        file: 'src/foo.ts',
        line: 10,
        dimension: 'types',
        violationType: 'any_usage',
        evidence: 'any',
        confidence: 1.0,
      },
      {
        file: 'src/foo.ts',
        line: 15,
        dimension: 'types',
        violationType: 'any_usage',
        evidence: 'any',
        confidence: 1.0,
      },
    ]
    const after: ViolationDetail[] = [
      {
        file: 'src/foo.ts',
        line: 10,
        dimension: 'types',
        violationType: 'any_usage',
        evidence: 'any',
        confidence: 1.0,
      },
    ]

    const result = validateRemediationDiff(before, after, db)

    expect(result.confirmed).toBe(1)
    expect(result.autoSuppressed).toBe(0)
    expect(result.total).toBe(1)
    expect(result.metaRulesCreated).toBe(0)
  })

  it('promotes a meta-rule once a rule reaches 3 confirmed validations across calls', () => {
    const makePair = (line: number): [ViolationDetail[], ViolationDetail[]] => [
      [{ file: 'src/foo.ts', line, dimension: 'types', violationType: 'any_usage', evidence: 'any', confidence: 1.0 }],
      [],
    ]

    for (let i = 0; i < 3; i++) {
      const [before, after] = makePair(i)
      validateRemediationDiff(before, after, db)
    }

    const metaRules = db.prepare('SELECT * FROM remediation_meta_rules').all()
    expect(metaRules).toHaveLength(1)
  })
})
