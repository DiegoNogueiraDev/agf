/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const PipelineStepSchema = z.object({
  tool: z.string().min(1).describe('Name of the MCP tool to call'),
  args: z.record(z.string(), z.unknown()).default({}).describe('Arguments to pass to the tool'),
  extractField: z.string().optional().describe('Field to extract from result and pass to next step'),
})

export type PipelineStep = z.infer<typeof PipelineStepSchema>

export const PipelineStepResultSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  tool: z.string(),
  status: z.enum(['success', 'error', 'skipped']),
  result: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
})

export type PipelineStepResult = z.infer<typeof PipelineStepResultSchema>

export const PipelineResultSchema = z.object({
  ok: z.boolean(),
  stepsTotal: z.number().int().nonnegative(),
  stepsCompleted: z.number().int().nonnegative(),
  stepsFailed: z.number().int().nonnegative(),
  stepsSkipped: z.number().int().nonnegative(),
  steps: z.array(PipelineStepResultSchema),
  finalResult: z.unknown().optional(),
  totalDurationMs: z.number().int().nonnegative(),
})

export type PipelineResult = z.infer<typeof PipelineResultSchema>
