import { describe, it, expect } from 'vitest'
import { emitCodex, emitOpenCode, emitCopilot, emitNative } from '../core/hooks/native-format-emitters.js'
import type { CanonicalHookSpec } from '../core/hooks/native-format-emitters.js'

function makeSpec(cli: 'codex' | 'opencode' | 'copilot', id = 'hook-1'): CanonicalHookSpec {
  return { id, event: 'posttooluse', cli, command: 'echo test' }
}

describe('emitCodex', () => {
  it('returns object with hooks array', () => {
    const result = emitCodex([makeSpec('codex')])
    expect(Array.isArray(result.hooks)).toBe(true)
    expect(result.hooks).toHaveLength(1)
  })

  it('filters out non-codex specs', () => {
    const result = emitCodex([makeSpec('opencode')])
    expect(result.hooks).toHaveLength(0)
  })

  it('maps command to run field', () => {
    const result = emitCodex([makeSpec('codex', 'my-hook')])
    expect(result.hooks[0]?.run).toBe('echo test')
    expect(result.hooks[0]?.name).toBe('my-hook')
  })
})

describe('emitOpenCode', () => {
  it('returns object with triggers array', () => {
    const result = emitOpenCode([makeSpec('opencode')])
    expect(Array.isArray(result.triggers)).toBe(true)
    expect(result.triggers).toHaveLength(1)
  })

  it('maps command to exec field', () => {
    const result = emitOpenCode([makeSpec('opencode', 'oc-hook')])
    expect(result.triggers[0]?.exec).toBe('echo test')
  })
})

describe('emitCopilot', () => {
  it('returns object with hooks array', () => {
    const result = emitCopilot([makeSpec('copilot')])
    expect(Array.isArray(result.hooks)).toBe(true)
    expect(result.hooks).toHaveLength(1)
  })

  it('maps command to command field', () => {
    const result = emitCopilot([makeSpec('copilot')])
    expect(result.hooks[0]?.command).toBe('echo test')
  })
})

describe('emitNative', () => {
  it('dispatches to correct emitter by format', () => {
    const codex = emitNative([makeSpec('codex')], 'codex') as { hooks: unknown[] }
    expect(codex.hooks).toHaveLength(1)
    const opencode = emitNative([makeSpec('opencode')], 'opencode') as { triggers: unknown[] }
    expect(opencode.triggers).toHaveLength(1)
  })
})
