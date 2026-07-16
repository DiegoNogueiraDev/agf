import { describe, it, expect } from 'vitest'
import type { CommandPort } from '../tui/dispatch.js'
import { knapsack01 } from '../core/algorithms/dp/knapsack.js'
import { linearRegression } from '../core/algorithms/stats/linear-regression.js'
import { sparkline } from '../tui/widgets/sparkline.js'
import { gauge } from '../tui/widgets/gauge.js'
import { statusPill } from '../tui/widgets/status-pill.js'

function makePort(): CommandPort {
  return {
    findNext: () => null,
    stats: () => ({ totalNodes: 0, byStatus: {} }),
    metrics: () => ({ total: 0, costUsd: 0, calls: 0 }),
    getPhase: () => 'IMPLEMENT',
    getModel: () => 'haiku',
    listSkills: () => [],
    getSkill: () => undefined,
    principles: () => [],
    providers: () => [],
    quality: () => ({ testScore: 0, logScore: 0, passed: false, totalModules: 0, darkModules: [] }),
    getGraphNodes: () => [],
    cacheStats: () => ({
      sessionHits: 0,
      sessionMisses: 0,
      sessionSize: 0,
      sessionCapacity: 128,
      sessionEvictions: 0,
      toolCacheHits: 0,
      toolCacheMisses: 0,
      toolCacheInvalidations: 0,
      tokensSavedEstimate: 0,
      costAvoidedUsd: 0,
    }),
    runAlgorithm(name: string, args: string): string {
      switch (name) {
        case 'knapsack':
          return `Knapsack max: ${knapsack01([60, 100, 120], [10, 20, 30], 50)}`
        case 'linear-regression': {
          const points = [
            [1, 2],
            [2, 4],
            [3, 6],
          ]
          const r = linearRegression(points)
          return `y = ${r.slope.toFixed(2)}x + ${r.intercept.toFixed(2)} (R² = ${r.r2.toFixed(2)})`
        }
        case 'sparkline': {
          const vals = args
            .split(',')
            .map(Number)
            .filter((n) => !isNaN(n))
          return sparkline(vals)
        }
        case 'gauge': {
          const val = parseInt(args, 10)
          return gauge(isNaN(val) ? 0 : val)
        }
        case 'status': {
          return statusPill(args)
        }
        default:
          return `[${name}] — args: ${args}`
      }
    },
  }
}

describe('Algorithm dispatch integration', () => {
  it('knapsack dispatches via port.runAlgorithm', () => {
    const port = makePort()
    expect(port.runAlgorithm('knapsack', '')).toContain('220')
  })

  it('linear-regression dispatches via port', () => {
    const result = makePort().runAlgorithm('linear-regression', '')
    expect(result).toContain('R²')
  })
})

describe('Widget algorithm integration', () => {
  it('sparkline renders via port', () => {
    const port = makePort()
    const result = port.runAlgorithm('sparkline', '1,3,2,5,4')
    expect(result.length).toBeGreaterThan(0)
    expect(result).toMatch(/[▁▂▃▄▅▆▇█]/)
  })

  it('gauge renders via port', () => {
    const result = makePort().runAlgorithm('gauge', '75')
    expect(result).toContain('75%')
  })

  it('status provides status pills via port', () => {
    const result = makePort().runAlgorithm('status', 'done')
    expect(result).toContain('✔')
    expect(result).toContain('done')
  })
})

describe('Algorithm module edge cases', () => {
  it('knapsack handles empty items', () => {
    expect(knapsack01([], [], 10)).toBe(0)
  })

  it('linear regression handles 2 points', () => {
    const r = linearRegression([
      [0, 0],
      [1, 1],
    ])
    expect(r.slope).toBeCloseTo(1, 5)
    expect(r.intercept).toBeCloseTo(0, 5)
  })

  it('sparkline handles empty', () => {
    expect(sparkline([])).toBe('')
  })

  it('gauge handles extremes', () => {
    expect(gauge(-10)).toContain('0%')
    expect(gauge(150)).toContain('100%')
  })
})
