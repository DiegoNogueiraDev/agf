import { describe, it, expect } from 'vitest'
import { resolvePresets } from '../core/presets/preset-resolver.js'
import type { ResolvePresetsOptions } from '../core/presets/preset-resolver.js'

function makeOptions(overrides: Partial<ResolvePresetsOptions> = {}): ResolvePresetsOptions {
  return {
    pluginPresets: [],
    projectOverrides: {},
    ...overrides,
  }
}

describe('resolvePresets', () => {
  it('returns a ResolvedConfig object', () => {
    const result = resolvePresets(makeOptions())
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('has default port 3000', () => {
    const result = resolvePresets(makeOptions())
    expect(result.port.value).toBe(3000)
    expect(result.port.source).toBe('default')
  })

  it('has default strictness advisory', () => {
    const result = resolvePresets(makeOptions())
    expect(result.strictness.value).toBe('advisory')
  })

  it('applies projectOverrides for port', () => {
    const result = resolvePresets(makeOptions({ projectOverrides: { port: 8080 } }))
    expect(result.port.value).toBe(8080)
    expect(result.port.source).toBe('project')
  })

  it('applies projectOverrides for strictness', () => {
    const result = resolvePresets(makeOptions({ projectOverrides: { strictness: 'strict' } }))
    expect(result.strictness.value).toBe('strict')
    expect(result.strictness.source).toBe('project')
  })

  it('applies plugin presets', () => {
    const pluginPreset = {
      name: 'my-plugin',
      lifecycle: { strictness: 'strict' },
    }
    const result = resolvePresets(makeOptions({ pluginPresets: [pluginPreset as never] }))
    expect(result.strictness.value).toBe('strict')
  })

  it('project overrides take precedence over plugin presets', () => {
    const pluginPreset = {
      name: 'my-plugin',
      lifecycle: { strictness: 'strict' },
    }
    const result = resolvePresets(
      makeOptions({
        pluginPresets: [pluginPreset as never],
        projectOverrides: { strictness: 'advisory' },
      }),
    )
    expect(result.strictness.value).toBe('advisory')
    expect(result.strictness.source).toBe('project')
  })

  it('has phases array in result', () => {
    const result = resolvePresets(makeOptions())
    expect(Array.isArray(result.phases.value)).toBe(true)
    expect(result.phases.value.length).toBeGreaterThan(0)
  })

  it('each ResolvedField has value and source', () => {
    const result = resolvePresets(makeOptions())
    for (const [, field] of Object.entries(result)) {
      expect('value' in (field as object)).toBe(true)
      expect('source' in (field as object)).toBe(true)
    }
  })
})
