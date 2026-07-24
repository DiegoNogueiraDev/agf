/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { compressMessages, compressToolOutput } from '../core/tool-compress/index.js'

function grepLines(n = 80): string {
  const lines: string[] = []
  for (let i = 1; i <= n; i++) lines.push(`src/file.ts:${i}:line ${i} content here`)
  return lines.join('\n')
}

describe('compressToolOutput', () => {
  it('compresses a recognizable tool output and reports the filter', () => {
    const r = compressToolOutput(grepLines())
    expect(r.saved).toBeGreaterThan(0)
    expect(r.filter).toBe('grep')
    expect(r.value.length).toBeLessThan(grepLines().length)
  })

  it('passes through text below MIN_COMPRESS_SIZE unchanged', () => {
    const r = compressToolOutput('small output')
    expect(r.saved).toBe(0)
    expect(r.filter).toBeNull()
    expect(r.value).toBe('small output')
  })

  it('passes through unrecognized prose unchanged', () => {
    const prose = 'just some prose '.repeat(50) // > MIN but no filter shape
    const r = compressToolOutput(prose)
    expect(r.saved).toBe(0)
    expect(r.value).toBe(prose)
  })
})

describe('compressMessages — driver tagged tool-result (role:user, [tool:...])', () => {
  it('compresses the body of a tagged tool-result and preserves the tag line', () => {
    const tag = '[tool:grep id=call_1]'
    const body = grepLines()
    const msg = { role: 'user', content: `${tag}\n${body}` }
    const stats = compressMessages({ messages: [msg] }, true)

    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBeGreaterThan(0)
    expect(stats!.hits[0].shape).toBe('agent-tool-result')
    // tag preserved verbatim on the first line
    expect((msg.content as string).startsWith(`${tag}\n`)).toBe(true)
    // body got smaller
    expect((msg.content as string).length).toBeLessThan(`${tag}\n${body}`.length)
  })

  it('leaves an ERROR-tagged tool message intact (single line, no body)', () => {
    const content = '[tool:read id=call_2] ERROR: file not found'
    const msg = { role: 'user', content }
    const stats = compressMessages({ messages: [msg] }, true)
    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBe(0)
    expect(msg.content).toBe(content)
  })

  it('leaves a DENIED-tagged tool message intact', () => {
    const content = '[tool:bash id=call_3] DENIED by permission policy: blocked'
    const msg = { role: 'user', content }
    const stats = compressMessages({ messages: [msg] }, true)
    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBe(0)
    expect(msg.content).toBe(content)
  })

  it('leaves a small tagged body unchanged (below MIN_COMPRESS_SIZE)', () => {
    const content = '[tool:echo id=call_4]\nsmall result'
    const msg = { role: 'user', content }
    const stats = compressMessages({ messages: [msg] }, true)
    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBe(0)
    expect(msg.content).toBe(content)
  })

  it('does not touch ordinary (non-tool) user messages', () => {
    const content = 'please refactor this for me '.repeat(40)
    const msg = { role: 'user', content }
    const stats = compressMessages({ messages: [msg] }, true)
    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBe(0)
    expect(msg.content).toBe(content)
  })
})
