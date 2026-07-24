import { describe, it, expect } from 'vitest'
import { FAILURE_MODE_CATEGORIES, generatePreMortem, calculateSeverity } from '../core/designer/premortem-generator.js'
import type { FailureMode, PreMortreGraphDoc } from '../core/designer/premortem-generator.js'

type GraphNode = {
  id: string
  title: string
  type: string
  description?: string | null
  metadata?: Record<string, unknown> | null
}

function makeDecision(description = 'Use cloud provider for deployment'): GraphNode {
  return { id: 'n1', title: 'Cloud Decision', type: 'decision', description }
}

const emptyDoc: PreMortreGraphDoc = { nodes: [], edges: [] }

describe('FAILURE_MODE_CATEGORIES', () => {
  it('contains expected categories', () => {
    expect(FAILURE_MODE_CATEGORIES).toContain('technical')
    expect(FAILURE_MODE_CATEGORIES).toContain('adoption')
    expect(FAILURE_MODE_CATEGORIES).toContain('operational')
    expect(FAILURE_MODE_CATEGORIES).toContain('security')
  })
})

describe('generatePreMortem', () => {
  it('returns an array', () => {
    const result = generatePreMortem(makeDecision(), emptyDoc)
    expect(Array.isArray(result)).toBe(true)
  })

  it('each failure mode has required fields', () => {
    const result = generatePreMortem(makeDecision(), emptyDoc)
    for (const fm of result) {
      expect(typeof fm.description).toBe('string')
      expect(FAILURE_MODE_CATEGORIES).toContain(fm.category)
      expect(['critical', 'warning', 'info']).toContain(fm.severity)
      expect(Array.isArray(fm.relatedNodeIds)).toBe(true)
    }
  })
})

describe('calculateSeverity', () => {
  it('returns info for neutral failure mode', () => {
    const fm: FailureMode = {
      description: 'might cause minor issues',
      category: 'technical',
      severity: 'info',
      relatedNodeIds: [],
    }
    expect(calculateSeverity(fm)).toBe('info')
  })

  it('elevates to warning when low composite score', () => {
    const fm: FailureMode = { description: 'minor concern', category: 'adoption', severity: 'info', relatedNodeIds: [] }
    expect(calculateSeverity(fm, 30)).toBe('warning')
  })

  it('elevates to critical when warning + low composite score', () => {
    const fm: FailureMode = {
      description: 'likely to fail',
      category: 'technical',
      severity: 'warning',
      relatedNodeIds: [],
    }
    const result = calculateSeverity(fm, 20)
    expect(['critical', 'warning']).toContain(result)
  })
})
