/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const RelationTypeSchema = z.enum([
  'parent_of',
  'child_of',
  'depends_on',
  'blocks',
  'related_to',
  'priority_over',
  'implements',
  'derived_from',
  // Game-specific / advanced relation types
  'provides',
  'consumes',
  'requires_asset',
  // Decomposition
  'decomposed_into',
  // Browser-test evidence edges (§EPIC-browser-harness Task 4.2)
  'tests',
  'validates_adr',
  'mirrors_unit',
])

export const GraphEdgeSchema = z.object({
  id: z.string().max(100),
  from: z.string().max(100),
  to: z.string().max(100),
  relationType: RelationTypeSchema,
  weight: z.number().min(0).max(1).optional(),
  reason: z.string().max(2000).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional(),
  createdAt: z.string(),
})
