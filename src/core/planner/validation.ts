/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Planner validation schemas — Zod boundary validation for MCP tool inputs.
 */

import { z } from 'zod/v4'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'planner/validation.ts' })

export const NextTaskInputSchema = z.object({
  lockedTaskIds: z.array(z.string()).optional(),
  agentId: z.string().optional(),
})

export const SprintPlanInputSchema = z.object({
  sprintName: z.string().min(1),
  maxTasks: z.number().int().min(1).max(100).optional(),
  targetVelocity: z.number().min(0).optional(),
})

export type ValidatedNextTaskInput = z.infer<typeof NextTaskInputSchema>
export type ValidatedSprintPlanInput = z.infer<typeof SprintPlanInputSchema>

/** validateNextTaskInput —  */
export function validateNextTaskInput(input: unknown): ValidatedNextTaskInput {
  return NextTaskInputSchema.parse(input)
}

/** validateSprintPlanInput —  */
export function validateSprintPlanInput(input: unknown): ValidatedSprintPlanInput {
  return SprintPlanInputSchema.parse(input)
}
