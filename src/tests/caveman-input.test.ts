/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { cavemanFilterInput } from '../core/economy/caveman-input.js'

describe('cavemanFilterInput', () => {
  it('compresses NL text by removing articles and filler', () => {
    const input = 'I think that the best way to do this is to simply run the command'
    const out = cavemanFilterInput(input)
    expect(out.length).toBeLessThan(input.length * 0.7)
    expect(out).not.toContain('the')
  })

  it('preserves code-fence blocks exactly', () => {
    const input = 'Here is the code:\n```\nconst foo = 1\nconst bar = 2\n```\nHope that makes sense'
    const out = cavemanFilterInput(input)
    expect(out).toContain('```')
    expect(out).toContain('const foo = 1')
    expect(out).toContain('const bar = 2')
    expect(out.length).toBeLessThan(input.length)
  })

  it('preserves identifiers in NL text near code', () => {
    const input = 'the function parseInput should really be called with myVariable, and then just return the result'
    const out = cavemanFilterInput(input)
    expect(out).toContain('parseInput')
    expect(out).toContain('myVariable')
  })

  it('preserves multiple code fences', () => {
    const input = 'First:\n```\nconst x = 1\n```\nThen:\n```\nconst y = 2\n```\nAnd that is it'
    const out = cavemanFilterInput(input)
    expect(out).toContain('```\nconst x = 1\n```')
    expect(out).toContain('```\nconst y = 2\n```')
  })

  it('preserves empty code fences', () => {
    const input = 'Just some ```code``` inline'
    const out = cavemanFilterInput(input)
    expect(out).not.toContain('Just some')
    expect(out).toContain('```code```')
  })

  it('returns empty string for empty input', () => {
    expect(cavemanFilterInput('')).toBe('')
  })

  it('preserves numbers and urls in NL', () => {
    const input = 'the file at https://example.com is 2048 bytes and created in 2024'
    const out = cavemanFilterInput(input)
    expect(out).toContain('https://example.com')
    expect(out).toContain('2048')
    expect(out).toContain('2024')
  })

  it('significantly compresses verbose NL', () => {
    const input =
      'I believe that the most appropriate way to handle this particular situation would be to actually just run the following command as a matter of fact'
    const out = cavemanFilterInput(input)
    const ratio = out.length / input.length
    expect(ratio).toBeLessThan(0.65)
  })

  it('preserves code fence with language tag', () => {
    const input = 'Look at this:\n```typescript\nfunction hello(): void {\n  console.log("world")\n}\n```\nPretty neat'
    const out = cavemanFilterInput(input)
    expect(out).toContain('```typescript\nfunction hello(): void {')
    expect(out).toContain('Pretty')
  })
})
