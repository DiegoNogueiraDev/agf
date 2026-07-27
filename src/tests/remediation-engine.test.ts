/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { evaluate } from '../core/harness/remediation-engine.js'
import type { ViolationDetail } from '../core/harness/violation-detail.js'

describe('remediation-engine', () => {
  describe('evaluate', () => {
    it('should return empty array for no violations', () => {
      const result = evaluate([])
      expect(result).toEqual([])
    })

    it('should generate suggestion for matching violation', () => {
      const violations: ViolationDetail[] = [
        {
          file: 'src/foo.ts',
          line: 10,
          dimension: 'types',
          violationType: 'any_usage',
          evidence: 'let x: any',
          confidence: 1.0,
        },
      ]
      const result = evaluate(violations)
      expect(result).toHaveLength(1)
      expect(result[0].ruleId).toBe('R001')
      expect(result[0].suggestedFix).toBe('Replace any with explicit type in src/foo.ts:10')
      expect(result[0].confidence).toBe(1.0)
      expect(result[0].priority).toBe(90)
    })

    it('should skip violation with no matching rule', () => {
      const violations: ViolationDetail[] = [
        {
          file: 'src/foo.ts',
          line: 5,
          dimension: 'types',
          violationType: 'unknown_type',
          evidence: 'unknown',
          confidence: 1.0,
        },
      ]
      const result = evaluate(violations)
      expect(result).toEqual([])
    })

    it('should skip suppressed violations when db is provided', () => {
      const db = new Database(':memory:')
      db.exec(`CREATE TABLE IF NOT EXISTS remediation_suppressions (
        id TEXT PRIMARY KEY, file TEXT NOT NULL, violation_type TEXT NOT NULL,
        dimension TEXT NOT NULL, reason TEXT, suppressed_at TEXT NOT NULL
      )`)
      db.prepare(
        'INSERT INTO remediation_suppressions (id, file, violation_type, dimension, suppressed_at) VALUES (?, ?, ?, ?, ?)',
      ).run('s1', 'src/foo.ts', 'any_usage', 'types', new Date().toISOString())

      const violations: ViolationDetail[] = [
        {
          file: 'src/foo.ts',
          line: 10,
          dimension: 'types',
          violationType: 'any_usage',
          evidence: 'let x: any',
          confidence: 1.0,
        },
      ]
      const result = evaluate(violations, db)
      expect(result).toEqual([])
      db.close()
    })

    it('should sort results by priority descending', () => {
      const violations: ViolationDetail[] = [
        { file: 'a.ts', line: 1, dimension: 'docs', violationType: 'missing_readme', evidence: '', confidence: 1.0 },
        {
          file: 'a.ts',
          line: 1,
          dimension: 'fitness',
          violationType: 'bad_import',
          evidence: './utils',
          confidence: 1.0,
        },
        { file: 'a.ts', line: 1, dimension: 'types', violationType: 'any_usage', evidence: 'any', confidence: 1.0 },
      ]
      const result = evaluate(violations)
      expect(result).toHaveLength(3)
      expect(result[0].priority).toBeGreaterThanOrEqual(result[1].priority)
      expect(result[1].priority).toBeGreaterThanOrEqual(result[2].priority)
    })

    it('should handle mixed known and unknown violations', () => {
      const violations: ViolationDetail[] = [
        { file: 'a.ts', line: 1, dimension: 'types', violationType: 'any_usage', evidence: 'any', confidence: 1.0 },
        {
          file: 'b.ts',
          line: 2,
          dimension: 'types',
          violationType: 'unknown_violation',
          evidence: 'x',
          confidence: 1.0,
        },
      ]
      const result = evaluate(violations)
      expect(result).toHaveLength(1)
    })
  })
})
