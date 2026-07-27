import { describe, it, expect } from 'vitest'
import { BuiltinMemoryProvider } from '../core/memory/builtin-provider.js'

describe('BuiltinMemoryProvider', () => {
  it('can be instantiated', () => {
    expect(() => new BuiltinMemoryProvider('/tmp')).not.toThrow()
  })

  it('has name "builtin"', () => {
    const p = new BuiltinMemoryProvider('/tmp')
    expect(p.name).toBe('builtin')
  })

  it('getToolSchemas returns empty array', () => {
    const p = new BuiltinMemoryProvider('/tmp')
    expect(p.getToolSchemas()).toEqual([])
  })

  it('syncTurn resolves without error', async () => {
    const p = new BuiltinMemoryProvider('/tmp')
    await expect(p.syncTurn({ role: 'user', content: 'hello' })).resolves.toBeUndefined()
  })

  it('prefetch returns array (even for missing path)', async () => {
    const p = new BuiltinMemoryProvider('/nonexistent-path-xyz')
    const result = await p.prefetch({})
    expect(Array.isArray(result)).toBe(true)
  })
})
