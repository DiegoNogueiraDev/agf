/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Session/runtime layer Zod schemas (v4). The unified `Session` is a composed
 * read-model assembled from existing stores — it wraps, never duplicates, the
 * thread/mode/model types that already exist elsewhere in the codebase.
 *
 * NOTE: deliberately named `session` (not `harness`) — `harness` is the
 * agent-readiness quality-scoring feature (src/core/harness/). This layer must
 * never import from or shadow that module.
 */

import { z } from 'zod/v4'

// Inlined to avoid schemas/ → core/ dependency direction violation.
// Keep in sync with BudgetScope in src/core/llm/types.ts.
export const BudgetScopeSchema = z.object({
  scope: z.enum(['cell', 'run', 'project', 'session']),
  scopeId: z.string().optional(),
  currentUsd: z.number().nonnegative(),
  capUsd: z.number().nonnegative(),
})

// Inlined to avoid schemas/ → core/ dependency direction violation.
// Keep in sync with PermissionMode in src/core/worker-state/worker-state-schema.ts.
export const PermissionModeSchema = z.enum(['read-only', 'workspace-write', 'danger-full-access'])

/**
 * Canonical agent roles for the session identity. Mirrors the literal values of
 * `AgentRole` in src/core/harness/agent-role.ts WITHOUT importing it (the
 * harness module is the quality feature and must stay decoupled from here).
 */
export const SessionAgentRoleSchema = z.enum(['implementor', 'reviewer', 'validator'])
export type SessionAgentRole = z.infer<typeof SessionAgentRoleSchema>

/**
 * Who the session belongs to. Unifies the identity fields that are scattered
 * today: `sessionId` (hooks/session-lifecycle), `workerId` (worker-state),
 * `agentRole` (thread-store, free-form there but constrained here), and the
 * `workspace` cwd.
 */
export const SessionIdentitySchema = z.object({
  sessionId: z.string().min(1).describe('Session UUID minted by the lifecycle layer'),
  workerId: z.string().min(1).describe('Worker identifier from worker-state'),
  agentRole: SessionAgentRoleSchema.nullable().describe('Role the agent is playing, or null if unassigned'),
  workspace: z.string().min(1).describe('Absolute workspace directory (cwd)'),
})
export type SessionIdentity = z.infer<typeof SessionIdentitySchema>

/** A budget scoped to a single run — reuses BudgetScope but pins `scope:'run'`. */
export const RunBudgetSchema = BudgetScopeSchema.refine((b) => b.scope === 'run', {
  message: 'Run budget must have scope:"run"',
})
export type RunBudget = z.infer<typeof RunBudgetSchema>

export const RunStatusSchema = z.enum(['pending', 'active', 'paused', 'completed', 'failed'])
export type RunStatus = z.infer<typeof RunStatusSchema>

/** A first-class run: lifecycle status, timestamps, and an embedded run budget. */
export const RunSchema = z.object({
  runId: z.string().min(1).describe('Run identifier (reuses CallContext.runId)'),
  status: RunStatusSchema.describe('Lifecycle status'),
  startedAt: z.number().int().nonnegative().describe('Epoch ms when the run was created'),
  endedAt: z.number().int().nonnegative().nullable().describe('Epoch ms when the run reached a terminal state'),
  budget: RunBudgetSchema.describe('Token/cost budget for this run'),
})
export type Run = z.infer<typeof RunSchema>

/** Capability classes — mirrors `ToolCapability` in src/core/permissions/enforcer.ts. */
export const GrantCapabilitySchema = z.enum(['read', 'write', 'shell', 'network'])
export type GrantCapability = z.infer<typeof GrantCapabilitySchema>

/** Approval severity — mirrors `ApprovalSeverity` in src/core/approval/approval-patterns.ts. */
export const GrantSeveritySchema = z.enum(['critical', 'high', 'medium', 'low'])
export type GrantSeverity = z.infer<typeof GrantSeveritySchema>

/** The approval verdict bundled into a grant (shape of `ApprovalCheckResult`). */
export const GrantApprovalSchema = z.object({
  requires_approval: z.boolean(),
  severity: GrantSeveritySchema,
  reason: z.string(),
  matchedPatterns: z.array(z.string()),
})
export type GrantApproval = z.infer<typeof GrantApprovalSchema>

/** A single grant: an enforcer verdict for a capability plus its approval status. */
export const GrantSchema = z.object({
  capability: GrantCapabilitySchema,
  verdict: z.enum(['allow', 'deny']),
  reason: z.string().describe('Deny reason from the enforcer, or empty when allowed'),
  approval: GrantApprovalSchema,
})
export type Grant = z.infer<typeof GrantSchema>

export const GrantsSchema = z.array(GrantSchema)
export type Grants = z.infer<typeof GrantsSchema>

/**
 * Projection of `StoredThread` (src/core/thread-store/thread-store.ts) — only
 * the load-bearing fields the session layer needs. Intentionally NOT the full
 * thread: `StoredThread` is a TS interface, and re-deriving it here would drift.
 */
export const SessionThreadRefSchema = z.object({
  id: z.string().min(1),
  model: z.string().nullable(),
  modelProvider: z.string(),
  cwd: z.string(),
  agentRole: z.string().nullable(),
})
export type SessionThreadRef = z.infer<typeof SessionThreadRefSchema>

/** The active model for the session — id + provider, with the optional router tier. */
export const SessionModelSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  tier: z.string().optional(),
})
export type SessionModel = z.infer<typeof SessionModelSchema>

/**
 * A command flowing DOWN from the application into the agent loop (the
 * diagram's `comandos ↓`). Discriminated on `type`.
 */
export const SessionCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_mode'), mode: PermissionModeSchema }),
  z.object({ type: z.literal('approve'), requestId: z.string().min(1) }),
  z.object({ type: z.literal('interrupt') }),
  z.object({ type: z.literal('send_message'), text: z.string().min(1) }),
])
export type SessionCommand = z.infer<typeof SessionCommandSchema>

/** A subagent the harness tracks (the diagram's HARNESS → subagents). */
export const SubagentStatusSchema = z.enum(['idle', 'active', 'done', 'failed'])
export type SubagentStatus = z.infer<typeof SubagentStatusSchema>

export const SubagentSchema = z.object({
  id: z.string().min(1),
  // Free string: real subagents (swarm roles like coordinator/worker) are not
  // limited to the session's implementor/reviewer/validator triad.
  role: z.string().min(1),
  status: SubagentStatusSchema,
  model: z.string().nullable(),
})
export type Subagent = z.infer<typeof SubagentSchema>

export const SubagentsSchema = z.array(SubagentSchema)
export type Subagents = z.infer<typeof SubagentsSchema>

/**
 * Harness-level config the session runs under (the diagram's HARNESS → config):
 * active preset, provider, optional pinned model, and runtime flags.
 */
export const SessionConfigSchema = z.object({
  preset: z.string().min(1).describe('Active workflow preset (default, strict-tdd, …)'),
  provider: z.string().min(1).describe('Active LLM provider id'),
  modelPin: z.string().nullable().describe('Pinned model id, or null for tier-router auto'),
  flags: z.record(z.string(), z.union([z.boolean(), z.string()])).describe('Runtime flags (ai, quiet, …)'),
})
export type SessionConfig = z.infer<typeof SessionConfigSchema>

/**
 * The unified session/runtime read-model. Composes the six diagram fields,
 * wrapping existing types rather than duplicating them.
 */
export const SessionSchema = z.object({
  identity: SessionIdentitySchema,
  thread: SessionThreadRefSchema,
  mode: PermissionModeSchema,
  model: SessionModelSchema,
  run: RunSchema.nullable(),
  grants: GrantsSchema,
})
export type Session = z.infer<typeof SessionSchema>
