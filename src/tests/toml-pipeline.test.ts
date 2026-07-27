/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { applyTomlPipeline, type TomlPipelineStage } from '../core/tool-compress/toml-pipeline.js'

function generateTestOutput(n: number): string {
  const lines: string[] = []
  for (let i = 1; i <= n; i++) {
    lines.push(`src/file_${i}.ts:${i}: error TS${2000 + i}: type mismatch`)
    lines.push(`  details for line ${i}`)
    lines.push(`  extra context ${i}`)
  }
  return lines.join('\n')
}

describe('applyTomlPipeline — 8-stage filter pipeline', () => {
  it('returns empty string for empty input', () => {
    expect(applyTomlPipeline('', {})).toBe('')
  })

  it('returns original text for empty pipeline', () => {
    const text = 'hello world'
    expect(applyTomlPipeline(text, {})).toBe(text)
  })

  it('Stage 1: strip_ansi removes escape codes', () => {
    const text = '\x1b[32mPASS\x1b[0m  src/test.ts'
    const result = applyTomlPipeline(text, { strip_ansi: true })
    expect(result).toBe('PASS  src/test.ts')
  })

  it('Stage 2: replace applies regex substitutions', () => {
    const text = 'src/file.ts:12: error TS2345: foo'
    const result = applyTomlPipeline(text, {
      replace: [['^src/([^:]+)', '$1']],
    })
    expect(result).toBe('file.ts:12: error TS2345: foo')
  })

  it('Stage 3: match_output short-circuits on match', () => {
    const text = generateTestOutput(100)
    const result = applyTomlPipeline(text, {
      match_output: 'DETECTED',
      match_patterns: ['error TS2005'],
    })
    expect(result).toBe('DETECTED')
  })

  it('Stage 3: match_output passes through when no match', () => {
    const text = generateTestOutput(100)
    const result = applyTomlPipeline(text, {
      match_output: 'NOT_FOUND',
      match_patterns: ['XYZ_NONEXISTENT'],
    })
    expect(result).toBe(text)
  })

  it('Stage 4: strip_lines removes lines matching pattern', () => {
    const text = generateTestOutput(20)
    const result = applyTomlPipeline(text, {
      strip_lines: ['^  extra'],
    })
    const lines = result.split('\n')
    expect(lines.every((l) => !l.startsWith('  extra'))).toBe(true)
    expect(lines.length).toBeLessThan(text.split('\n').length)
  })

  it('Stage 4: keep_lines keeps only matching lines', () => {
    const text = generateTestOutput(10)
    const result = applyTomlPipeline(text, {
      keep_lines: ['error TS'],
    })
    expect(result.split('\n').length).toBe(10) // only error lines
    expect(result.split('\n').every((l) => l.includes('error TS'))).toBe(true)
  })

  it('Stage 5: truncate_lines_at caps line length', () => {
    const text = 'this is a very long line that should be truncated'
    const result = applyTomlPipeline(text, { truncate_lines_at: 20 })
    expect(result.length).toBe(20)
  })

  it('Stage 6a: head_lines keeps first N lines', () => {
    const text = generateTestOutput(50)
    const result = applyTomlPipeline(text, { head_lines: 10 })
    expect(result.split('\n').length).toBe(10)
  })

  it('Stage 6b: tail_lines keeps last N lines', () => {
    const text = generateTestOutput(50)
    const result = applyTomlPipeline(text, { tail_lines: 10 })
    expect(result.split('\n').length).toBe(10)
  })

  it('Stage 7: max_lines caps total lines with truncation note', () => {
    const text = generateTestOutput(100)
    const result = applyTomlPipeline(text, { max_lines: 30 })
    const lines = result.split('\n')
    expect(lines.length).toBeLessThanOrEqual(35) // 30 + truncation note + head/tail split
    expect(result).toContain('truncated')
  })

  it('Stage 8: on_empty returns fallback when result is empty', () => {
    const text = 'hello'
    const result = applyTomlPipeline(text, {
      strip_lines: ['hello'], // strips everything
      on_empty: 'NO OUTPUT',
    })
    expect(result).toBe('NO OUTPUT')
  })

  it('full pipeline: strips ANSI + keeps errors + truncates + caps lines', () => {
    const text =
      '\x1b[31mFAIL\x1b[0m src/a.ts\n\x1b[32mPASS\x1b[0m src/b.ts\n\x1b[31mFAIL\x1b[0m src/c.ts\n\x1b[32mPASS\x1b[0m src/d.ts'
    const result = applyTomlPipeline(text, {
      strip_ansi: true,
      keep_lines: ['FAIL'],
      head_lines: 2,
    })
    expect(result).not.toContain('\x1b')
    expect(result).toContain('FAIL')
  })

  it('never returns worse than original', () => {
    const text = 'short'
    // A pipeline that would expand the text
    const result = applyTomlPipeline(text, {
      on_empty: 'this is a much longer fallback text that exceeds original',
    })
    // Original preserved since result isn't empty and longer
    expect(result.length).toBeLessThanOrEqual(text.length + 5)
  })

  it('achieves >=60% reduction on large test output', () => {
    const text = generateTestOutput(200) // 600 lines
    const result = applyTomlPipeline(text, {
      keep_lines: ['error TS'],
      head_lines: 80,
    })
    const originalLen = text.length
    const resultLen = result.length
    const reduction = ((originalLen - resultLen) / originalLen) * 100
    expect(reduction).toBeGreaterThanOrEqual(60)
  })
})
