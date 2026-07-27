/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { format5W2HForDisplay } from '../core/analyzer/wave-12-5w2h-generator.js'
import type { Wave125W2HAnalysis } from '../schemas/wave-12-5w2h-analysis.js'

function makeMockAnalysis(overrides?: Partial<Wave125W2HAnalysis>): Wave125W2HAnalysis {
  return {
    initiative_id: 'test-001',
    initiative_name: 'Test Initiative',
    created_at: '2026-01-01T00:00:00.000Z',
    last_updated: '2026-01-01T00:00:00.000Z',
    why: {
      rationale: 'Faster feedback loops reduce cycle time.',
      benefits: ['Lower cost per iteration', 'Increased local confidence'],
      risks_mitigated: ['Late-stage test failures'],
    },
    what: {
      artifact: 'CLI tool for local isolation',
      deliverables: ['sandbox resolve', 'sandbox build'],
      scope: 'hybrid',
    },
    who: {
      primary_stakeholders: [
        {
          role: 'AI Developers',
          responsibilities: ['Use sandbox commands'],
          count_estimate: 15,
        },
      ],
      secondary_stakeholders: [
        {
          role: 'QA Engineers',
          responsibilities: ['Validate sandbox outputs'],
          count_estimate: 5,
        },
      ],
    },
    when: {
      timeline_phases: [
        { phase_name: 'ANALYZE', duration_weeks: 1, dependencies: [] },
        { phase_name: 'IMPLEMENT', duration_weeks: 2, dependencies: ['ANALYZE'] },
      ],
      total_duration_weeks: 3,
      critical_milestone: 'MVP ready for pilot',
    },
    where: {
      execution_environments: [{ name: 'local', purpose: 'Developer workstations', access_requirements: ['Docker'] }],
      primary_environment: 'local',
    },
    how: {
      approach: '3-tier isolation with caching',
      architecture_tiers: [
        {
          name: 'Resolver',
          responsibility: 'Dependency resolution',
          technology_stack: ['npm ci', 'SHA256'],
        },
      ],
      key_mechanisms: ['Deterministic execution via fixed seed'],
      fallback_strategies: ['Process isolation fallback'],
    },
    how_much: {
      cost_summary: {
        development_effort_person_weeks: 8,
        infrastructure_cost_usd_monthly: 150,
        maintenance_effort_percent: 15,
      },
      team_size: { developers: 2, qa_engineers: 1, devops_infra: 1 },
      resource_requirements: { compute_hours_per_week: 40, storage_gb: 10, concurrent_executions: 5 },
      incremental_phases: [{ phase: 'MVP', effort_weeks: 2, scope: 'Basic build + test' }],
    },
    ...overrides,
  }
}

describe('format5W2HForDisplay', () => {
  it('includes initiative name and generated timestamp', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('Test Initiative')
    expect(output).toContain('2026-01-01T00:00:00.000Z')
  })

  it('includes all 7 section headers', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('WHY')
    expect(output).toContain('WHAT')
    expect(output).toContain('WHO')
    expect(output).toContain('WHEN')
    expect(output).toContain('WHERE')
    expect(output).toContain('HOW')
    expect(output).toContain('HOW MUCH')
  })

  it('includes rationale and benefits in WHY section', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('Faster feedback loops reduce cycle time.')
    expect(output).toContain('Lower cost per iteration')
  })

  it('includes deliverables in WHAT section', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('sandbox resolve')
  })

  it('includes stakeholder info in WHO section', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('AI Developers')
    expect(output).toContain('15')
  })

  it('includes timeline phases in WHEN section', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('ANALYZE')
    expect(output).toContain('IMPLEMENT')
    expect(output).toContain('Total Duration: 3 weeks')
  })

  it('includes environment info in WHERE section', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('local')
    expect(output).toContain('Developer workstations')
  })

  it('includes technical approach in HOW section', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('3-tier isolation with caching')
    expect(output).toContain('Resolver')
  })

  it('includes cost info in HOW MUCH section', () => {
    const output = format5W2HForDisplay(makeMockAnalysis())
    expect(output).toContain('8pw')
    expect(output).toContain('2dev + 1qa + 1infra')
  })

  it('handles missing risks_mitigated gracefully', () => {
    const analysis = makeMockAnalysis({ why: { rationale: 'test', benefits: ['b1'] } })
    const output = format5W2HForDisplay(analysis as Wave125W2HAnalysis)
    expect(output).toContain('test')
  })
})
