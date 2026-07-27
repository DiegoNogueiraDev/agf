import { describe, it, expect, beforeEach } from 'vitest'
import { listPresets, applyPreset, getActivePreset } from '../tui/presets.js'

describe('listPresets', () => {
  it('returns an array of presets', () => {
    const presets = listPresets()
    expect(Array.isArray(presets)).toBe(true)
    expect(presets.length).toBeGreaterThan(0)
  })

  it('includes default preset', () => {
    const presets = listPresets()
    expect(presets.some((p) => p.name === 'default')).toBe(true)
  })

  it('includes strict-tdd preset', () => {
    const presets = listPresets()
    expect(presets.some((p) => p.name === 'strict-tdd')).toBe(true)
  })

  it('each preset has required fields', () => {
    for (const p of listPresets()) {
      expect(typeof p.name).toBe('string')
      expect(typeof p.wip).toBe('number')
      expect(['strict', 'advisory', 'off']).toContain(p.gates)
      expect(typeof p.harnessMinimum).toBe('number')
    }
  })
})

describe('getActivePreset', () => {
  beforeEach(() => {
    applyPreset('default')
  })

  it('returns the default preset initially', () => {
    const active = getActivePreset()
    expect(active.name).toBe('default')
  })

  it('returns a copy (immutable)', () => {
    const a = getActivePreset()
    const b = getActivePreset()
    expect(a).not.toBe(b)
  })

  it('default preset has wip 1', () => {
    const active = getActivePreset()
    expect(active.wip).toBe(1)
  })
})

describe('applyPreset', () => {
  beforeEach(() => {
    applyPreset('default')
  })

  it('switches to strict-tdd', () => {
    applyPreset('strict-tdd')
    expect(getActivePreset().name).toBe('strict-tdd')
    expect(getActivePreset().gates).toBe('strict')
    expect(getActivePreset().harnessMinimum).toBeGreaterThan(0)
  })

  it('switches to agile-light', () => {
    applyPreset('agile-light')
    expect(getActivePreset().name).toBe('agile-light')
    expect(getActivePreset().gates).toBe('off')
    expect(getActivePreset().wip).toBe(3)
  })

  it('switches to enterprise', () => {
    applyPreset('enterprise')
    expect(getActivePreset().requireSecurityScan).toBe(true)
    expect(getActivePreset().requireDocCompleteness).toBe(true)
  })

  it('ignores unknown preset names', () => {
    applyPreset('default')
    applyPreset('nonexistent-preset')
    expect(getActivePreset().name).toBe('default')
  })

  it('can switch back to default', () => {
    applyPreset('strict-tdd')
    applyPreset('default')
    expect(getActivePreset().name).toBe('default')
  })
})
