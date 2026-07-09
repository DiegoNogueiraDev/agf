/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Graph validation schemas — Zod boundary validation for MCP tool inputs.
 */

import { z } from 'zod/v4'

export const HealthScanInputSchema = z.object({
  projectId: z.string().min(1).optional(),
  includeCategories: z
    .array(z.enum(['cycle', 'orphan', 'stuck', 'oversized', 'broken_dep', 'status_violation', 'done_violation']))
    .optional(),
})

export const MermaidExportInputSchema = z.object({
  direction: z.enum(['TB', 'LR', 'BT', 'RL']).optional(),
  includeEdgeLabels: z.boolean().optional(),
})

export type ValidatedHealthScanInput = z.infer<typeof HealthScanInputSchema>
export type ValidatedMermaidExportInput = z.infer<typeof MermaidExportInputSchema>

/** validateHealthScanInput —  */
export function validateHealthScanInput(input: unknown): ValidatedHealthScanInput {
  return HealthScanInputSchema.parse(input)
}

/** validateMermaidExportInput —  */
export function validateMermaidExportInput(input: unknown): ValidatedMermaidExportInput {
  return MermaidExportInputSchema.parse(input)
}
