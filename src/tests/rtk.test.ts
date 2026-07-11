/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { compressMessages, formatCompressLog } from '../core/tool-compress/index.js'

function grepLines(n = 80): string {
  const lines: string[] = []
  for (let i = 1; i <= n; i++) lines.push(`src/file.ts:${i}:line ${i} content here`)
  return lines.join('\n')
}

describe('compressMessages', () => {
  it('returns null when disabled', () => {
    expect(compressMessages({ messages: [] }, false)).toBeNull()
  })

  it('returns null when body is null', () => {
    expect(compressMessages(null, true)).toBeNull()
  })

  it('compresses OpenAI tool format (role:tool, content:string)', () => {
    const body = {
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'tool',
          content: grepLines(),
          tool_call_id: 'call_1',
        },
      ],
    }
    const stats = compressMessages(body, true)
    expect(stats).not.toBeNull()
    expect(stats!.bytesBefore).toBeGreaterThan(0)
    expect(stats!.bytesAfter).toBeLessThan(stats!.bytesBefore)
    expect(stats!.hits.length).toBeGreaterThan(0)
  })

  it('preserves is_error tool results', () => {
    const body = {
      messages: [
        {
          role: 'tool',
          content: [{ type: 'text', text: 'some content' }],
          is_error: true,
        },
      ],
    }
    const stats = compressMessages(body, true)
    expect(stats).not.toBeNull()
    expect(body.messages[0].content[0].text).toBe('some content')
  })

  it('compresses Claude tool_result string format', () => {
    const body = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: grepLines() }],
        },
      ],
    }
    const stats = compressMessages(body, true)
    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBeGreaterThan(0)
  })

  it('compresses Claude tool_result array format', () => {
    const body = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tu_1',
              content: [
                { type: 'text', text: grepLines(60) },
                { type: 'text', text: grepLines(40) },
              ],
            },
          ],
        },
      ],
    }
    const stats = compressMessages(body, true)
    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBeGreaterThan(0)
  })

  it('compresses OpenAI Responses format', () => {
    const body = {
      input: [{ type: 'function_call_output', output: grepLines() }],
    }
    const stats = compressMessages(body, true)
    expect(stats).not.toBeNull()
    expect(stats!.bytesBefore).toBeGreaterThan(0)
    expect(stats!.bytesAfter).toBeLessThan(stats!.bytesBefore)
  })

  it('handles malformed request gracefully', () => {
    const body = { messages: 'not an array' }
    const stats = compressMessages(body as unknown as Record<string, unknown>, true)
    expect(stats).toBeNull()
  })

  it('handles Kiro format', () => {
    const body = {
      conversationState: {
        history: [
          {
            userInputMessage: {
              userInputMessageContext: {
                toolResults: [{ status: 'success', content: [{ text: grepLines() }] }],
              },
            },
          },
        ],
      },
    }
    const stats = compressMessages(body, true)
    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBeGreaterThan(0)
  })

  it('skips Kiro error status tool results', () => {
    const body = {
      conversationState: {
        history: [
          {
            userInputMessage: {
              userInputMessageContext: {
                toolResults: [{ status: 'error', content: [{ text: grepLines(100) }] }],
              },
            },
          },
        ],
      },
    }
    const stats = compressMessages(body, true)
    expect(stats).not.toBeNull()
    expect(stats!.hits.length).toBe(0)
  })

  it('small text below MIN_COMPRESS_SIZE passes through unchanged', () => {
    const body = {
      messages: [{ role: 'tool', content: 'small', tool_call_id: 'c1' }],
    }
    const stats = compressMessages(body, true)
    expect(stats).not.toBeNull()
    expect(stats!.bytesBefore).toBe(stats!.bytesAfter)
  })
})

describe('formatCompressLog', () => {
  it('returns null for null stats', () => {
    expect(formatCompressLog(null)).toBeNull()
  })

  it('returns null for empty hits', () => {
    expect(formatCompressLog({ bytesBefore: 100, bytesAfter: 100, hits: [] })).toBeNull()
  })

  it('formats log line with filters and savings', () => {
    const stats = {
      bytesBefore: 1000,
      bytesAfter: 300,
      hits: [{ shape: 'openai-tool', filter: 'grep', saved: 700 }],
    }
    const log = formatCompressLog(stats)
    expect(log).toContain('saved 700B')
    expect(log).toContain('[grep]')
    expect(log).toContain('70.0%')
  })
})
