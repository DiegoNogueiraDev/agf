/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Reviewer validation schemas — Zod boundary validation for MCP tool inputs.
 */

import { z } from 'zod/v4'

export const ReviewInputSchema = z.object({
  includeHarness: z.boolean().optional(),
  minCompletionRate: z.number().min(0).max(100).optional(),
})

export type ValidatedReviewInput = z.infer<typeof ReviewInputSchema>

/** validateReviewInput —  */
export function validateReviewInput(input: unknown): ValidatedReviewInput {
  return ReviewInputSchema.parse(input)
}
