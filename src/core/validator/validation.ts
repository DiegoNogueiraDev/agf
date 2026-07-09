/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Validator validation schemas — Zod boundary validation for MCP tool inputs.
 */

import { z } from 'zod/v4'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'validator/validation.ts' })

export const ValidationInputSchema = z.object({
  action: z.enum(['ac', 'dor', 'dod', 'integrity', 'flow']).optional(),
  nodeId: z.string().optional(),
  strict: z.boolean().optional(),
})

export type ValidatedValidationInput = z.infer<typeof ValidationInputSchema>

/** validateValidationInput —  */
export function validateValidationInput(input: unknown): ValidatedValidationInput {
  return ValidationInputSchema.parse(input)
}
