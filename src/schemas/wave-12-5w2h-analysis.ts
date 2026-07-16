/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Wave-12 5W2H Analysis Schema
 *
 * Strategic planning schema for Sandbox Build initiative covering:
 * - Why: Strategic rationale
 * - What: Artifacts and deliverables
 * - Who: Stakeholders
 * - When: Timeline and phases
 * - Where: Execution environments
 * - How: Technical approach
 * - How Much: Cost and effort estimates
 *
 * Uses Zod v4 for runtime validation and type inference.
 */

import { z } from 'zod/v4'

/**
 * Why Dimension Schema
 * Captures strategic rationale, benefits, and risk mitigation
 */
export const Why5W2HSchema = z.object({
  rationale: z.string().min(10, 'Why rationale must be at least 10 characters'),
  benefits: z.array(z.string()).min(1, 'Must have at least 1 benefit'),
  risks_mitigated: z.array(z.string()).optional(),
})

/**
 * What Dimension Schema
 * Defines artifact, deliverables, and scope
 */
export const What5W2HSchema = z.object({
  artifact: z.string().min(5),
  deliverables: z.array(z.string()).min(1),
  scope: z.enum(['cli-tool', 'docker-podman', 'process-isolation', 'hybrid']),
})

/**
 * Stakeholder Schema (sub-component of Who)
 */
export const StakeholderSchema = z.object({
  role: z.string(),
  responsibilities: z.array(z.string()),
  count_estimate: z.number().int().positive().optional(),
})

/**
 * Who Dimension Schema
 * Identifies primary and secondary stakeholders
 */
export const Who5W2HSchema = z.object({
  primary_stakeholders: z.array(StakeholderSchema).min(1),
  secondary_stakeholders: z.array(StakeholderSchema).optional(),
})

/**
 * Phase Schema (sub-component of When)
 */
export const PhaseSchema = z.object({
  phase_name: z.enum([
    'ANALYZE',
    'DESIGN',
    'PLAN',
    'IMPLEMENT',
    'VALIDATE',
    'REVIEW',
    'HANDOFF',
    'DEPLOY',
    'LISTENING',
  ]),
  duration_weeks: z.number().positive(),
  dependencies: z.array(z.string()).optional(),
})

/**
 * When Dimension Schema
 * Defines timeline phases and milestones
 */
export const When5W2HSchema = z.object({
  timeline_phases: z.array(PhaseSchema).min(1),
  total_duration_weeks: z.number().positive(),
  critical_milestone: z.string(),
})

/**
 * Environment Schema (sub-component of Where)
 */
export const EnvironmentSchema = z.object({
  name: z.enum(['local', 'ci-pipeline', 'team-machines', 'cloud-sandbox']),
  purpose: z.string(),
  access_requirements: z.array(z.string()).optional(),
})

/**
 * Where Dimension Schema
 * Specifies execution environments
 */
export const Where5W2HSchema = z.object({
  execution_environments: z.array(EnvironmentSchema).min(1),
  primary_environment: z.enum(['local', 'ci-pipeline', 'team-machines', 'cloud-sandbox']),
})

/**
 * Architecture Tier Schema (sub-component of How)
 */
export const ArchitectureTierSchema = z.object({
  name: z.string(),
  responsibility: z.string(),
  technology_stack: z.array(z.string()),
})

/**
 * How Dimension Schema
 * Defines approach, architecture, mechanisms, and fallbacks
 */
export const How5W2HSchema = z.object({
  approach: z.string(),
  architecture_tiers: z.array(ArchitectureTierSchema).min(1),
  key_mechanisms: z.array(z.string()).min(1),
  fallback_strategies: z.array(z.string()).optional(),
})

/**
 * Incremental Phase Schema (sub-component of How Much)
 */
export const IncrementalPhaseSchema = z.object({
  phase: z.string(),
  effort_weeks: z.number().positive(),
  scope: z.string(),
})

/**
 * How Much Dimension Schema
 * Captures cost, effort, team size, and resource requirements
 */
export const HowMuch5W2HSchema = z.object({
  cost_summary: z.object({
    development_effort_person_weeks: z.number().positive(),
    infrastructure_cost_usd_monthly: z.number().nonnegative().optional(),
    maintenance_effort_percent: z.number().min(0).max(100),
  }),
  team_size: z.object({
    developers: z.number().int().nonnegative(),
    qa_engineers: z.number().int().nonnegative(),
    devops_infra: z.number().int().nonnegative(),
  }),
  resource_requirements: z.object({
    compute_hours_per_week: z.number().positive(),
    storage_gb: z.number().positive(),
    concurrent_executions: z.number().int().positive(),
  }),
  incremental_phases: z.array(IncrementalPhaseSchema),
})

/**
 * Complete 5W2H Analysis Schema
 * Combines all 7 dimensions into a single coherent document
 */
export const Wave125W2HAnalysisSchema = z.object({
  initiative_id: z.string().min(5),
  initiative_name: z.string(),
  created_at: z.string().datetime(),
  last_updated: z.string().datetime(),
  why: Why5W2HSchema,
  what: What5W2HSchema,
  who: Who5W2HSchema,
  when: When5W2HSchema,
  where: Where5W2HSchema,
  how: How5W2HSchema,
  how_much: HowMuch5W2HSchema,
})

/**
 * TypeScript type inference from Zod schema
 * Provides full type safety and IDE autocomplete
 */
export type Wave125W2HAnalysis = z.infer<typeof Wave125W2HAnalysisSchema>

/**
 * Individual dimension types for modular access
 */
export type Why5W2H = z.infer<typeof Why5W2HSchema>
export type What5W2H = z.infer<typeof What5W2HSchema>
export type Who5W2H = z.infer<typeof Who5W2HSchema>
export type When5W2H = z.infer<typeof When5W2HSchema>
export type Where5W2H = z.infer<typeof Where5W2HSchema>
export type How5W2H = z.infer<typeof How5W2HSchema>
export type HowMuch5W2H = z.infer<typeof HowMuch5W2HSchema>

/**
 * Validate 5W2H analysis document
 * @param data Raw data to validate
 * @returns Validated data or error details
 */
export function validateWave125W2HAnalysis(
  data: unknown,
): { valid: true; data: Wave125W2HAnalysis } | { valid: false; errors: string[] } {
  const resultValue = Wave125W2HAnalysisSchema.safeParse(data)

  if (resultValue.success) {
    return { valid: true, data: resultValue.data }
  }

  const errors = resultValue.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  return { valid: false, errors }
}
