/*!
 * TDD: diff-edits economy lever (node_ec8a2004c192).
 *
 * AC1: editing 1 function in a 500-line file → diff output is much smaller than 500 lines
 * AC2: applied diff → file content is correct
 * AC3: diff that doesn't apply cleanly → fallback to full rewrite (returns original+new, safe)
 */

import { describe, it, expect } from 'vitest'
import { buildSearchReplace, applySearchReplace, type SearchReplaceEdit } from '../core/economy/diff-edit.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeBigFile(targetFn: string): string {
  const padding = Array.from({ length: 490 }, (_, i) => `// line ${i + 1}`).join('\n')
  return `${padding}\n${targetFn}`
}

const OLD_FN = `function add(a: number, b: number): number {\n  return a + b\n}`
const NEW_FN = `function add(a: number, b: number): number {\n  return a + b + 0 // no-op\n}`

describe('buildSearchReplace — AC1: diff output is small', () => {
  it('AC1: edit encodes only the changed region, not the full file', () => {
    const original = makeBigFile(OLD_FN)
    const edit = buildSearchReplace(OLD_FN, NEW_FN)
    expect(edit).not.toBeNull()
    // The edit search/replace is much smaller than the 500-line file
    const editSize = (edit!.search + edit!.replace).split('\n').length
    const fileSize = original.split('\n').length
    expect(editSize).toBeLessThan(fileSize / 10)
  })

  it('returns null when old and new are identical (no edit needed)', () => {
    const edit = buildSearchReplace(OLD_FN, OLD_FN)
    expect(edit).toBeNull()
  })
})

describe('applySearchReplace — AC2: applied diff produces correct file', () => {
  it('AC2: replacing a function in a large file produces correct result', () => {
    const original = makeBigFile(OLD_FN)
    const edit: SearchReplaceEdit = { search: OLD_FN, replace: NEW_FN }
    const result = applySearchReplace(original, edit)
    expect(result.applied).toBe(true)
    expect(result.content).toContain(NEW_FN)
    expect(result.content).not.toContain(OLD_FN)
  })

  it('AC2: result still contains unchanged lines', () => {
    const original = makeBigFile(OLD_FN)
    const edit: SearchReplaceEdit = { search: OLD_FN, replace: NEW_FN }
    const result = applySearchReplace(original, edit)
    expect(result.content).toContain('// line 1')
    expect(result.content).toContain('// line 490')
  })
})

describe('applySearchReplace — AC3: fallback on non-matching diff', () => {
  it('AC3: search string not found → applied=false, content=original', () => {
    const original = makeBigFile(OLD_FN)
    const edit: SearchReplaceEdit = {
      search: 'function doesNotExist() {}',
      replace: 'function doesNotExist() { return 1 }',
    }
    const result = applySearchReplace(original, edit)
    expect(result.applied).toBe(false)
    expect(result.content).toBe(original)
  })
})
