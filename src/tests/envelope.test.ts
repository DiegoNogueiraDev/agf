import { describe, it, expect } from 'vitest'
import { ok, err } from '../core/output/envelope.js'

const meta = { command: 'test', ms: 1 }

describe('ok', () => {
  it('returns ok: true with data', () => {
    const result = ok({ value: 42 }, meta)
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ value: 42 })
  })

  it('sets meta correctly', () => {
    const result = ok(null, { command: 'node.add', ms: 5, count: 1 })
    expect(result.meta.command).toBe('node.add')
    expect(result.meta.count).toBe(1)
  })

  it('works with string data', () => {
    const result = ok('hello', meta)
    expect(result.data).toBe('hello')
  })

  it('works with undefined data', () => {
    const result = ok(undefined, meta)
    expect(result.ok).toBe(true)
  })
})

describe('err', () => {
  it('returns ok: false with code and error', () => {
    const result = err('NOT_FOUND', 'resource not found', meta)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('NOT_FOUND')
    expect(result.error).toBe('resource not found')
  })

  it('does not include data field', () => {
    const result = err('ERR', 'something failed', meta)
    expect(result.data).toBeUndefined()
  })
})
