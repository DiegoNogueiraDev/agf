/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

/**
 * Wave-12 SMART Goal Schema
 *
 * Represents a single measurable, achievable goal for Wave-12 Sandbox Build.
 * Enforces SMART criteria: Specific, Measurable, Achievable, Relevant, Time-bound.
 */
export const Wave12GoalSchema = z.object({
  /** Unique identifier for the goal (kebab-case, prefixed with "goal-") */
  id: z
    .string()
    .regex(/^goal-[a-z0-9-]+$/)
    .describe('e.g., goal-isolation-quality'),

  /** Short, action-oriented title of the goal */
  title: z.string().min(10).max(200).describe('e.g., Achieve 100% build validation isolation'),

  /** Medium-length description of what the goal accomplishes */
  description: z
    .string()
    .min(20)
    .max(1000)
    .describe('Why this goal matters and what impact it has on the sandbox sandbox.'),

  /** SPECIFIC dimension: exact, concrete, unambiguous target */
  specific: z.string().min(20).max(500).describe('Exactly what will be done and how, no vague language'),

  /** MEASURABLE dimension: quantifiable metric or success indicator */
  measurable: z.string().min(10).max(500).describe('How success is measured (e.g., 0 incidents, 95% parity)'),

  /** ACHIEVABLE dimension: realistic given constraints and resources */
  achievable: z.string().min(10).max(500).describe('How the goal will be accomplished with available means'),

  /** RELEVANT dimension: alignment with project/business objectives */
  relevant: z.string().min(10).max(500).describe('Why this goal matters for Wave-12 and mcp-graph'),

  /** TIME-BOUND dimension: explicit deadline or quarter */
  timebound: z.string().min(4).max(50).describe('When the goal must be achieved (e.g., Q2 2026, 2026-06-30)'),

  /** Category of the goal for grouping and analysis */
  category: z.enum([
    'isolation_quality',
    'feedback_loop_speed',
    'test_reliability',
    'local_fidelity',
    'cost_reduction',
  ]),

  /** Target numeric value for measurable dimension */
  targetValue: z.string().min(1).max(20).optional().describe('Numeric target (e.g., 95, 120, 100)'),

  /** Unit of measurement for targetValue */
  unit: z.string().min(1).max(50).optional().describe('e.g., percent, seconds, builds, incidents'),

  /** ISO 8601 deadline timestamp */
  deadline: z.string().datetime().optional().describe('e.g., 2026-06-30T23:59:59Z'),
})

export type Wave12Goal = z.infer<typeof Wave12GoalSchema>

/**
 * Wave-12 Goals Collection Schema
 *
 * Consolidates all SMART goals for Wave-12 in a single validated structure.
 * Enforces minimum of 4 goals covering the five key dimensions.
 */
export const Wave12GoalsSchema = z.object({
  /** Wave identifier (e.g., "wave-12") */
  waveId: z
    .string()
    .regex(/^wave-\d+$/)
    .describe('e.g., wave-12'),

  /** Array of SMART goals; minimum 4 required */
  goals: z
    .array(Wave12GoalSchema)
    .min(4)
    .describe('Minimum 4 goals covering isolation, feedback, reliability, fidelity, cost'),

  /** Description of the goals section and its strategic intent */
  description: z.string().min(10).max(1000).describe('Narrative explaining the goals and how they interconnect'),

  /** Optional reference to the graph node (Epic) for these goals */
  graphNodeId: z
    .string()
    .regex(/^node_[a-f0-9]{12}$/)
    .optional()
    .describe('e.g., node_ec6945f114a8'),

  /** Metadata for RAG indexing and lifecycle tracking */
  metadata: z
    .object({
      phase: z
        .enum(['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING'])
        .optional(),
      tags: z.array(z.string().min(1).max(100)).optional(),
      isConsolidated: z.boolean().default(false),
      sourceFile: z.string().optional(),
    })
    .optional(),

  /** ISO 8601 timestamp when goals were documented */
  createdAt: z.string().datetime(),

  /** Agent or user who created the goals */
  createdBy: z.string().min(1).max(100),
})

export type Wave12Goals = z.infer<typeof Wave12GoalsSchema>

/**
 * Wave-12 Out-of-Scope Item Schema
 *
 * Represents a single item explicitly excluded from Wave-12 scope.
 * Includes rationale and affected task references for clarity.
 */
export const Wave12OutOfScopeItemSchema = z.object({
  /** Unique identifier for the out-of-scope item */
  id: z
    .string()
    .regex(/^oos-[a-z0-9-]+$/)
    .describe('e.g., oos-remote-ci'),

  /** Short title of what is NOT in scope */
  title: z.string().min(10).max(200).describe('What is being excluded (e.g., Replace remote CI pipeline)'),

  /** Detailed description of the excluded capability or responsibility */
  description: z.string().min(20).max(1000).describe('Clear statement of what the sandbox will NOT do'),

  /** Rationale for exclusion: why this is not part of Wave-12 MVP */
  rationale: z
    .string()
    .min(20)
    .max(1000)
    .describe('Business, technical, or scope reasons for exclusion (e.g., complexity, cost, timing)'),

  /** Array of task IDs that might be affected by this boundary */
  affectedBy: z
    .array(z.string().min(1).max(100))
    .optional()
    .describe('e.g., [task-finish-with-quality-gates, task-ci-integration]'),

  /** Type of out-of-scope boundary */
  type: z.enum([
    'infrastructure_replacement',
    'deployment_scope',
    'technology_scope',
    'business_constraint',
    'performance_requirement',
    'compliance_requirement',
    'integration_scope',
  ]),
})

export type Wave12OutOfScopeItem = z.infer<typeof Wave12OutOfScopeItemSchema>

/**
 * Wave-12 Out-of-Scope Collection Schema
 *
 * Consolidates all out-of-scope items for Wave-12 in a single validated structure.
 * Enforces minimum of 3 items for clear boundary definition.
 */
export const Wave12OutOfScopeSchema = z.object({
  /** Wave identifier (e.g., "wave-12") */
  waveId: z
    .string()
    .regex(/^wave-\d+$/)
    .describe('e.g., wave-12'),

  /** Array of out-of-scope items; minimum 3 required */
  items: z.array(Wave12OutOfScopeItemSchema).min(3).describe('Minimum 3 items explicitly excluded from scope'),

  /** Description of the out-of-scope section and its boundary context */
  description: z.string().min(10).max(1000).describe('Narrative explaining what Wave-12 does NOT include and why'),

  /** Optional reference to the graph node (Epic) for out-of-scope items */
  graphNodeId: z
    .string()
    .regex(/^node_[a-f0-9]{12}$/)
    .optional()
    .describe('e.g., node_44c789736369'),

  /** Metadata for RAG indexing and lifecycle tracking */
  metadata: z
    .object({
      phase: z
        .enum(['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING'])
        .optional(),
      tags: z.array(z.string().min(1).max(100)).optional(),
      isConsolidated: z.boolean().default(false),
      sourceFile: z.string().optional(),
    })
    .optional(),

  /** ISO 8601 timestamp when out-of-scope items were documented */
  createdAt: z.string().datetime(),

  /** Agent or user who created the out-of-scope list */
  createdBy: z.string().min(1).max(100),
})

export type Wave12OutOfScope = z.infer<typeof Wave12OutOfScopeSchema>

/**
 * Wave-12 Overview (Visão Geral) Schema
 *
 * Captures the strategic rationale, isolation mechanisms, and integration
 * points for the Sandbox Build local CI/CD isolation feature.
 */
export const Wave12OverviewSchema = z.object({
  /** Section title, typically "Visão Geral" */
  title: z.string().min(1).max(200),

  /** Business/technical rationale for the sandbox isolation approach */
  rationale: z.string().min(10).max(2000),

  /** Array of isolation mechanisms (Docker, Podman, Process, etc) */
  isolationMechanisms: z.array(z.string().min(1).max(200)).min(1),

  /** Target flow description: how the sandbox reduces feedback loops */
  targetFlow: z.string().min(10).max(1000),

  /** Integration points with existing mcp-graph systems */
  integrationPoints: z
    .array(z.string().min(1).max(100))
    .min(1)
    .describe('e.g., finish_task, qualityGates, constitution, harness_remediate'),
})

export type Wave12Overview = z.infer<typeof Wave12OverviewSchema>

/**
 * Wave-12 Problem Statement (Problema) Schema
 *
 * Articulates current pain points, consequences, and constraints
 * that the sandbox solution addresses.
 */
export const Wave12ProblemSchema = z.object({
  /** Section title, typically "Problema" */
  title: z.string().min(1).max(200),

  /** Description of current problematic state */
  currentState: z.string().min(10).max(2000),

  /**
   * Array of consequences stemming from the problem.
   * Must have at least one to justify the work.
   */
  consequences: z.array(z.string().min(1).max(500)).min(1),

  /** Cost of inaction: what happens if we do nothing */
  costOfInaction: z.string().min(10).max(1000),

  /** Out-of-scope or boundary constraints */
  constraints: z.array(z.string().min(1).max(500)).default([]),
})

export type Wave12Problem = z.infer<typeof Wave12ProblemSchema>

/**
 * Wave-12 Complete Documentation Schema
 *
 * Consolidates Overview + Problem + objectives in a single,
 * Zod-validated structure ready for graph persistence and RAG indexing.
 */
export const Wave12DocumentationSchema = z.object({
  /** Wave identifier (e.g., "wave-12") */
  waveId: z
    .string()
    .regex(/^wave-\d+$/)
    .describe('e.g., wave-12'),

  /** Human-readable wave title */
  waveTitle: z.string().min(1).max(500),

  /** Overview section with rationale and mechanisms */
  overview: Wave12OverviewSchema,

  /** Problem statement section */
  problem: Wave12ProblemSchema,

  /** Objectives derived from the problem and overview */
  objectives: z.array(z.string().min(1).max(500)),

  /** Optional reference to the graph node (Epic) for this wave */
  graphNodeId: z
    .string()
    .regex(/^node_[a-f0-9]{12}$/)
    .optional()
    .describe('e.g., node_34d2bd38fe32'),

  /** Metadata for RAG indexing and lifecycle tracking */
  metadata: z
    .object({
      phase: z
        .enum(['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE', 'REVIEW', 'HANDOFF', 'DEPLOY', 'LISTENING'])
        .optional(),
      tags: z.array(z.string().min(1).max(100)).optional(),
      isConsolidated: z.boolean().default(false),
      sourceFile: z.string().optional(),
    })
    .optional(),

  /** ISO 8601 timestamp when documentation was created */
  createdAt: z.string().datetime(),

  /** Agent or user who created the consolidation */
  createdBy: z.string().min(1).max(100),
})

export type Wave12Documentation = z.infer<typeof Wave12DocumentationSchema>
