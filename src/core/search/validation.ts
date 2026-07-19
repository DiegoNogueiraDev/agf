/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Search validation schemas — Zod boundary validation for MCP tool inputs.
 */

import { z } from 'zod/v4'

export const SearchQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  type: z.string().optional(),
  status: z.string().optional(),
})

export type ValidatedSearchQuery = z.infer<typeof SearchQuerySchema>

/** validateSearchQuery —  */
export function validateSearchQuery(input: unknown): ValidatedSearchQuery {
  return SearchQuerySchema.parse(input)
}
