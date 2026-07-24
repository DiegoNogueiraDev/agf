/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { stripCommentsAndStrings } from '../core/harness/strip-comments-strings.js'

describe('stripCommentsAndStrings', () => {
  it('blanks line-comment content but keeps code', () => {
    const out = stripCommentsAndStrings('const x = 1 // catch (e) {}')
    expect(out).toContain('const x = 1')
    expect(out).not.toContain('catch (e) {}')
  })

  it('blanks block-comment content', () => {
    const out = stripCommentsAndStrings('/* throw new Error(x) */const y = 2')
    expect(out).not.toContain('throw new Error')
    expect(out).toContain('const y = 2')
  })

  it('blanks string-literal content (single, double, template)', () => {
    expect(stripCommentsAndStrings('const a = "catch (e) {}"')).not.toContain('catch')
    expect(stripCommentsAndStrings("const b = 'throw new Error'")).not.toContain('throw')
    expect(stripCommentsAndStrings('const c = `console.error(x)`')).not.toContain('console.error')
  })

  it('preserves line count and offsets (line numbers stay accurate)', () => {
    const src = 'const x = 1\n// catch (e) {}\nconst y = 2'
    const out = stripCommentsAndStrings(src)
    expect(out.split('\n').length).toBe(src.split('\n').length)
    expect(out.length).toBe(src.length)
  })

  it('leaves real code untouched', () => {
    const src = 'try {\n  risky()\n} catch (e) {}'
    expect(stripCommentsAndStrings(src)).toContain('catch (e) {}')
  })

  it('handles escaped quotes inside strings', () => {
    const out = stripCommentsAndStrings('const s = "a \\" catch (e) {}"')
    expect(out).not.toContain('catch (e) {}')
    expect(out).toContain('const s =')
  })
})
