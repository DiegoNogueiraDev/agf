/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Swarm types — config schema + enums for multi-agent topologies.
 * Ported from graph-flow/core/swarm/swarm-types.ts.
 */

import { z } from 'zod/v4'

export const TopologySchema = z.enum(['hierarchical', 'mesh', 'ring', 'star'])
export type Topology = z.infer<typeof TopologySchema>

export const ConsensusKindSchema = z.enum(['raft', 'majority'])
export type ConsensusKind = z.infer<typeof ConsensusKindSchema>

export const AgentRoleSchema = z.enum(['queen', 'worker', 'coordinator', 'observer'])
export type AgentRole = z.infer<typeof AgentRoleSchema>

export const ConflictStrategySchema = z.enum(['last_wins', 'first_wins', 'error'])
export type ConflictStrategy = z.infer<typeof ConflictStrategySchema>

export const SwarmConfigSchema = z.object({
  topology: TopologySchema,
  consensus: ConsensusKindSchema,
  maxAgents: z.number().int().min(1).max(32),
  strategy: z.string().default('specialized'),
  /** How to handle parallel agents writing to the same output key. Default: last_wins. */
  conflictStrategy: ConflictStrategySchema.default('last_wins'),
})
export type SwarmConfig = z.infer<typeof SwarmConfigSchema>
/** Input type — fields with defaults (strategy, conflictStrategy) are optional. */
export type SwarmConfigInput = z.input<typeof SwarmConfigSchema>
