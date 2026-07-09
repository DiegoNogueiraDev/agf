import { describe, it, expect } from 'vitest'
import { applyPreset, getActivePreset, listPresets, type PresetConfig } from '../tui/presets.js'

describe('Presets', () => {
  it('default preset tem WIP=1 e gates advisory', () => {
    applyPreset('default')
    const p = getActivePreset()
    expect(p.name).toBe('default')
    expect(p.wip).toBe(1)
    expect(p.gates).toBe('advisory')
  })

  it('strict-tdd tem WIP=1 e gates strict', () => {
    applyPreset('strict-tdd')
    const p = getActivePreset()
    expect(p.name).toBe('strict-tdd')
    expect(p.wip).toBe(1)
    expect(p.gates).toBe('strict')
    expect(p.harnessMinimum).toBe(70)
  })

  it('agile-light tem WIP=3 e gates off', () => {
    applyPreset('agile-light')
    const p = getActivePreset()
    expect(p.name).toBe('agile-light')
    expect(p.wip).toBe(3)
    expect(p.gates).toBe('off')
    expect(p.harnessMinimum).toBe(0)
  })

  it('enterprise tem security obrigatorio', () => {
    applyPreset('enterprise')
    const p = getActivePreset()
    expect(p.name).toBe('enterprise')
    expect(p.wip).toBe(1)
    expect(p.gates).toBe('strict')
    expect(p.requireSecurityScan).toBe(true)
  })

  it('listPresets retorna todos os presets', () => {
    const presets = listPresets()
    expect(presets).toHaveLength(4)
    expect(presets.map((p) => p.name).sort()).toEqual(['agile-light', 'default', 'enterprise', 'strict-tdd'])
  })

  it('preset invalido mantem o anterior', () => {
    applyPreset('default')
    applyPreset('nonexistent')
    expect(getActivePreset().name).toBe('default')
  })
})
