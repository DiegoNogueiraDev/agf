import { describe, it, expect } from 'vitest'
import { CACHEABLE_TOOLS } from '../core/economy/_cacheable-tools.js'
import type { CacheableToolName } from '../core/economy/_cacheable-tools.js'

describe('CACHEABLE_TOOLS', () => {
  it('is a Set', () => {
    expect(CACHEABLE_TOOLS instanceof Set).toBe(true)
  })

  it('is non-empty', () => {
    expect(CACHEABLE_TOOLS.size).toBeGreaterThan(0)
  })

  it('contains expected read-only tools', () => {
    const readOnlyTools: CacheableToolName[] = ['list', 'show', 'search', 'help']
    for (const tool of readOnlyTools) {
      expect(CACHEABLE_TOOLS.has(tool)).toBe(true)
    }
  })

  it('all members are strings', () => {
    for (const tool of CACHEABLE_TOOLS) {
      expect(typeof tool).toBe('string')
    }
  })

  it('has() works correctly', () => {
    expect(CACHEABLE_TOOLS.has('list')).toBe(true)
    expect(CACHEABLE_TOOLS.has('nonexistent_tool_xyz' as CacheableToolName)).toBe(false)
  })
})
