import { describe, it, expect } from 'vitest'
import {
  TopologySchema,
  ConsensusKindSchema,
  AgentRoleSchema,
  ConflictStrategySchema,
} from '../core/swarm/swarm-types.js'

describe('TopologySchema', () => {
  it('accepts all topologies', () => {
    for (const t of ['hierarchical', 'mesh', 'ring', 'star']) {
      expect(TopologySchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown topology', () => {
    expect(TopologySchema.safeParse('tree').success).toBe(false)
  })
})

describe('ConsensusKindSchema', () => {
  it('accepts raft and majority', () => {
    expect(ConsensusKindSchema.safeParse('raft').success).toBe(true)
    expect(ConsensusKindSchema.safeParse('majority').success).toBe(true)
  })
})

describe('AgentRoleSchema', () => {
  it('accepts all agent roles', () => {
    for (const r of ['queen', 'worker', 'coordinator', 'observer']) {
      expect(AgentRoleSchema.safeParse(r).success).toBe(true)
    }
  })

  it('rejects unknown role', () => {
    expect(AgentRoleSchema.safeParse('leader').success).toBe(false)
  })
})

describe('ConflictStrategySchema', () => {
  it('accepts all conflict strategies', () => {
    for (const s of ['last_wins', 'first_wins', 'error']) {
      expect(ConflictStrategySchema.safeParse(s).success).toBe(true)
    }
  })
})
