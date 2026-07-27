/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { routeContent, routeContentBypass, MDL_RETRIEVAL_PENALTY_BYTES } from '../core/economy/content-router.js'

describe('routeContent', () => {
  it('routes code to tool-compress compressor', () => {
    const code = 'import { z } from "zod"\nconst x: number = 1\nconst y: number = 2\nconst z: number = 3\n'
    const result = routeContent(code)
    expect(result.contentType).toBe('code')
    expect(result.compressor).toBe('code-passthrough') // code below MIN_COMPRESS_SIZE
    expect(result.bytesAfter).toBe(result.bytesBefore)
  })

  it('routes large code output to tool-compress and detects content type correctly', () => {
    // Build git diff output large enough for MIN_COMPRESS_SIZE (500)
    const lines: string[] = ['diff --git a/src/a.ts b/src/a.ts']
    for (let i = 0; i < 20; i++) {
      lines.push(`@@ -${i},1 +${i},1 @@`)
      lines.push(`-old line ${i}`)
      lines.push(`+new line ${i}`)
    }
    const code = lines.join('\n')
    const result = routeContent(code)
    expect(result.contentType).toBe('code')
    // tool-compress may or may not compress depending on filter match — routing is correct either way
    expect(['git-diff', 'code-passthrough']).toContain(result.compressor)
  })

  it('routes code to tool-compress even when no specific filter matches', () => {
    // Code-like input below MIN_COMPRESS_SIZE passes through tool-compress
    const code = 'function main() {\n  return 1\n}\n'
    const result = routeContent(code)
    expect(result.contentType).toBe('code')
    expect(result.compressor).toBe('code-passthrough')
    expect(result.saved).toBe(0)
  })

  it('routes JSON to JSON compressor', () => {
    const json = '{"name":"test","values":[1,2,3,4,5],"nested":{"a":1,"b":2}}'
    const result = routeContent(json)
    expect(result.contentType).toBe('json')
    expect(result.compressor).toBe('json-summarizer')
  })

  it('reduces large JSON arrays via summarization', () => {
    const items: Array<Record<string, number>> = []
    for (let i = 0; i < 50; i++) {
      items.push({ id: i, value: i * 10 })
    }
    const json = JSON.stringify(items)
    const result = routeContent(json)
    expect(result.contentType).toBe('json')
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore)
    expect(result.compressor).toBe('json-summarizer')
  })

  it('passes small JSON through unchanged', () => {
    const json = '{"a":1}'
    const result = routeContent(json)
    expect(result.contentType).toBe('json')
    expect(result.output).toBe(json)
  })

  it('routes log to dedup-log compressor', () => {
    const lines: string[] = []
    for (let i = 0; i < 10; i++) {
      lines.push('[2024-01-15 10:30:00] INFO: processing item')
    }
    const log = lines.join('\n')
    const result = routeContent(log)
    expect(result.contentType).toBe('log')
    expect(result.compressor).toBe('dedup-log')
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore)
    // Should collapse duplicate lines
    expect(result.output).toContain('duplicate lines')
  })

  it('routes text to caveman compressor', () => {
    const text = 'I think this is actually a very interesting piece of text that probably could be more concise.'
    const result = routeContent(text)
    expect(result.contentType).toBe('text')
    expect(result.compressor).toBe('caveman')
    // Caveman removes fillers like "I think", "actually", "very", "probably"
    expect(result.output).not.toContain('I think')
  })

  it('handles empty string as text', () => {
    const result = routeContent('')
    expect(result.contentType).toBe('text')
    expect(result.output).toBe('')
  })

  it('returns stats correctly', () => {
    const text =
      'I think this is a very long sentence that should be compressed significantly via caveman mode. I believe it is probably going to work.'
    const result = routeContent(text)
    expect(result.bytesBefore).toBe(text.length)
    expect(result.bytesAfter).toBeLessThanOrEqual(text.length)
    expect(result.saved).toBe(result.bytesBefore - result.bytesAfter)
  })

  describe('mdl_select gate (opt-in)', () => {
    // A large homogeneous JSON array crushes far below the original.
    const bigJson = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i, name: 'row', active: true })))

    it('is OFF by default — no MDL adjudication, byte-identical', () => {
      const r = routeContent(bigJson)
      expect(r.selector).toBeUndefined()
      expect(r.saved).toBeGreaterThan(0)
    })

    it('keeps a worthwhile compression when MDL beats the retrieval penalty', () => {
      const off = routeContent(bigJson)
      expect(off.saved).toBeGreaterThan(MDL_RETRIEVAL_PENALTY_BYTES)
      const on = routeContent(bigJson, { mdl: true })
      expect(on.selector).toBe('mdl')
      expect(on.saved).toBe(off.saved) // worthwhile → kept
    })

    it('rejects a marginal compression not worth the CCR retrieval penalty', () => {
      // dedupLog collapses the duplicate but saves only a handful of bytes.
      const marginalLog = 'WARN cache miss key=ab\nWARN cache miss key=ab\n'
      const off = routeContent(marginalLog)
      expect(off.saved).toBeGreaterThan(0)
      expect(off.saved).toBeLessThanOrEqual(MDL_RETRIEVAL_PENALTY_BYTES)
      const on = routeContent(marginalLog, { mdl: true })
      expect(on.selector).toBe('mdl')
      expect(on.output).toBe(marginalLog) // reverted to identity
      expect(on.saved).toBe(0)
    })
  })
})

describe('routeContentBypass', () => {
  it('returns text unchanged', () => {
    const text = 'anything here'
    const result = routeContentBypass(text)
    expect(result.output).toBe(text)
    expect(result.bytesAfter).toBe(result.bytesBefore)
    expect(result.saved).toBe(0)
  })
})
