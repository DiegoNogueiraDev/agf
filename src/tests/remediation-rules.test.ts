/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { listRules, findRule, resolveTemplate } from '../core/harness/remediation-rules.js'

describe('remediation-rules', () => {
  describe('listRules', () => {
    it('should return exactly 16 rules', () => {
      const rules = listRules()
      expect(rules).toHaveLength(16)
    })

    it('should return all rule IDs R001-R016', () => {
      const ids = listRules()
        .map((r) => r.id)
        .sort()
      expect(ids).toEqual([
        'R001',
        'R002',
        'R003',
        'R004',
        'R005',
        'R006',
        'R007',
        'R008',
        'R009',
        'R010',
        'R011',
        'R012',
        'R013',
        'R014',
        'R015',
        'R016',
      ])
    })

    it('should return a defensive copy, not the internal array', () => {
      const rules = listRules()
      rules.push({} as never)
      expect(listRules()).toHaveLength(16)
    })
  })

  describe('findRule', () => {
    it('should find rule by violationType', () => {
      const rule = findRule('any_usage')
      expect(rule).not.toBeNull()
      expect(rule!.id).toBe('R001')
    })

    it('should return null for unknown violationType', () => {
      expect(findRule('nonexistent_violation')).toBeNull()
    })

    it('should return correct category for each type', () => {
      expect(findRule('any_usage')!.category).toBe('replace')
      expect(findRule('missing_test')!.category).toBe('add')
      expect(findRule('generic_name')!.category).toBe('refactor')
    })
  })

  describe('resolveTemplate', () => {
    it('should replace {file} placeholder', () => {
      const result = resolveTemplate('Fix {file}:{line}', 'src/foo.ts', 42, 'evidence text')
      expect(result).toBe('Fix src/foo.ts:42')
    })

    it('should replace {evidence} placeholder', () => {
      const result = resolveTemplate('Rename {evidence} in {file}', 'src/bar.ts', 10, 'data')
      expect(result).toBe('Rename data in src/bar.ts')
    })

    it('should replace all occurrences of {file}', () => {
      const result = resolveTemplate('{file} is in {file}', 'x.ts', 1, 'e')
      expect(result).toBe('x.ts is in x.ts')
    })
  })
})
