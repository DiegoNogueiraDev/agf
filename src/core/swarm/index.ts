/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Swarm coordination — async multi-agent execution over the shared graph
 * ("parameter server"). Ported incrementally from graph-flow/core/swarm.
 */

export { AgentClaimManager, AgentClaimConflictError } from './agent-claim-manager.js'
export type { ClaimResult } from './agent-claim-manager.js'

export { A2AMailbox } from './a2a-mailbox.js'
export type { A2AMessage, A2AStatus, A2AMailboxOptions, A2ASendInput } from './a2a-mailbox.js'

export { computeMajorityConsensus, majorityThreshold, tallyVotes } from './consensus/majority.js'
export type { Vote, ConsensusResult } from './consensus/majority.js'

export { SwarmCoordinator } from './swarm-coordinator.js'
export type { SwarmSession } from './swarm-coordinator.js'
export {
  TopologySchema,
  ConsensusKindSchema,
  AgentRoleSchema,
  ConflictStrategySchema,
  SwarmConfigSchema,
} from './swarm-types.js'
export type {
  Topology,
  ConsensusKind,
  AgentRole,
  ConflictStrategy,
  SwarmConfig,
  SwarmConfigInput,
} from './swarm-types.js'
