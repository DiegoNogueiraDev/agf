/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Kanban validation schemas — Zod boundary validation for MCP tool inputs.
 */

import { z } from 'zod/v4'

export const KanbanInputSchema = z.object({
  sprintId: z.string().optional(),
  columns: z.array(z.string()).optional(),
  groupBy: z.enum(['status', 'priority', 'type', 'sprint']).optional(),
})

export type ValidatedKanbanInput = z.infer<typeof KanbanInputSchema>

/** validateKanbanInput —  */
export function validateKanbanInput(input: unknown): ValidatedKanbanInput {
  return KanbanInputSchema.parse(input)
}
