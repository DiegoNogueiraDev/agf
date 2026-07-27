/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_3b9f2355433a — C82-T1: tests for diffPrd section comparison
 *
 * AC: identical texts → 0 added/removed; new section → added;
 *     removed section → removed; modified section → modified; blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { diffPrd } from '../core/parser/prd-diff.js'

const SECTION_A = '# Overview\nThis is the overview section.\n'
const SECTION_B = '# Requirements\nThese are the requirements.\n'

describe('diffPrd', () => {
  it('returns object with expected keys', () => {
    const result = diffPrd(SECTION_A, SECTION_A)
    expect(result).toHaveProperty('sections')
    expect(result).toHaveProperty('addedCount')
    expect(result).toHaveProperty('removedCount')
    expect(result).toHaveProperty('modifiedCount')
    expect(result).toHaveProperty('unchangedCount')
  })

  it('identical texts produce 0 added and 0 removed', () => {
    const result = diffPrd(SECTION_A, SECTION_A)
    expect(result.addedCount).toBe(0)
    expect(result.removedCount).toBe(0)
  })

  it('identical texts produce unchanged sections', () => {
    const result = diffPrd(SECTION_A, SECTION_A)
    expect(result.unchangedCount).toBeGreaterThanOrEqual(1)
    expect(result.sections.every((s) => s.status !== 'added' && s.status !== 'removed')).toBe(true)
  })

  it('new section in new text is counted as added', () => {
    const oldText = SECTION_A
    const newText = SECTION_A + SECTION_B
    const result = diffPrd(oldText, newText)
    expect(result.addedCount).toBeGreaterThanOrEqual(1)
    const addedSection = result.sections.find((s) => s.status === 'added')
    expect(addedSection).toBeDefined()
  })

  it('section removed from new text is counted as removed', () => {
    const oldText = SECTION_A + SECTION_B
    const newText = SECTION_A
    const result = diffPrd(oldText, newText)
    expect(result.removedCount).toBeGreaterThanOrEqual(1)
    const removedSection = result.sections.find((s) => s.status === 'removed')
    expect(removedSection).toBeDefined()
  })

  it('modified section is counted as modified', () => {
    const oldText = '# Overview\nOriginal content.\n'
    const newText = '# Overview\nCompletely different content.\n'
    const result = diffPrd(oldText, newText)
    expect(result.modifiedCount).toBeGreaterThanOrEqual(1)
    const modifiedSection = result.sections.find((s) => s.status === 'modified')
    expect(modifiedSection).toBeDefined()
  })

  it('section counts add up correctly', () => {
    const result = diffPrd(SECTION_A + SECTION_B, SECTION_A)
    const total = result.addedCount + result.removedCount + result.modifiedCount + result.unchangedCount
    expect(total).toBe(result.sections.length)
  })

  it('empty old text and non-empty new text produces adds', () => {
    const result = diffPrd('', SECTION_A)
    expect(result.addedCount).toBeGreaterThanOrEqual(1)
    expect(result.removedCount).toBe(0)
  })

  it('non-empty old text and empty new text produces removes', () => {
    const result = diffPrd(SECTION_A, '')
    expect(result.removedCount).toBeGreaterThanOrEqual(1)
    expect(result.addedCount).toBe(0)
  })

  it('does not throw on empty inputs', () => {
    expect(() => diffPrd('', '')).not.toThrow()
  })

  it('two empty texts produce 0 sections or all unchanged', () => {
    const result = diffPrd('', '')
    expect(result.addedCount).toBe(0)
    expect(result.removedCount).toBe(0)
    expect(result.modifiedCount).toBe(0)
  })

  it('sections array is always an array', () => {
    const result = diffPrd(SECTION_A, SECTION_B)
    expect(Array.isArray(result.sections)).toBe(true)
  })

  it('each section has a title and status', () => {
    const result = diffPrd(SECTION_A + SECTION_B, SECTION_A)
    for (const s of result.sections) {
      expect(typeof s.title).toBe('string')
      expect(['added', 'removed', 'modified', 'unchanged']).toContain(s.status)
    }
  })
})
