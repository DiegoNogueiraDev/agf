/*!
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import {
  Wave12GoalSchema,
  Wave12GoalsSchema,
  Wave12OutOfScopeItemSchema,
  Wave12OutOfScopeSchema,
  Wave12OverviewSchema,
  Wave12ProblemSchema,
  Wave12DocumentationSchema,
} from '../schemas/wave-12-prd-schema.js'
import { MultiAgentWipGate } from '../schemas/wip-gate.schema.js'

// ─── wave-12-prd-schema.ts ───────────────────────────────────────────

describe('Wave12GoalSchema', () => {
  const valid = {
    id: 'goal-isolation-quality',
    title: 'Achieve 100% build validation isolation',
    description: 'Ensure every build runs in its own isolated sandbox environment without interference.',
    specific: 'Each build execution will run in a fresh Docker container with no shared state.',
    measurable: 'Zero cross-build contamination incidents for 30 consecutive days.',
    achievable: 'Use Docker containers with ephemeral volumes and unique network namespaces.',
    relevant: 'Critical for Wave-12 sandbox build isolation target.',
    timebound: 'Q2 2026',
    category: 'isolation_quality',
  }
  it('parses valid goal', () => {
    expect(Wave12GoalSchema.parse(valid)).toMatchObject({ id: 'goal-isolation-quality' })
  })
  it('rejects invalid id format', () => {
    expect(() => Wave12GoalSchema.parse({ ...valid, id: 'bad-id' })).toThrow(z.ZodError)
  })
  it('accepts optional fields', () => {
    const data = { ...valid, targetValue: '95', unit: 'percent', deadline: '2026-06-30T23:59:59Z' }
    const parsed = Wave12GoalSchema.parse(data)
    expect(parsed.targetValue).toBe('95')
    expect(parsed.unit).toBe('percent')
  })
  it('rejects short title', () => {
    expect(() => Wave12GoalSchema.parse({ ...valid, title: 'Short' })).toThrow(z.ZodError)
  })
  it('rejects invalid category', () => {
    expect(() => Wave12GoalSchema.parse({ ...valid, category: 'unknown' })).toThrow(z.ZodError)
  })
  it('rejects invalid deadline format', () => {
    expect(() => Wave12GoalSchema.parse({ ...valid, deadline: 'not-a-date' })).toThrow(z.ZodError)
  })
})

describe('Wave12GoalsSchema', () => {
  const goal = () => ({
    id: 'goal-isolation-quality',
    title: 'Achieve 100% build validation isolation',
    description: 'Ensure every build runs in its own isolated sandbox environment without interference.',
    specific: 'Each build execution will run in a fresh Docker container with no shared state.',
    measurable: 'Zero cross-build contamination incidents for 30 consecutive days.',
    achievable: 'Use Docker containers with ephemeral volumes and unique network namespaces.',
    relevant: 'Critical for Wave-12 sandbox build isolation target.',
    timebound: 'Q2 2026',
    category: 'isolation_quality',
  })
  const valid = (n: number) => ({
    waveId: 'wave-12',
    goals: Array.from({ length: n }, goal),
    description: 'Strategic goals for Wave-12 sandbox build isolation and local CI/CD parity.',
    createdAt: '2026-06-06T12:00:00Z',
    createdBy: 'agent-graph-flow',
  })

  it('parses valid goals with 4 goals', () => {
    expect(Wave12GoalsSchema.parse(valid(4))).toMatchObject({ waveId: 'wave-12' })
  })
  it('rejects fewer than 4 goals', () => {
    expect(() => Wave12GoalsSchema.parse(valid(2))).toThrow(z.ZodError)
  })
  it('rejects invalid waveId format', () => {
    expect(() => Wave12GoalsSchema.parse({ ...valid(4), waveId: 'wave-abc' })).toThrow(z.ZodError)
  })
  it('rejects invalid graphNodeId format', () => {
    expect(() => Wave12GoalsSchema.parse({ ...valid(4), graphNodeId: 'bad-id' })).toThrow(z.ZodError)
  })
  it('accepts valid graphNodeId', () => {
    const data = { ...valid(4), graphNodeId: 'node_ec6945f114a8' }
    expect(Wave12GoalsSchema.parse(data)).toMatchObject({ graphNodeId: 'node_ec6945f114a8' })
  })
  it('accepts metadata', () => {
    const data = {
      ...valid(4),
      metadata: { phase: 'ANALYZE', tags: ['sandbox'], isConsolidated: true, sourceFile: 'prd.md' },
    }
    const parsed = Wave12GoalsSchema.parse(data)
    expect(parsed.metadata?.isConsolidated).toBe(true)
  })
})

describe('Wave12OutOfScopeItemSchema', () => {
  const valid = {
    id: 'oos-remote-ci',
    title: 'Replace remote CI pipeline',
    description: 'The sandbox will not replace the existing remote CI pipeline infrastructure.',
    rationale: 'Remote CI is managed by the platform team and out of scope for Wave-12.',
    type: 'infrastructure_replacement',
  }
  it('parses valid item', () => {
    expect(Wave12OutOfScopeItemSchema.parse(valid)).toMatchObject({ id: 'oos-remote-ci' })
  })
  it('rejects invalid id', () => {
    expect(() => Wave12OutOfScopeItemSchema.parse({ ...valid, id: 'bad' })).toThrow(z.ZodError)
  })
  it('rejects invalid type', () => {
    expect(() => Wave12OutOfScopeItemSchema.parse({ ...valid, type: 'unknown' })).toThrow(z.ZodError)
  })
})

describe('Wave12OutOfScopeSchema', () => {
  const item = () => ({
    id: 'oos-remote-ci',
    title: 'Replace remote CI pipeline',
    description: 'The sandbox will not replace the existing remote CI pipeline infrastructure.',
    rationale: 'Remote CI is managed by the platform team and out of scope for Wave-12.',
    type: 'infrastructure_replacement',
  })
  const valid = {
    waveId: 'wave-12',
    items: [item(), item(), item()],
    description: 'Items explicitly excluded from Wave-12 scope.',
    createdAt: '2026-06-06T12:00:00Z',
    createdBy: 'agent-graph-flow',
  }
  it('parses valid out-of-scope', () => {
    expect(Wave12OutOfScopeSchema.parse(valid)).toMatchObject({ waveId: 'wave-12' })
  })
  it('rejects fewer than 3 items', () => {
    expect(() => Wave12OutOfScopeSchema.parse({ ...valid, items: [item()] })).toThrow(z.ZodError)
  })
})

describe('Wave12OverviewSchema', () => {
  const valid = {
    title: 'Visão Geral',
    rationale: 'Local CI/CD isolation reduces feedback loops and prevents cross-contamination.',
    isolationMechanisms: ['Docker', 'Podman'],
    targetFlow: 'Developer triggers build → sandbox creates isolated env → runs tests → reports results.',
    integrationPoints: ['finish_task', 'qualityGates'],
  }
  it('parses valid overview', () => {
    expect(Wave12OverviewSchema.parse(valid)).toMatchObject({ title: 'Visão Geral' })
  })
  it('rejects short rationale', () => {
    expect(() => Wave12OverviewSchema.parse({ ...valid, rationale: 'Short' })).toThrow(z.ZodError)
  })
  it('rejects empty isolationMechanisms', () => {
    expect(() => Wave12OverviewSchema.parse({ ...valid, isolationMechanisms: [] })).toThrow(z.ZodError)
  })
})

describe('Wave12ProblemSchema', () => {
  const valid = {
    title: 'Problema',
    currentState: 'Current CI pipeline is slow and unreliable with frequent cross-build contamination.',
    consequences: ['Slow feedback loops', 'Flaky test results'],
    costOfInaction: 'Continued developer productivity loss and unreliable test results.',
    constraints: ['Must work offline'],
  }
  it('parses valid problem', () => {
    expect(Wave12ProblemSchema.parse(valid)).toMatchObject({ title: 'Problema' })
  })
  it('defaults constraints to empty array', () => {
    const data = {
      title: 'P',
      currentState: 'Current state is problematic for the sandbox build environment.',
      consequences: ['Issue 1'],
      costOfInaction: 'Cost of not doing this work is significant productivity loss.',
    }
    const parsed = Wave12ProblemSchema.parse(data)
    expect(parsed.constraints).toEqual([])
  })
  it('rejects empty consequences', () => {
    expect(() => Wave12ProblemSchema.parse({ ...valid, consequences: [] })).toThrow(z.ZodError)
  })
})

describe('Wave12DocumentationSchema', () => {
  const valid = {
    waveId: 'wave-12',
    waveTitle: 'Sandbox Build Local CI/CD Isolation',
    overview: {
      title: 'Visão Geral',
      rationale: 'Local CI/CD isolation reduces feedback loops and prevents cross-contamination across builds.',
      isolationMechanisms: ['Docker'],
      targetFlow: 'Trigger → isolated env → test → results.',
      integrationPoints: ['finish_task'],
    },
    problem: {
      title: 'Problema',
      currentState: 'Current pipeline has cross-build contamination issues affecting test reliability.',
      consequences: ['Flaky tests'],
      costOfInaction: 'Lost developer productivity.',
    },
    objectives: ['Achieve isolation', 'Fast feedback'],
    createdAt: '2026-06-06T12:00:00Z',
    createdBy: 'agent-graph-flow',
  }
  it('parses valid documentation', () => {
    expect(Wave12DocumentationSchema.parse(valid)).toMatchObject({ waveId: 'wave-12' })
  })
  it('accepts graphNodeId metadata', () => {
    const data = {
      ...valid,
      graphNodeId: 'node_34d2bd38fe32',
      metadata: { phase: 'ANALYZE', tags: ['sandbox'], isConsolidated: false },
    }
    expect(Wave12DocumentationSchema.parse(data)).toMatchObject({ graphNodeId: 'node_34d2bd38fe32' })
  })
  it('rejects invalid waveId', () => {
    expect(() => Wave12DocumentationSchema.parse({ ...valid, waveId: 'bad' })).toThrow(z.ZodError)
  })
  it('rejects invalid graphNodeId format', () => {
    expect(() => Wave12DocumentationSchema.parse({ ...valid, graphNodeId: 'invalid' })).toThrow(z.ZodError)
  })
})

// ─── wip-gate.schema.ts ──────────────────────────────────────────────────

describe('MultiAgentWipGate', () => {
  it('acquires first agent', () => {
    const gate = new MultiAgentWipGate()
    expect(gate.tryAcquire('agent_1', 'builder').acquired).toBe(true)
  })
  it('rejects duplicate agent', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('agent_1', 'builder')
    const result = gate.tryAcquire('agent_1', 'builder')
    expect(result.acquired).toBe(false)
    expect(result.reason).toContain('already')
  })
  it('rejects when role cap reached', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('a1', 'builder')
    const result = gate.tryAcquire('a2', 'builder')
    expect(result.acquired).toBe(false)
    expect(result.reason).toContain('WIP cap')
  })
  it('allows different roles simultaneously', () => {
    const gate = new MultiAgentWipGate()
    expect(gate.tryAcquire('a1', 'builder').acquired).toBe(true)
    expect(gate.tryAcquire('a2', 'explorer').acquired).toBe(true)
  })
  it('releases and re-acquires', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('a1', 'builder')
    gate.release('a1', 'builder')
    expect(gate.tryAcquire('a2', 'builder').acquired).toBe(true)
  })
  it('throws on release of unknown agent', () => {
    const gate = new MultiAgentWipGate()
    expect(() => gate.release('ghost', 'builder')).toThrow(/not found/)
  })
  it('reports active count per role', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('a1', 'builder')
    expect(gate.activeCount('builder')).toBe(1)
    expect(gate.activeCount('explorer')).toBe(0)
  })
  it('respects custom role capacity', () => {
    const gate = new MultiAgentWipGate({ roleCapacities: { explorer: 3 } })
    expect(gate.tryAcquire('e1', 'explorer').acquired).toBe(true)
    expect(gate.tryAcquire('e2', 'explorer').acquired).toBe(true)
    expect(gate.tryAcquire('e3', 'explorer').acquired).toBe(true)
    expect(gate.tryAcquire('e4', 'explorer').acquired).toBe(false)
  })
  it('lists active agents', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('a1', 'builder')
    gate.tryAcquire('a2', 'explorer')
    const active = gate.listActive()
    expect(active).toHaveLength(2)
  })
  it('totalActive returns correct count', () => {
    const gate = new MultiAgentWipGate()
    expect(gate.totalActive()).toBe(0)
    gate.tryAcquire('a1', 'builder')
    expect(gate.totalActive()).toBe(1)
  })
  it('isActive checks specific agent', () => {
    const gate = new MultiAgentWipGate()
    gate.tryAcquire('a1', 'builder')
    expect(gate.isActive('a1')).toBe(true)
    expect(gate.isActive('a2')).toBe(false)
  })
})
