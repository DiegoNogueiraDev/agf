/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Deployer validation schemas — Zod boundary validation for MCP tool inputs.
 */

import { z } from 'zod/v4'

export const DeployOptionsSchema = z.object({
  hasSnapshots: z.boolean().optional(),
  knowledgeCount: z.number().int().min(0).optional(),
})

export type ValidatedDeployOptions = z.infer<typeof DeployOptionsSchema>

/** validateDeployOptions —  */
export function validateDeployOptions(input: unknown): ValidatedDeployOptions {
  return DeployOptionsSchema.parse(input)
}
