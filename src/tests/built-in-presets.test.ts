import { describe, it, expect } from 'vitest'
import { BUILT_IN_PRESETS, getPreset, resolvePresetInheritance } from '../core/presets/built-in-presets.js'

describe('BUILT_IN_PRESETS', () => {
  it('is a non-empty array', () => {
    expect(BUILT_IN_PRESETS.length).toBeGreaterThan(0)
  })

  it('includes a default preset', () => {
    const names = BUILT_IN_PRESETS.map((p) => p.name)
    expect(names).toContain('default')
  })

  it('each preset has a name', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(typeof preset.name).toBe('string')
      expect(preset.name.length).toBeGreaterThan(0)
    }
  })
})

describe('getPreset', () => {
  it('returns undefined for unknown preset', () => {
    expect(getPreset('nonexistent')).toBeUndefined()
  })

  it('returns the preset for known name', () => {
    const p = getPreset('default')
    expect(p).toBeDefined()
    expect(p?.name).toBe('default')
  })
})

describe('resolvePresetInheritance', () => {
  it('returns preset unchanged when no extends', () => {
    const preset = getPreset('default')!
    const resolved = resolvePresetInheritance(preset, BUILT_IN_PRESETS)
    expect(resolved.name).toBe('default')
  })

  it('merges parent fields into child when extends is set', () => {
    const child = BUILT_IN_PRESETS.find((p) => p.extends)
    if (!child) return
    const resolved = resolvePresetInheritance(child, BUILT_IN_PRESETS)
    expect(resolved.name).toBe(child.name)
  })
})
