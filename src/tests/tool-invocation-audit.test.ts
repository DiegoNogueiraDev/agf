import { describe, it, expect, vi } from 'vitest'
import { redactSecrets, wrapToolHandler } from '../core/security/tool-invocation-audit.js'

describe('redactSecrets', () => {
  it('redacts sk-ant- tokens', () => {
    const result = redactSecrets('my key is sk-ant-abcdefghijklmnopqrstu123') as string
    expect(result).toContain('sk-ant-...')
    expect(result).not.toContain('sk-ant-abcdefghijklmnopqrstu123')
  })

  it('redacts ghu_ github tokens', () => {
    const result = redactSecrets('ghu_abcdefghijklmnopqrstuvwxyz') as string
    expect(result).toContain('ghu_...')
  })

  it('redacts object fields named token', () => {
    const result = redactSecrets({ token: 'super-secret' }) as Record<string, unknown>
    expect(result.token).not.toBe('super-secret')
  })

  it('redacts object fields named password', () => {
    const result = redactSecrets({ password: '1234' }) as Record<string, unknown>
    expect(result.password).not.toBe('1234')
  })

  it('passes through plain strings unchanged', () => {
    expect(redactSecrets('hello world')).toBe('hello world')
  })

  it('passes through null', () => {
    expect(redactSecrets(null)).toBeNull()
  })

  it('handles nested objects', () => {
    const result = redactSecrets({ nested: { apikey: 'key123' } }) as Record<string, Record<string, unknown>>
    expect(result.nested.apikey).not.toBe('key123')
  })

  it('stops recursion beyond depth 6', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 'value' } } } } } } }
    const result = redactSecrets(deep)
    expect(result).toBeTruthy()
  })
})

describe('wrapToolHandler', () => {
  it('calls the underlying handler and returns result', async () => {
    const handler = vi.fn().mockResolvedValue('output')
    const sink = { record: vi.fn() }
    const wrapped = wrapToolHandler('myTool', handler, sink)
    const result = await wrapped({ input: 'x' })
    expect(result).toBe('output')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('records audit entry after call', async () => {
    const handler = vi.fn().mockResolvedValue('ok')
    const sink = { record: vi.fn() }
    const wrapped = wrapToolHandler('tool', handler, sink)
    await wrapped({})
    expect(sink.record).toHaveBeenCalledOnce()
    const entry = sink.record.mock.calls[0][0]
    expect(entry.tool).toBe('tool')
    expect(entry.ok).toBe(true)
  })
})
