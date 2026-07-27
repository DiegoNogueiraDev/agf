/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Designer validation schemas — Zod boundary validation for MCP tool inputs.
 */

import { z } from 'zod/v4'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'designer/validation.ts' })

export const DesignInputSchema = z.object({
  scope: z.enum(['full', 'incremental']).optional(),
  includeTraceability: z.boolean().optional(),
  includeCoupling: z.boolean().optional(),
})

export type ValidatedDesignInput = z.infer<typeof DesignInputSchema>

/** validateDesignInput —  */
export function validateDesignInput(input: unknown): ValidatedDesignInput {
  return DesignInputSchema.parse(input)
}
