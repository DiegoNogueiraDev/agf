import { describe, it, expect } from 'vitest'
import { classifyTools, getLayerDistribution } from '../core/insights/deterministic-layers.js'
import type { DeterministicLayer } from '../core/insights/deterministic-layers.js'

describe('classifyTools', () => {
  it('returns a non-empty array of tool classifications', () => {
    const tools = classifyTools()
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThan(0)
  })

  it('each classification has toolName, layer, and rationale', () => {
    for (const tool of classifyTools()) {
      expect(typeof tool.toolName).toBe('string')
      expect(typeof tool.layer).toBe('string')
      expect(['L0_SQL', 'L1_Cache', 'L2_Heuristic', 'L3_PropertyBased', 'L4_MetaRule']).toContain(tool.layer)
      expect(typeof tool.rationale).toBe('string')
    }
  })
})

describe('getLayerDistribution', () => {
  it('returns distribution for all 5 layers', () => {
    const dist = getLayerDistribution()
    const layers: DeterministicLayer[] = ['L0_SQL', 'L1_Cache', 'L2_Heuristic', 'L3_PropertyBased', 'L4_MetaRule']
    for (const layer of layers) {
      expect(typeof dist[layer]).toBe('number')
    }
  })

  it('total distribution equals number of classified tools', () => {
    const tools = classifyTools()
    const dist = getLayerDistribution()
    const total = Object.values(dist).reduce((a, b) => a + b, 0)
    expect(total).toBe(tools.length)
  })

  it('all layer counts are non-negative', () => {
    const dist = getLayerDistribution()
    for (const count of Object.values(dist)) {
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })
})
